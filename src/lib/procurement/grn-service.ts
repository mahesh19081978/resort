import { prisma } from '@/lib/db/prisma';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import { postStockMovement } from '@/lib/inventory/stock-ledger-service';
import { recordAuditEvent } from '@/lib/auth/audit';
import {
  Prisma,
  GoodsReceiptStatus,
  PurchaseOrderStatus,
  StockMovementType,
} from '@prisma/client';

export interface CreateGrnItemInput {
  itemId: string;
  receivedQuantity: number | string | Prisma.Decimal;
  acceptedQuantity: number | string | Prisma.Decimal;
  rejectedQuantity?: number | string | Prisma.Decimal;
  damagedQuantity?: number | string | Prisma.Decimal;
  rejectionReason?: string | null;
  unitPrice: number | string | Prisma.Decimal;
}

export interface CreateGrnInput {
  poId: string;
  storeId: string;
  challanNumber?: string | null;
  challanDate?: Date | string | null;
  notes?: string | null;
  receivedById?: string | null;
  items: CreateGrnItemInput[];
}

/**
 * Creates and FINALIZES a Goods Receipt Note (GRN).
 *
 * CRITICAL DOMAIN & INVENTORY INVARIANTS:
 * 1. Must reference an existing, valid PO in ISSUED or PARTIALLY_RECEIVED status.
 * 2. Re-reads and locks PO line items to verify outstanding quantities under transaction.
 * 3. Prevents over-receipt: accepted + rejected cannot exceed outstanding quantity on PO line.
 * 4. Accepted quantity enters inventory via `postStockMovement(type: PURCHASE_RECEIPT)`.
 * 5. Rejected / Damaged quantity is recorded on GRN line but NEVER creates stock movement.
 * 6. Atomically updates PO line `receivedQuantity` with accepted quantity.
 * 7. Evaluates PO status: if all items are fully received, updates PO to FULLY_RECEIVED, else PARTIALLY_RECEIVED.
 * 8. Idempotent: once finalized/stored, cannot be re-finalized.
 */
export async function createAndFinalizeGrn(input: CreateGrnInput) {
  if (!input.items || input.items.length === 0) {
    throw new Error('GRN must contain at least one line item.');
  }

  return prisma.$transaction(
    async (tx) => {
      // 1. Fetch & lock PO row using SELECT ... FOR UPDATE
      const lockedPoRows = await tx.$queryRaw<Array<{ id: string; status: PurchaseOrderStatus; vendorId: string; poNumber: string }>>`
        SELECT id, status, "vendorId", "poNumber"
        FROM "PurchaseOrder"
        WHERE id = ${input.poId}
        FOR UPDATE
      `;

      if (!lockedPoRows || lockedPoRows.length === 0) {
        throw new Error(`Purchase order [${input.poId}] not found.`);
      }

      const lockedPo = lockedPoRows[0];

      if (
        lockedPo.status !== PurchaseOrderStatus.ISSUED &&
        lockedPo.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new Error(
          `Cannot receive goods against PO [${lockedPo.poNumber}] with status [${lockedPo.status}]. Must be ISSUED or PARTIALLY_RECEIVED.`
        );
      }

      // Fetch complete PO with items and vendor under the locked transaction
      const po = await tx.purchaseOrder.findUnique({
        where: { id: input.poId },
        include: {
          items: true,
          vendor: true,
        },
      });

      if (!po) {
        throw new Error(`Purchase order [${input.poId}] not found.`);
      }

      // 2. Validate Store
      const store = await tx.store.findUnique({ where: { id: input.storeId } });
      if (!store || !store.isActive) {
        throw new Error(`Destination store [${input.storeId}] not found or inactive.`);
      }

      // 3. Line-by-line verification against PO outstanding quantities
      // Lock individual PurchaseOrderItem rows to prevent concurrent GRNs on the same lines
      const poItemIds = po.items.map((it) => it.id);
      if (poItemIds.length > 0) {
        await tx.$queryRaw`
          SELECT id, "receivedQuantity", "orderedQuantity"
          FROM "PurchaseOrderItem"
          WHERE "poId" = ${po.id}
          FOR UPDATE
        `;
      }

      const poItemMap = new Map(po.items.map((it) => [it.itemId, it]));
      const grnLineData: Array<{
        itemId: string;
        receivedQuantity: Prisma.Decimal;
        acceptedQuantity: Prisma.Decimal;
        rejectedQuantity: Prisma.Decimal;
        damagedQuantity: Prisma.Decimal;
        rejectionReason: string | null;
        unitPrice: Prisma.Decimal;
      }> = [];

      let totalAcceptedAcrossGrn = new Prisma.Decimal(0);
      let totalReceivedAcrossGrn = new Prisma.Decimal(0);

      for (const line of input.items) {
        const poLine = poItemMap.get(line.itemId);
        if (!poLine) {
          throw new Error(
            `Item [${line.itemId}] was not part of original PO [${po.poNumber}].`
          );
        }

        const ordered = new Prisma.Decimal(poLine.orderedQuantity);
        const previouslyReceived = new Prisma.Decimal(poLine.receivedQuantity);
        const outstanding = ordered.minus(previouslyReceived);

        const accepted = new Prisma.Decimal(line.acceptedQuantity);
        const rejected = line.rejectedQuantity ? new Prisma.Decimal(line.rejectedQuantity) : new Prisma.Decimal(0);
        const damaged = line.damagedQuantity ? new Prisma.Decimal(line.damagedQuantity) : new Prisma.Decimal(0);
        const received = line.receivedQuantity
          ? new Prisma.Decimal(line.receivedQuantity)
          : accepted.plus(rejected).plus(damaged);

        if (accepted.isNegative() || rejected.isNegative() || damaged.isNegative()) {
          throw new Error(`Quantities on GRN line cannot be negative.`);
        }

        if (received.lessThanOrEqualTo(0)) {
          throw new Error(`GRN line for item [${line.itemId}] must account for received quantity > 0.`);
        }

        // Accounted receipt breakdown check: accepted + rejected + damaged must match received
        const accountedBreakdown = accepted.plus(rejected).plus(damaged);
        if (!received.equals(accountedBreakdown)) {
          throw new Error(
            `Received quantity (${received.toFixed(4)}) must equal accepted (${accepted.toFixed(4)}) + rejected (${rejected.toFixed(4)}) + damaged (${damaged.toFixed(4)}) for item [${line.itemId}].`
          );
        }

        // INVARIANT 1: Total accounted receipt cannot exceed remaining outstanding quantity on the PO line
        if (accountedBreakdown.greaterThan(outstanding)) {
          throw new Error(
            `Accounted receipt quantity (${accountedBreakdown.toFixed(4)}) exceeds remaining outstanding quantity (${outstanding.toFixed(4)}) on PO [${po.poNumber}] for item [${line.itemId}]. Over-receipt is strictly disallowed.`
          );
        }

        totalAcceptedAcrossGrn = totalAcceptedAcrossGrn.plus(accepted);
        totalReceivedAcrossGrn = totalReceivedAcrossGrn.plus(received);

        const unitPrice = new Prisma.Decimal(line.unitPrice ?? poLine.unitPrice);

        grnLineData.push({
          itemId: line.itemId,
          receivedQuantity: new Prisma.Decimal(received.toFixed(4)),
          acceptedQuantity: new Prisma.Decimal(accepted.toFixed(4)),
          rejectedQuantity: new Prisma.Decimal(rejected.toFixed(4)),
          damagedQuantity: new Prisma.Decimal(damaged.toFixed(4)),
          rejectionReason: line.rejectionReason?.trim() || null,
          unitPrice: new Prisma.Decimal(unitPrice.toFixed(2)),
        });
      }

      // 4. Create GoodsReceipt record
      const grnNumber = generateInventoryNumber('GRN');

      // Status semantics: STORED means goods physically inspected, verified, and stocked in destination store
      const grn = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          poId: po.id,
          vendorId: po.vendorId,
          status: GoodsReceiptStatus.STORED,
          challanNumber: input.challanNumber?.trim() || null,
          challanDate: input.challanDate ? new Date(input.challanDate) : null,
          notes: input.notes?.trim() || null,
          receivedById: input.receivedById || null,
          receivedDate: new Date(),
          items: {
            create: grnLineData,
          },
        },
        include: {
          items: true,
        },
      });

      // 5. POST ACCEPTED GOODS TO INVENTORY (CRITICAL INVARIANT)
      // Only accepted quantity triggers StockMovement; rejected/damaged goods NEVER enter inventory
      let stockMovementsCount = 0;
      for (const line of grnLineData) {
        if (line.acceptedQuantity.greaterThan(0)) {
          await postStockMovement(
            {
              storeId: input.storeId,
              itemId: line.itemId,
              movementType: StockMovementType.PURCHASE_RECEIPT,
              quantity: line.acceptedQuantity,
              unitCost: line.unitPrice,
              goodsReceiptId: grn.id,
              performedById: input.receivedById || null,
              remarks: `GRN ${grn.grnNumber} from Vendor [${po.vendor.name}] against PO [${po.poNumber}]`,
            },
            tx
          );
          stockMovementsCount++;
        }

        // 6. Update PO item received quantity with accounted receipt (accepted + rejected + damaged)
        const currentPoLine = poItemMap.get(line.itemId)!;
        const lineAccounted = line.acceptedQuantity.plus(line.rejectedQuantity).plus(line.damagedQuantity);
        const newReceivedQty = new Prisma.Decimal(currentPoLine.receivedQuantity).plus(lineAccounted);

        await tx.purchaseOrderItem.update({
          where: { id: currentPoLine.id },
          data: {
            receivedQuantity: new Prisma.Decimal(newReceivedQty.toFixed(4)),
          },
        });
      }

      // 7. Check if entire PO is now fully received
      const updatedPoItems = await tx.purchaseOrderItem.findMany({
        where: { poId: po.id },
      });

      const allReceived = updatedPoItems.every((it) =>
        new Prisma.Decimal(it.receivedQuantity).greaterThanOrEqualTo(new Prisma.Decimal(it.orderedQuantity))
      );

      const nextPoStatus = allReceived
        ? PurchaseOrderStatus.FULLY_RECEIVED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: nextPoStatus },
      });

      // 8. Audit logging
      await recordAuditEvent(
        {
          userId: input.receivedById,
          action: 'GOODS_RECEIPT_FINALIZED',
          entity: 'GoodsReceipt',
          entityId: grn.id,
          newValues: {
            grnNumber: grn.grnNumber,
            poNumber: po.poNumber,
            totalReceived: totalReceivedAcrossGrn.toFixed(4),
            totalAccepted: totalAcceptedAcrossGrn.toFixed(4),
            stockMovementsCount,
            nextPoStatus,
          },
        },
        tx
      );

      return {
        grn,
        nextPoStatus,
        stockMovementsCount,
      };
    },
    {
      maxWait: 10000,
      timeout: 30000,
    }
  );
}

export async function getGoodsReceiptsList(options?: {
  status?: GoodsReceiptStatus;
  poId?: string;
  vendorId?: string;
  search?: string;
}) {
  const where: Prisma.GoodsReceiptWhereInput = {};
  if (options?.status) {
    where.status = options.status;
  }
  if (options?.poId) {
    where.poId = options.poId;
  }
  if (options?.vendorId) {
    where.vendorId = options.vendorId;
  }
  if (options?.search) {
    const q = options.search.trim();
    where.OR = [
      { grnNumber: { contains: q, mode: 'insensitive' } },
      { challanNumber: { contains: q, mode: 'insensitive' } },
      { po: { poNumber: { contains: q, mode: 'insensitive' } } },
      { vendor: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  return prisma.goodsReceipt.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: { select: { id: true, name: true, companyName: true } },
      po: { select: { id: true, poNumber: true, status: true, totalAmount: true } },
      receivedBy: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          item: {
            include: { baseUnit: true },
          },
        },
      },
      stockMovements: {
        select: { id: true, movementNumber: true, storeId: true, quantity: true },
      },
    },
  });
}
