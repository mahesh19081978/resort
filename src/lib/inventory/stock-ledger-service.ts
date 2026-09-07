import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType } from '@prisma/client';
import { generateInventoryNumber } from './numbers';
import { convertUnitQuantity } from './unit-service';

export const INBOUND_MOVEMENT_TYPES: readonly StockMovementType[] = [
  StockMovementType.OPENING_BALANCE,
  StockMovementType.PURCHASE_RECEIPT,
  StockMovementType.TRANSFER_IN,
  StockMovementType.ADJUSTMENT_IN,
  StockMovementType.RETURN_FROM_DEPARTMENT,
];

export const OUTBOUND_MOVEMENT_TYPES: readonly StockMovementType[] = [
  StockMovementType.STOCK_ISSUE,
  StockMovementType.TRANSFER_OUT,
  StockMovementType.ADJUSTMENT_OUT,
  StockMovementType.WASTAGE,
  StockMovementType.DAMAGE,
  StockMovementType.RETURN_TO_VENDOR,
];

export function isMovementInbound(type: StockMovementType): boolean {
  return INBOUND_MOVEMENT_TYPES.includes(type);
}

export function isMovementOutbound(type: StockMovementType): boolean {
  return OUTBOUND_MOVEMENT_TYPES.includes(type);
}

export interface PostStockMovementParams {
  storeId: string;
  itemId: string;
  movementType: StockMovementType;
  quantity: Prisma.Decimal | number | string; // Entered quantity
  unitId?: string | null; // Entered unit ID (defaults to item base unit if not provided)
  unitCost?: Prisma.Decimal | number | string | null;
  transferId?: string | null;
  fromStoreId?: string | null;
  toStoreId?: string | null;
  goodsReceiptId?: string | null;
  consumptionId?: string | null;
  stockCountId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  performedById?: string | null;
  remarks?: string | null;
  allowNegativeStock?: boolean;
}

export interface PostStockMovementResult {
  movementId: string;
  movementNumber: string;
  storeId: string;
  itemId: string;
  movementType: StockMovementType;
  quantity: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}

/**
 * Authoritative transactional stock ledger mutation engine.
 *
 * Guaranteed Invariants:
 * 1. Executes inside an interactive Prisma transaction with row-level locking (SELECT ... FOR UPDATE).
 * 2. Normalizes entered quantity into item's base unit with Decimal precision.
 * 3. Validates negative stock constraint atomically under the lock.
 * 4. Calculates balanceBefore and balanceAfter while holding the lock.
 * 5. Updates moving Weighted Average Cost (WAC) on inbound receipts; applies current WAC on outbound issues.
 * 6. Atomically inserts immutable StockMovement and updates cached Stock.quantityOnHand.
 * 7. Rolls back completely on any validation failure.
 */
export async function postStockMovement(
  params: PostStockMovementParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<PostStockMovementResult> {
  const allowNegative = params.allowNegativeStock ?? false;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => executeMutation(tx), {
        maxWait: 10000,
        timeout: 25000,
      })
    : executeMutation(client as Prisma.TransactionClient));

  async function executeMutation(tx: Prisma.TransactionClient): Promise<PostStockMovementResult> {
    const { storeId, itemId, movementType } = params;

    // 1. Fetch Item catalog details
    const item = await tx.inventoryItem.findUnique({
      where: { id: itemId },
      include: { baseUnit: true },
    });

    if (!item) {
      throw new Error(`Inventory item [${itemId}] not found.`);
    }

    if (!item.isActive) {
      throw new Error(`Inventory item [${item.name} (${item.code})] is deactivated.`);
    }

    // 2. Fetch Store details
    const store = await tx.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new Error(`Store [${storeId}] not found.`);
    }

    if (!store.isActive) {
      throw new Error(`Store [${store.name}] is inactive.`);
    }

    // 3. Normalize quantity to Base Unit
    const enteredQty = new Prisma.Decimal(params.quantity);
    if (enteredQty.lessThanOrEqualTo(0)) {
      throw new Error(`Movement quantity must be strictly positive (> 0). Received: ${enteredQty}`);
    }

    let normalizedQty = enteredQty;
    let conversionFactor: Prisma.Decimal = new Prisma.Decimal(1);
    const txUnitId = params.unitId || item.baseUnitId;

    if (txUnitId !== item.baseUnitId) {
      const conv = await convertUnitQuantity(
        {
          fromUnitId: txUnitId,
          toUnitId: item.baseUnitId,
          quantity: enteredQty,
        },
        tx
      );
      normalizedQty = conv.convertedQuantity;
      conversionFactor = conv.conversionFactor;
    }

    // 4. Acquire Row-Level Lock on Stock (SELECT ... FOR UPDATE)
    // First, guarantee Stock row exists for this store/item combination
    let stock = await tx.stock.findUnique({
      where: { storeId_itemId: { storeId, itemId } },
    });

    if (!stock) {
      stock = await tx.stock.create({
        data: {
          storeId,
          itemId,
          quantityOnHand: new Prisma.Decimal(0),
        },
      });
    }

    // Lock the specific Stock row
    const lockedRows = await tx.$queryRaw<Array<{ id: string; quantityOnHand: Prisma.Decimal }>>`
      SELECT id, "quantityOnHand"
      FROM "Stock"
      WHERE id = ${stock.id}
      FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new Error(`Failed to acquire row lock for stock [${stock.id}].`);
    }

    const currentBalance = new Prisma.Decimal(lockedRows[0].quantityOnHand);
    const isInbound = isMovementInbound(movementType);
    const isOutbound = isMovementOutbound(movementType);

    if (!isInbound && !isOutbound) {
      throw new Error(`Unrecognized movement type [${movementType}].`);
    }

    // 5. Enforce Negative Stock Policy
    if (isOutbound && !allowNegative && currentBalance.lessThan(normalizedQty)) {
      throw new Error(
        `Insufficient stock for [${item.name}] at [${store.name}]. Available: ${currentBalance.toFixed(
          4
        )}, Requested: ${normalizedQty.toFixed(4)}`
      );
    }

    const balanceBefore = currentBalance;
    const balanceAfter = isInbound
      ? currentBalance.plus(normalizedQty)
      : currentBalance.minus(normalizedQty);

    // 6. Valuation & Cost Resolution (Moving WAC)
    let unitCost: Prisma.Decimal;
    const currentItemWac = item.standardCost || new Prisma.Decimal(0);

    if (isInbound) {
      if (params.unitCost !== undefined && params.unitCost !== null) {
        unitCost = new Prisma.Decimal(params.unitCost);
      } else {
        unitCost = currentItemWac;
      }

      // Update item standardCost (WAC) if inbound adds value
      const oldTotalVal = currentBalance.times(currentItemWac);
      const newInboundVal = normalizedQty.times(unitCost);
      const combinedQty = currentBalance.plus(normalizedQty);

      if (combinedQty.greaterThan(0)) {
        const updatedWac = oldTotalVal.plus(newInboundVal).dividedBy(combinedQty);
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { standardCost: new Prisma.Decimal(updatedWac.toFixed(2)) },
        });
      }
    } else {
      // Outbound inherits current moving average cost
      unitCost = currentItemWac;
    }

    const totalCost = new Prisma.Decimal(normalizedQty.times(unitCost).toFixed(2));
    const movementNumber = generateInventoryNumber('MOV');

    // 7. Insert authoritative StockMovement
    const movement = await tx.stockMovement.create({
      data: {
        movementNumber,
        storeId,
        itemId,
        movementType,
        quantity: new Prisma.Decimal(normalizedQty.toFixed(4)),
        transactionUnitId: txUnitId,
        enteredQuantity: new Prisma.Decimal(enteredQty.toFixed(4)),
        conversionFactor: new Prisma.Decimal(conversionFactor.toFixed(6)),
        unitCost: new Prisma.Decimal(unitCost.toFixed(2)),
        totalCost,
        balanceBefore: new Prisma.Decimal(balanceBefore.toFixed(4)),
        balanceAfter: new Prisma.Decimal(balanceAfter.toFixed(4)),
        transferId: params.transferId || null,
        fromStoreId: params.fromStoreId || (isOutbound ? storeId : null),
        toStoreId: params.toStoreId || (isInbound ? storeId : null),
        goodsReceiptId: params.goodsReceiptId || null,
        consumptionId: params.consumptionId || null,
        stockCountId: params.stockCountId || null,
        sourceType: params.sourceType || null,
        sourceId: params.sourceId || null,
        performedById: params.performedById || null,
        remarks: params.remarks || null,
      },
    });

    // 8. Update cached Stock.quantityOnHand
    await tx.stock.update({
      where: { id: stock.id },
      data: {
        quantityOnHand: new Prisma.Decimal(balanceAfter.toFixed(4)),
      },
    });

    return {
      movementId: movement.id,
      movementNumber: movement.movementNumber,
      storeId,
      itemId,
      movementType,
      quantity: movement.quantity,
      balanceBefore: movement.balanceBefore,
      balanceAfter: movement.balanceAfter,
      unitCost: movement.unitCost,
      totalCost: movement.totalCost,
    };
  }
}
