import { prisma } from '@/lib/db/prisma';
import { TransferStatus, StockMovementType } from '@prisma/client';
import { OUTBOUND_MOVEMENT_TYPES } from '@/lib/inventory/stock-ledger-service';
import { getBusinessDateNow, getBusinessDayTimestampRange } from './date';

export interface InventoryMetrics {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingTransfers: number;
  transfersInTransit: number;
  todayReceiptsCount: number;
  todayIssuesCount: number;
}

/**
 * Authoritative Inventory and Stock Ledger metrics.
 *
 * Rules:
 * 1. Low stock is dynamically derived from InventoryItem.reorderLevel (reorderLevel > 0 and stock <= reorderLevel).
 * 2. Out of stock is active items where currentStockTotal <= 0.
 * 3. Pending transfers include DRAFT, APPROVED, and PENDING_DISPATCH.
 * 4. Transfers in transit are strictly IN_TRANSIT.
 * 5. Receipts and issues are scoped to today's Asia/Kolkata business day.
 */
export async function getInventoryMetrics(
  businessDate: string = getBusinessDateNow(),
  storeId?: string
): Promise<InventoryMetrics> {
  const { start, end } = getBusinessDayTimestampRange(businessDate);

  const [
    totalItems,
    outOfStockCount,
    pendingTransfers,
    transfersInTransit,
    todayReceiptsCount,
    todayIssuesCount,
    allItems,
  ] = await Promise.all([
    prisma.inventoryItem.count({ where: { isActive: true } }),
    prisma.inventoryItem.count({
      where: {
        isActive: true,
        currentStockTotal: { lte: 0 },
      },
    }),
    prisma.stockTransfer.count({
      where: {
        status: {
          in: [
            TransferStatus.DRAFT,
            TransferStatus.APPROVED,
            TransferStatus.PENDING_DISPATCH,
          ],
        },
        ...(storeId
          ? {
              OR: [{ sourceStoreId: storeId }, { destStoreId: storeId }],
            }
          : {}),
      },
    }),
    prisma.stockTransfer.count({
      where: {
        status: TransferStatus.IN_TRANSIT,
        ...(storeId
          ? {
              OR: [{ sourceStoreId: storeId }, { destStoreId: storeId }],
            }
          : {}),
      },
    }),
    prisma.stockMovement.count({
      where: {
        movementType: StockMovementType.PURCHASE_RECEIPT,
        movementDate: { gte: start, lt: end },
        ...(storeId ? { storeId } : {}),
      },
    }),
    prisma.stockMovement.count({
      where: {
        movementType: { in: [...OUTBOUND_MOVEMENT_TYPES] },
        movementDate: { gte: start, lt: end },
        ...(storeId ? { storeId } : {}),
      },
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { currentStockTotal: true, reorderLevel: true },
    }),
  ]);

  // Derive dynamic low stock based on schema reorderLevel
  const lowStockCount = allItems.filter(
    (item) =>
      item.reorderLevel.greaterThan(0) &&
      item.currentStockTotal.lessThanOrEqualTo(item.reorderLevel)
  ).length;

  return {
    totalItems,
    lowStockCount,
    outOfStockCount,
    pendingTransfers,
    transfersInTransit,
    todayReceiptsCount,
    todayIssuesCount,
  };
}
