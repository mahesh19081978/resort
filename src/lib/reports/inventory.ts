/**
 * Reports & Analytics — Inventory Report Service
 *
 * METRIC DEFINITIONS:
 * - Stock movements are the authoritative ledger
 * - Stock valuation uses current Stock.quantityOnHand * WAC per item
 * - Historical valuation would need historical WAC (not implemented here, uses current)
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType } from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';

export interface InventoryReportSummary {
  totalItems: number;
  totalStockValue: Prisma.Decimal;
  lowStockItems: number;
  outOfStockItems: number;
  totalStores: number;
  movementsInPeriod: number;
}

export interface StockByStore {
  store: string;
  itemCount: number;
  totalValue: Prisma.Decimal;
}

export interface StockMovementSummary {
  movementType: string;
  count: number;
  totalQuantity: number;
}

export interface LowStockItem {
  itemName: string;
  store: string;
  currentStock: Prisma.Decimal;
  reorderLevel: Prisma.Decimal;
  unit: string;
}

export interface InventoryReportData {
  summary: InventoryReportSummary;
  byStore: StockByStore[];
  movementSummary: StockMovementSummary[];
  lowStockItems: LowStockItem[];
  hasData: boolean;
}

export async function getInventoryReport(
  periodRange: ResolvedPeriodRange
): Promise<InventoryReportData> {
  const { current } = periodRange;

  // Total items
  const totalItems = await prisma.inventoryItem.count({ where: { isActive: true } });

  // Total stores
  const totalStores = await prisma.store.count({ where: { isActive: true } });

  // Stock valuation (standard cost * quantity)
  const stocks = await prisma.stock.findMany({
    where: { quantityOnHand: { gt: 0 } },
    select: {
      quantityOnHand: true,
      store: { select: { name: true } },
      item: { select: { name: true, standardCost: true } },
    },
  });

  let totalStockValue = new Prisma.Decimal(0);
  const storeValues: Record<string, { itemCount: number; totalValue: Prisma.Decimal }> = {};

  for (const stock of stocks) {
    const value = stock.quantityOnHand.times(stock.item.standardCost);
    totalStockValue = totalStockValue.plus(value);

    const storeName = stock.store?.name || 'Unknown';
    if (!storeValues[storeName]) storeValues[storeName] = { itemCount: 0, totalValue: new Prisma.Decimal(0) };
    storeValues[storeName].itemCount++;
    storeValues[storeName].totalValue = storeValues[storeName].totalValue.plus(value);
  }

  const byStore: StockByStore[] = Object.entries(storeValues).map(([store, data]) => ({
    store,
    itemCount: data.itemCount,
    totalValue: data.totalValue,
  }));

  // Low stock items
  const allItems = await prisma.inventoryItem.findMany({
    where: { isActive: true, reorderLevel: { gt: 0 } },
    select: {
      name: true,
      reorderLevel: true,
      baseUnit: { select: { code: true } },
      stocks: {
        select: {
          quantityOnHand: true,
          store: { select: { name: true } },
        },
      },
    },
  });

  const lowStockItems: LowStockItem[] = [];
  let outOfStockCount = 0;

  for (const item of allItems) {
    for (const stock of item.stocks) {
      if (stock.quantityOnHand.lte(item.reorderLevel)) {
        lowStockItems.push({
          itemName: item.name,
          store: stock.store?.name || 'Unknown',
          currentStock: stock.quantityOnHand,
          reorderLevel: item.reorderLevel,
          unit: item.baseUnit?.code || 'units',
        });
      }
      if (stock.quantityOnHand.lte(0)) outOfStockCount++;
    }
  }

  // Movements in period
  const movements = await prisma.stockMovement.groupBy({
    by: ['movementType'],
    where: {
      movementDate: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
    _count: true,
    _sum: { quantity: true },
  });

  const movementSummary: StockMovementSummary[] = movements.map((m) => ({
    movementType: m.movementType.replace(/_/g, ' '),
    count: m._count,
    totalQuantity: Number(m._sum.quantity || 0),
  }));

  const movementsInPeriod = movementSummary.reduce((sum, m) => sum + m.count, 0);

  return {
    summary: {
      totalItems,
      totalStockValue,
      lowStockItems: lowStockItems.length,
      outOfStockItems: outOfStockCount,
      totalStores,
      movementsInPeriod,
    },
    byStore,
    movementSummary,
    lowStockItems: lowStockItems.slice(0, 20),
    hasData: totalItems > 0,
  };
}

export async function getInventoryMovementRows(
  periodRange: ResolvedPeriodRange,
  page: number = 1,
  pageSize: number = 20,
  movementType?: string,
  storeId?: string
) {
  const { current } = periodRange;
  const skip = (page - 1) * pageSize;

  const where: Prisma.StockMovementWhereInput = {
    movementDate: { gte: current.startTimestamp, lt: current.endTimestamp },
    ...(movementType ? { movementType: movementType as StockMovementType } : {}),
    ...(storeId ? { storeId } : {}),
  };

  const [rows, totalRecords] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: {
        id: true,
        movementNumber: true,
        movementType: true,
        quantity: true,
        unitCost: true,
        totalCost: true,
        balanceAfter: true,
        remarks: true,
        movementDate: true,
        store: { select: { name: true } },
        item: { select: { name: true } },
      },
      orderBy: { movementDate: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    rows,
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
    },
  };
}
