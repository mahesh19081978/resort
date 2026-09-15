import { prisma } from '@/lib/db/prisma';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import { recordAuditEvent } from '@/lib/auth/audit';
import { Prisma, PurchaseOrderStatus, PurchaseRequestStatus } from '@prisma/client';

export interface CreatePurchaseOrderInput {
  vendorId: string;
  requestId?: string | null;
  expectedDate?: Date | string | null;
  notes?: string | null;
  issuedById?: string | null;
  items: {
    itemId: string;
    orderedQuantity: number | string | Prisma.Decimal;
    unitPrice: number | string | Prisma.Decimal;
    taxRate?: number | string | Prisma.Decimal;
  }[];
}

/**
 * Creates a Purchase Order.
 * INVARIANT: Creating a PO NEVER modifies inventory or creates StockMovements.
 */
export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  if (!input.items || input.items.length === 0) {
    throw new Error('A purchase order must contain at least one line item.');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Validate Vendor
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) {
      throw new Error(`Vendor [${input.vendorId}] not found.`);
    }
    if (!vendor.isActive) {
      throw new Error(`Vendor [${vendor.name}] is inactive.`);
    }

    // 2. Validate Request if referenced, lock PR, and enforce PR -> PO cumulative quantity limits
    const prItemLimitMap = new Map<string, { approvedQty: Prisma.Decimal; orderedSoFar: Prisma.Decimal; remainingQty: Prisma.Decimal }>();
    if (input.requestId) {
      // Row-lock PR to serialize concurrent PO creation against the same PR
      const lockedPrRows = await tx.$queryRaw<
        Array<{ id: string; status: PurchaseRequestStatus; requestNumber: string }>
      >`
        SELECT id, status, "requestNumber"
        FROM "PurchaseRequest"
        WHERE id = ${input.requestId}
        FOR UPDATE
      `;

      if (!lockedPrRows || lockedPrRows.length === 0) {
        throw new Error(`Referenced purchase request [${input.requestId}] not found.`);
      }

      const lockedPr = lockedPrRows[0];
      if (lockedPr.status !== PurchaseRequestStatus.APPROVED) {
        throw new Error(
          `Cannot create PO from purchase request [${lockedPr.requestNumber}] with status [${lockedPr.status}]. Must be APPROVED.`
        );
      }

      const pr = await tx.purchaseRequest.findUnique({
        where: { id: input.requestId },
        include: { items: true },
      });

      if (!pr) {
        throw new Error(`Referenced purchase request [${input.requestId}] not found.`);
      }

      // Fetch all existing non-cancelled PO items linked to this PR
      const existingPoItems = await tx.purchaseOrderItem.findMany({
        where: {
          po: {
            requestId: input.requestId,
            status: { not: PurchaseOrderStatus.CANCELLED },
          },
        },
        select: {
          itemId: true,
          orderedQuantity: true,
        },
      });

      // Aggregate cumulative ordered quantities per item
      const alreadyOrderedMap = new Map<string, Prisma.Decimal>();
      for (const ex of existingPoItems) {
        const cur = alreadyOrderedMap.get(ex.itemId) || new Prisma.Decimal(0);
        alreadyOrderedMap.set(ex.itemId, cur.plus(new Prisma.Decimal(ex.orderedQuantity)));
      }

      for (const prItem of pr.items) {
        const approvedQty = new Prisma.Decimal(prItem.quantity);
        const orderedSoFar = alreadyOrderedMap.get(prItem.itemId) || new Prisma.Decimal(0);
        const remainingQty = approvedQty.minus(orderedSoFar);
        prItemLimitMap.set(prItem.itemId, {
          approvedQty,
          orderedSoFar,
          remainingQty: remainingQty.isNegative() ? new Prisma.Decimal(0) : remainingQty,
        });
      }
    }

    // 3. Process line items with authoritative Decimal math
    let calculatedSubtotal = new Prisma.Decimal(0);
    let calculatedTaxAmount = new Prisma.Decimal(0);
    const preparedItems: Array<{
      itemId: string;
      orderedQuantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }> = [];

    for (const it of input.items) {
      const item = await tx.inventoryItem.findUnique({ where: { id: it.itemId } });
      if (!item || !item.isActive) {
        throw new Error(`Inventory item [${it.itemId}] not found or inactive.`);
      }

      const qty = new Prisma.Decimal(it.orderedQuantity);
      if (qty.lessThanOrEqualTo(0)) {
        throw new Error(`Ordered quantity for item [${item.name}] must be greater than 0.`);
      }

      // Enforce PR cumulative quantity limit if linked to a Purchase Request
      if (input.requestId) {
        const prItemInfo = prItemLimitMap.get(it.itemId);
        if (!prItemInfo) {
          throw new Error(
            `Item [${item.name}] was not included in approved Purchase Request [${input.requestId}].`
          );
        }

        const cumulativeProposed = prItemInfo.orderedSoFar.plus(qty);
        if (cumulativeProposed.greaterThan(prItemInfo.approvedQty)) {
          throw new Error(
            `Cumulative ordered quantity (${cumulativeProposed.toFixed(4)}) for item [${item.name}] exceeds approved quantity (${prItemInfo.approvedQty.toFixed(4)}) in Purchase Request. (Already ordered on other POs: ${prItemInfo.orderedSoFar.toFixed(4)}, remaining available: ${prItemInfo.remainingQty.toFixed(4)}).`
          );
        }
      }

      const price = new Prisma.Decimal(it.unitPrice);
      if (price.lessThan(0)) {
        throw new Error(`Unit price for item [${item.name}] cannot be negative.`);
      }

      const taxRate = it.taxRate ? new Prisma.Decimal(it.taxRate) : new Prisma.Decimal(0);
      if (taxRate.lessThan(0)) {
        throw new Error(`Tax rate cannot be negative.`);
      }

      const baseLineAmount = qty.times(price);
      const lineTax = baseLineAmount.times(taxRate).dividedBy(100);
      const lineTotal = baseLineAmount.plus(lineTax);

      calculatedSubtotal = calculatedSubtotal.plus(baseLineAmount);
      calculatedTaxAmount = calculatedTaxAmount.plus(lineTax);

      preparedItems.push({
        itemId: it.itemId,
        orderedQuantity: new Prisma.Decimal(qty.toFixed(4)),
        unitPrice: new Prisma.Decimal(price.toFixed(2)),
        taxRate: new Prisma.Decimal(taxRate.toFixed(2)),
        lineTotal: new Prisma.Decimal(lineTotal.toFixed(2)),
      });
    }

    const calculatedTotalAmount = calculatedSubtotal.plus(calculatedTaxAmount);
    const poNumber = generateInventoryNumber('PO');

    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: input.vendorId,
        requestId: input.requestId || null,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes?.trim() || null,
        issuedById: input.issuedById || null,
        status: PurchaseOrderStatus.DRAFT,
        subtotal: new Prisma.Decimal(calculatedSubtotal.toFixed(2)),
        taxAmount: new Prisma.Decimal(calculatedTaxAmount.toFixed(2)),
        totalAmount: new Prisma.Decimal(calculatedTotalAmount.toFixed(2)),
        items: {
          create: preparedItems,
        },
      },
      include: {
        vendor: true,
        items: {
          include: {
            item: {
              include: { baseUnit: true },
            },
          },
        },
      },
    });

    await recordAuditEvent(
      {
        userId: input.issuedById,
        action: 'PURCHASE_ORDER_CREATED',
        entity: 'PurchaseOrder',
        entityId: po.id,
        newValues: {
          poNumber: po.poNumber,
          vendorId: po.vendorId,
          totalAmount: po.totalAmount.toFixed(2),
          itemCount: po.items.length,
        },
      },
      tx
    );

    return po;
  });
}

/**
 * Issues / Sends a Purchase Order to vendor.
 * INVARIANT: Issuing a PO NEVER modifies inventory.
 */
export async function issuePurchaseOrder(poId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
    });

    if (!po) {
      throw new Error(`Purchase order [${poId}] not found.`);
    }

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new Error(`Cannot issue PO with status [${po.status}]. Must be in DRAFT.`);
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: PurchaseOrderStatus.ISSUED,
        issuedById: userId,
      },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'PURCHASE_ORDER_ISSUED',
        entity: 'PurchaseOrder',
        entityId: po.id,
        oldValues: { status: po.status },
        newValues: { status: updated.status },
      },
      tx
    );

    return updated;
  });
}

/**
 * Cancels a Purchase Order.
 */
export async function cancelPurchaseOrder(poId: string, userId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { goodsReceipts: true },
    });

    if (!po) {
      throw new Error(`Purchase order [${poId}] not found.`);
    }

    if (po.status === PurchaseOrderStatus.FULLY_RECEIVED || po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      throw new Error(`Cannot cancel a PO that has already received goods.`);
    }

    if (po.status === PurchaseOrderStatus.CANCELLED) {
      return po;
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        notes: reason ? `${po.notes ? po.notes + ' | ' : ''}Cancellation: ${reason}` : po.notes,
      },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'PURCHASE_ORDER_CANCELLED',
        entity: 'PurchaseOrder',
        entityId: po.id,
        oldValues: { status: po.status },
        newValues: { status: updated.status, reason },
      },
      tx
    );

    return updated;
  });
}

export async function getPurchaseOrdersList(options?: {
  status?: PurchaseOrderStatus;
  vendorId?: string;
  search?: string;
}) {
  const where: Prisma.PurchaseOrderWhereInput = {};
  if (options?.status) {
    where.status = options.status;
  }
  if (options?.vendorId) {
    where.vendorId = options.vendorId;
  }
  if (options?.search) {
    const q = options.search.trim();
    where.OR = [
      { poNumber: { contains: q, mode: 'insensitive' } },
      { vendor: { name: { contains: q, mode: 'insensitive' } } },
      { vendor: { companyName: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const orders = await prisma.purchaseOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: { select: { id: true, name: true, companyName: true, phone: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      request: { select: { id: true, requestNumber: true, department: true } },
      items: {
        include: {
          item: {
            include: { baseUnit: true, category: true },
          },
        },
      },
      goodsReceipts: {
        select: { id: true, grnNumber: true, status: true, receivedDate: true },
      },
      purchaseBills: {
        select: { id: true, billNumber: true, status: true, totalAmount: true },
      },
    },
  });

  return orders.map((po) => {
    let totalOrderedQty = new Prisma.Decimal(0);
    let totalReceivedQty = new Prisma.Decimal(0);

    const itemsProgress = po.items.map((it) => {
      const ordered = new Prisma.Decimal(it.orderedQuantity);
      const received = new Prisma.Decimal(it.receivedQuantity);
      const outstanding = ordered.minus(received);

      totalOrderedQty = totalOrderedQty.plus(ordered);
      totalReceivedQty = totalReceivedQty.plus(received);

      return {
        id: it.id,
        itemId: it.itemId,
        itemName: it.item.name,
        itemCode: it.item.code,
        unitName: it.item.baseUnit.name,
        unitCode: it.item.baseUnit.code,
        orderedQuantity: ordered.toFixed(4),
        receivedQuantity: received.toFixed(4),
        outstandingQuantity: outstanding.isNegative() ? '0.0000' : outstanding.toFixed(4),
        unitPrice: it.unitPrice.toFixed(2),
        taxRate: it.taxRate.toFixed(2),
        lineTotal: it.lineTotal.toFixed(2),
      };
    });

    const isFullyReceived =
      po.items.length > 0 &&
      po.items.every((it) => new Prisma.Decimal(it.receivedQuantity).greaterThanOrEqualTo(new Prisma.Decimal(it.orderedQuantity)));

    return {
      id: po.id,
      poNumber: po.poNumber,
      vendor: po.vendor,
      issuedBy: po.issuedBy,
      request: po.request,
      status: po.status,
      expectedDate: po.expectedDate ? po.expectedDate.toISOString() : null,
      notes: po.notes,
      subtotal: po.subtotal.toFixed(2),
      taxAmount: po.taxAmount.toFixed(2),
      totalAmount: po.totalAmount.toFixed(2),
      createdAt: po.createdAt.toISOString(),
      items: itemsProgress,
      totalOrderedQuantity: totalOrderedQty.toFixed(4),
      totalReceivedQuantity: totalReceivedQty.toFixed(4),
      isFullyReceived,
      goodsReceiptCount: po.goodsReceipts.length,
      purchaseBillCount: po.purchaseBills.length,
    };
  });
}
