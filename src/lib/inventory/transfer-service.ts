import { prisma } from '@/lib/db/prisma';
import { Prisma, TransferStatus, StockMovementType } from '@prisma/client';
import { generateInventoryNumber } from './numbers';
import { postStockMovement } from './stock-ledger-service';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface CreateStockTransferParams {
  sourceStoreId: string;
  destStoreId: string;
  requestedById?: string | null;
  notes?: string | null;
  items: Array<{
    itemId: string;
    requestedQty: Prisma.Decimal | number | string;
    unitId?: string | null;
    notes?: string | null;
  }>;
}

export interface ApproveStockTransferParams {
  transferId: string;
  approvedById?: string | null;
  notes?: string | null;
}

export interface DispatchStockTransferParams {
  transferId: string;
  dispatchedById?: string | null;
  notes?: string | null;
}

export interface ReceiveStockTransferParams {
  transferId: string;
  receivedById?: string | null;
  items?: Array<{
    itemId: string;
    receivedQty: Prisma.Decimal | number | string;
    damagedQty?: Prisma.Decimal | number | string;
  }>;
  notes?: string | null;
}

/**
 * Creates an inter-store physical transfer in DRAFT status.
 */
export async function createStockTransfer(
  params: CreateStockTransferParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { sourceStoreId, destStoreId, requestedById, notes, items } = params;

  if (sourceStoreId === destStoreId) {
    throw new Error('Source store and destination store cannot be the same.');
  }

  if (!items || items.length === 0) {
    throw new Error('Transfer must include at least one item.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runCreate(tx))
    : runCreate(client as Prisma.TransactionClient));

  async function runCreate(tx: Prisma.TransactionClient) {
    const transferNumber = generateInventoryNumber('TRF');

    const transfer = await tx.stockTransfer.create({
      data: {
        transferNumber,
        sourceStoreId,
        destStoreId,
        status: TransferStatus.DRAFT,
        requestedById: requestedById || null,
        notes: notes || null,
      },
    });

    for (const item of items) {
      const invItem = await tx.inventoryItem.findUnique({
        where: { id: item.itemId },
      });
      if (!invItem) {
        throw new Error(`Inventory item [${item.itemId}] not found.`);
      }

      await tx.stockTransferItem.create({
        data: {
          transferId: transfer.id,
          itemId: item.itemId,
          requestedQty: new Prisma.Decimal(item.requestedQty),
          dispatchedQty: new Prisma.Decimal(0),
          receivedQty: new Prisma.Decimal(0),
          damagedQty: new Prisma.Decimal(0),
          unitId: item.unitId || invItem.baseUnitId,
          notes: item.notes || null,
        },
      });
    }

    await recordAuditEvent(
      {
        userId: requestedById || null,
        action: 'INVENTORY_TRANSFER_CREATE',
        entity: 'StockTransfer',
        entityId: transfer.id,
        newValues: {
          transferNumber,
          sourceStoreId,
          destStoreId,
          status: TransferStatus.DRAFT,
          itemCount: items.length,
        },
      },
      tx
    );

    return await tx.stockTransfer.findUnique({
      where: { id: transfer.id },
      include: { items: { include: { item: true, unit: true } } },
    });
  }
}

/**
 * Approves a transfer in DRAFT status:
 * Validates transition: DRAFT -> APPROVED.
 * Unauthorized/invalid transitions fail fast.
 */
export async function approveStockTransfer(
  params: ApproveStockTransferParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { transferId, approvedById, notes } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runApprove(tx))
    : runApprove(client as Prisma.TransactionClient));

  async function runApprove(tx: Prisma.TransactionClient) {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new Error(`Transfer [${transferId}] not found.`);
    }

    if (transfer.status === TransferStatus.APPROVED) {
      // Idempotent return if already approved
      return transfer;
    }

    if (transfer.status !== TransferStatus.DRAFT) {
      throw new Error(`Transfer cannot be approved in status [${transfer.status}]. Must be DRAFT.`);
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: TransferStatus.APPROVED,
        approvedById: approvedById || null,
        approvedAt: new Date(),
        notes: notes ? `${transfer.notes || ''}\n${notes}` : transfer.notes,
      },
      include: { items: { include: { item: true, unit: true } } },
    });

    await recordAuditEvent(
      {
        userId: approvedById || null,
        action: 'INVENTORY_TRANSFER_APPROVE',
        entity: 'StockTransfer',
        entityId: transfer.id,
        newValues: {
          transferNumber: transfer.transferNumber,
          status: TransferStatus.APPROVED,
          approvedAt: updated.approvedAt,
        },
      },
      tx
    );

    return updated;
  }
}

/**
 * Dispatches the transfer from the source store:
 * 1. Validates APPROVED status (or PENDING_DISPATCH).
 * 2. Emits StockMovement(TRANSFER_OUT) at source store.
 * 3. Decrements source store Stock.quantityOnHand.
 * 4. Sets transfer status to IN_TRANSIT.
 */
export async function dispatchStockTransfer(
  params: DispatchStockTransferParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { transferId, dispatchedById, notes } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runDispatch(tx), {
        maxWait: 10000,
        timeout: 25000,
      })
    : runDispatch(client as Prisma.TransactionClient));

  async function runDispatch(tx: Prisma.TransactionClient) {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
      include: { items: { include: { item: true, unit: true } } },
    });

    if (!transfer) {
      throw new Error(`Transfer [${transferId}] not found.`);
    }

    if (transfer.status === TransferStatus.IN_TRANSIT || transfer.status === TransferStatus.DISPATCHED) {
      throw new Error(`Transfer [${transfer.transferNumber}] has already been dispatched.`);
    }

    if (transfer.status !== TransferStatus.APPROVED && transfer.status !== TransferStatus.PENDING_DISPATCH) {
      throw new Error(`Transfer cannot be dispatched in status [${transfer.status}]. Must be APPROVED.`);
    }

    for (const item of transfer.items) {
      const dispatchQty = item.requestedQty;

      // Post TRANSFER_OUT movement at source store
      await postStockMovement(
        {
          storeId: transfer.sourceStoreId,
          itemId: item.itemId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: dispatchQty,
          unitId: item.unitId,
          transferId: transfer.id,
          toStoreId: transfer.destStoreId,
          performedById: dispatchedById || null,
          remarks: `Transfer Dispatch: #${transfer.transferNumber} to store [${transfer.destStoreId}]`,
          allowNegativeStock: false,
        },
        tx
      );

      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: { dispatchedQty: dispatchQty },
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: TransferStatus.IN_TRANSIT,
        dispatchedById: dispatchedById || null,
        dispatchedAt: new Date(),
        notes: notes ? `${transfer.notes || ''}\n${notes}` : transfer.notes,
      },
      include: { items: { include: { item: true, unit: true } } },
    });

    await recordAuditEvent(
      {
        userId: dispatchedById || null,
        action: 'INVENTORY_TRANSFER_DISPATCH',
        entity: 'StockTransfer',
        entityId: transfer.id,
        newValues: {
          transferNumber: transfer.transferNumber,
          status: TransferStatus.IN_TRANSIT,
          dispatchedAt: updated.dispatchedAt,
        },
      },
      tx
    );

    return updated;
  }
}

/**
 * Receives the transfer at the destination store:
 * 1. Validates IN_TRANSIT status.
 * 2. Emits StockMovement(TRANSFER_IN) for accepted quantities.
 * 3. Emits StockMovement(DAMAGE) for transit-damaged quantities.
 * 4. Increments destination store Stock.quantityOnHand.
 * 5. Sets transfer status to RECEIVED.
 */
export async function receiveStockTransfer(
  params: ReceiveStockTransferParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { transferId, receivedById, items, notes } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runReceive(tx), {
        maxWait: 10000,
        timeout: 25000,
      })
    : runReceive(client as Prisma.TransactionClient));

  async function runReceive(tx: Prisma.TransactionClient) {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
      include: { items: { include: { item: true, unit: true } } },
    });

    if (!transfer) {
      throw new Error(`Transfer [${transferId}] not found.`);
    }

    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new Error(`Transfer cannot be received in status [${transfer.status}]. Must be IN_TRANSIT.`);
    }

    for (const item of transfer.items) {
      let acceptedQty = item.dispatchedQty;
      let damagedQty = new Prisma.Decimal(0);

      if (items && items.length > 0) {
        const itemParam = items.find((i) => i.itemId === item.itemId);
        if (itemParam) {
          acceptedQty = new Prisma.Decimal(itemParam.receivedQty);
          damagedQty = itemParam.damagedQty ? new Prisma.Decimal(itemParam.damagedQty) : new Prisma.Decimal(0);
        }
      }

      if (acceptedQty.plus(damagedQty).greaterThan(item.dispatchedQty)) {
        throw new Error(
          `Received quantity (${acceptedQty}) + damaged quantity (${damagedQty}) cannot exceed dispatched quantity (${item.dispatchedQty}).`
        );
      }

      // 1. Post TRANSFER_IN for accepted goods
      if (acceptedQty.greaterThan(0)) {
        await postStockMovement(
          {
            storeId: transfer.destStoreId,
            itemId: item.itemId,
            movementType: StockMovementType.TRANSFER_IN,
            quantity: acceptedQty,
            unitId: item.unitId,
            transferId: transfer.id,
            fromStoreId: transfer.sourceStoreId,
            performedById: receivedById || null,
            remarks: `Transfer Receipt: #${transfer.transferNumber} from store [${transfer.sourceStoreId}]`,
            allowNegativeStock: false,
          },
          tx
        );
      }

      // 2. Record transit damage if any (transit loss occurred before receipt into destination storeOnHand)
      if (damagedQty.greaterThan(0)) {
        const itemObj = await tx.inventoryItem.findUnique({
          where: { id: item.itemId },
          include: { baseUnit: true },
        });
        const currentWac = itemObj?.standardCost || new Prisma.Decimal(0);
        const destStock = await tx.stock.findUnique({
          where: { storeId_itemId: { storeId: transfer.destStoreId, itemId: item.itemId } },
        });
        const curDestQty = destStock?.quantityOnHand || new Prisma.Decimal(0);

        await tx.stockMovement.create({
          data: {
            movementNumber: `MOV-DMG-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
            storeId: transfer.destStoreId,
            itemId: item.itemId,
            movementType: StockMovementType.DAMAGE,
            quantity: damagedQty,
            transactionUnitId: item.unitId,
            unitCost: currentWac,
            totalCost: damagedQty.times(currentWac),
            balanceBefore: curDestQty,
            balanceAfter: curDestQty, // Does not debit accepted destination stockOnHand
            transferId: transfer.id,
            fromStoreId: transfer.sourceStoreId,
            performedById: receivedById || null,
            remarks: `Transit Damage during transfer #${transfer.transferNumber} (${damagedQty} damaged in transit)`,
          },
        });
      }

      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: {
          receivedQty: acceptedQty,
          damagedQty: damagedQty,
        },
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: TransferStatus.RECEIVED,
        receivedById: receivedById || null,
        receivedAt: new Date(),
        notes: notes ? `${transfer.notes || ''}\n${notes}` : transfer.notes,
      },
      include: { items: { include: { item: true, unit: true } } },
    });

    await recordAuditEvent(
      {
        userId: receivedById || null,
        action: 'INVENTORY_TRANSFER_RECEIVE',
        entity: 'StockTransfer',
        entityId: transfer.id,
        newValues: {
          transferNumber: transfer.transferNumber,
          status: TransferStatus.RECEIVED,
          receivedAt: updated.receivedAt,
        },
      },
      tx
    );

    return updated;
  }
}
