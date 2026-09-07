import { prisma } from '@/lib/db/prisma';
import { Prisma, StockCountStatus, StockMovementType } from '@prisma/client';
import { generateInventoryNumber } from './numbers';
import { postStockMovement } from './stock-ledger-service';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface CreateStockCountParams {
  storeId: string;
  notes?: string | null;
  userId?: string | null;
}

export interface RecordStockCountItemsParams {
  stockCountId: string;
  items: Array<{
    itemId: string;
    actualCount: Prisma.Decimal | number | string;
    notes?: string | null;
  }>;
  userId?: string | null;
}

export interface PostStockCountParams {
  stockCountId: string;
  userId?: string | null;
  notes?: string | null;
}

/**
 * Initiates a StockCount and captures the freeze snapshot quantity for all store items.
 */
export async function createStockCount(
  params: CreateStockCountParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { storeId, notes, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runCreate(tx))
    : runCreate(client as Prisma.TransactionClient));

  async function runCreate(tx: Prisma.TransactionClient) {
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new Error(`Store [${storeId}] not found.`);
    }

    const countNumber = generateInventoryNumber('CNT');

    const stockCount = await tx.stockCount.create({
      data: {
        countNumber,
        storeId,
        status: StockCountStatus.IN_PROGRESS,
        notes: notes || null,
        conductedAt: new Date(),
      },
    });

    // Capture snapshot for all inventory items with active stock at this store
    const stocks = await tx.stock.findMany({
      where: { storeId },
      include: { item: true },
    });

    for (const s of stocks) {
      await tx.stockCountItem.create({
        data: {
          stockCountId: stockCount.id,
          itemId: s.itemId,
          systemCount: s.quantityOnHand,
          actualCount: s.quantityOnHand, // Default to system until entered
          discrepancy: new Prisma.Decimal(0),
        },
      });
    }

    await recordAuditEvent(
      {
        userId: userId || null,
        action: 'INVENTORY_COUNT_CREATE',
        entity: 'StockCount',
        entityId: stockCount.id,
        newValues: {
          countNumber,
          storeId,
          snapshotItemCount: stocks.length,
        },
      },
      tx
    );

    return await tx.stockCount.findUnique({
      where: { id: stockCount.id },
      include: { items: { include: { item: true } } },
    });
  }
}

/**
 * Records physical counted quantities against the StockCount snapshot.
 */
export async function recordStockCountItems(
  params: RecordStockCountItemsParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { stockCountId, items, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runRecord(tx))
    : runRecord(client as Prisma.TransactionClient));

  async function runRecord(tx: Prisma.TransactionClient) {
    const stockCount = await tx.stockCount.findUnique({
      where: { id: stockCountId },
      include: { items: true },
    });

    if (!stockCount) {
      throw new Error(`StockCount [${stockCountId}] not found.`);
    }

    if (stockCount.status === StockCountStatus.POSTED || stockCount.status === StockCountStatus.CANCELLED) {
      throw new Error(`StockCount cannot be edited in terminal status [${stockCount.status}].`);
    }

    for (const item of items) {
      const actual = new Prisma.Decimal(item.actualCount);
      const existing = stockCount.items.find((i) => i.itemId === item.itemId);

      if (existing) {
        const discrepancy = actual.minus(existing.systemCount);
        await tx.stockCountItem.update({
          where: { id: existing.id },
          data: {
            actualCount: actual,
            discrepancy,
            notes: item.notes || existing.notes,
          },
        });
      } else {
        // Item was not in snapshot, fetch current stock or 0
        const currentStock = await tx.stock.findUnique({
          where: { storeId_itemId: { storeId: stockCount.storeId, itemId: item.itemId } },
        });
        const systemCount = currentStock?.quantityOnHand || new Prisma.Decimal(0);
        const discrepancy = actual.minus(systemCount);

        await tx.stockCountItem.create({
          data: {
            stockCountId,
            itemId: item.itemId,
            systemCount,
            actualCount: actual,
            discrepancy,
            notes: item.notes || null,
          },
        });
      }
    }

    const updated = await tx.stockCount.update({
      where: { id: stockCountId },
      data: {
        status: StockCountStatus.SUBMITTED,
      },
      include: { items: { include: { item: true } } },
    });

    await recordAuditEvent(
      {
        userId: userId || null,
        action: 'INVENTORY_COUNT_RECORD',
        entity: 'StockCount',
        entityId: stockCount.id,
        newValues: {
          itemsUpdated: items.length,
          status: StockCountStatus.SUBMITTED,
        },
      },
      tx
    );

    return updated;
  }
}

/**
 * Posts the stock count to the authoritative ledger:
 *
 * Reconciles against interim movements occurred between conductedAt and posting time:
 * Expected Stock = snapshotQuantity + interimInbound - interimOutbound
 * Net Variance = actualCount - Expected Stock
 *
 * If Variance > 0: Posts ADJUSTMENT_IN for |Variance|
 * If Variance < 0: Posts ADJUSTMENT_OUT for |Variance|
 * If Variance == 0: Reconciled perfectly, zero movement needed.
 */
export async function postStockCount(
  params: PostStockCountParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { stockCountId, userId, notes } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runPost(tx), {
        maxWait: 10000,
        timeout: 25000,
      })
    : runPost(client as Prisma.TransactionClient));

  async function runPost(tx: Prisma.TransactionClient) {
    const stockCount = await tx.stockCount.findUnique({
      where: { id: stockCountId },
      include: { items: { include: { item: true } } },
    });

    if (!stockCount) {
      throw new Error(`StockCount [${stockCountId}] not found.`);
    }

    if (stockCount.status === StockCountStatus.POSTED) {
      throw new Error('StockCount has already been posted to ledger.');
    }

    if (stockCount.status === StockCountStatus.CANCELLED) {
      throw new Error('Cancelled StockCount cannot be posted.');
    }

    const adjustments = [];

    for (const countItem of stockCount.items) {
      // 1. Fetch interim movements occurred since count began
      const interimMovements = await tx.stockMovement.findMany({
        where: {
          storeId: stockCount.storeId,
          itemId: countItem.itemId,
          createdAt: {
            gte: stockCount.conductedAt,
          },
          stockCountId: null, // Exclude count adjustments themselves
        },
      });

      let interimInbound = new Prisma.Decimal(0);
      let interimOutbound = new Prisma.Decimal(0);

      for (const m of interimMovements) {
        if (
          m.movementType === StockMovementType.OPENING_BALANCE ||
          m.movementType === StockMovementType.PURCHASE_RECEIPT ||
          m.movementType === StockMovementType.TRANSFER_IN ||
          m.movementType === StockMovementType.ADJUSTMENT_IN ||
          m.movementType === StockMovementType.RETURN_FROM_DEPARTMENT
        ) {
          interimInbound = interimInbound.plus(m.quantity);
        } else {
          interimOutbound = interimOutbound.plus(m.quantity);
        }
      }

      // Expected = Snapshot + interimInbound - interimOutbound
      const expectedStock = countItem.systemCount.plus(interimInbound).minus(interimOutbound);
      const variance = countItem.actualCount.minus(expectedStock);

      if (!variance.isZero()) {
        const isSurplus = variance.greaterThan(0);
        const adjustType = isSurplus ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT;
        const adjustQty = variance.abs();

        const mov = await postStockMovement(
          {
            storeId: stockCount.storeId,
            itemId: countItem.itemId,
            movementType: adjustType,
            quantity: adjustQty,
            stockCountId: stockCount.id,
            sourceType: 'STOCK_COUNT',
            sourceId: stockCount.id,
            performedById: userId || null,
            remarks: `Count Reconciliation: #${stockCount.countNumber} - Variance: ${variance.toFixed(
              4
            )} (Expected: ${expectedStock.toFixed(4)}, Actual: ${countItem.actualCount.toFixed(4)})`,
            allowNegativeStock: true, // Controlled count variance adjustment
          },
          tx
        );

        adjustments.push({
          itemId: countItem.itemId,
          itemName: countItem.item.name,
          variance: variance.toNumber(),
          movementNumber: mov.movementNumber,
        });
      }

      // Update discrepancy on count line
      await tx.stockCountItem.update({
        where: { id: countItem.id },
        data: {
          discrepancy: variance,
        },
      });
    }

    const updated = await tx.stockCount.update({
      where: { id: stockCount.id },
      data: {
        status: StockCountStatus.POSTED,
        notes: notes ? `${stockCount.notes || ''}\n${notes}` : stockCount.notes,
      },
      include: { items: { include: { item: true } } },
    });

    await recordAuditEvent(
      {
        userId: userId || null,
        action: 'INVENTORY_COUNT_POST',
        entity: 'StockCount',
        entityId: stockCount.id,
        newValues: {
          countNumber: stockCount.countNumber,
          status: StockCountStatus.POSTED,
          adjustmentsCount: adjustments.length,
          adjustments,
        },
      },
      tx
    );

    return {
      stockCount: updated,
      adjustments,
    };
  }
}
