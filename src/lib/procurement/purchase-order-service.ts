import { prisma } from '@/lib/db/prisma';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import { recordAuditEvent } from '@/lib/auth/audit';
import { Prisma, PurchaseOrderStatus, PurchaseRequestStatus } from '@prisma/client';
import { generatePurchaseOrderHTML, AuthoritativePoDocumentData } from './po-document';
import { renderHtmlToPdfBuffer } from '@/lib/pdf/render-pdf';
import { sendEmail } from '@/lib/email/resend';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  },
  {
    maxWait: 10000,
    timeout: 30000,
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
  },
  {
    maxWait: 10000,
    timeout: 30000,
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
      vendor: { select: { id: true, name: true, companyName: true, phone: true, email: true } },
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

    const remainingReceivable = totalOrderedQty.minus(totalReceivedQty);

    // Financial Reconciliation metrics
    const poTotalAmount = new Prisma.Decimal(po.totalAmount);
    let billedAmount = new Prisma.Decimal(0);
    for (const b of po.purchaseBills) {
      if (b.status !== 'CANCELLED') {
        billedAmount = billedAmount.plus(new Prisma.Decimal(b.totalAmount));
      }
    }
    const unbilledAmount = poTotalAmount.minus(billedAmount);

    return {
      id: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
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
      remainingReceivable: remainingReceivable.isNegative() ? '0.0000' : remainingReceivable.toFixed(4),
      isFullyReceived,
      billedAmount: billedAmount.toFixed(2),
      unbilledAmount: (unbilledAmount.isNegative() ? new Prisma.Decimal(0) : unbilledAmount).toFixed(2),
      goodsReceiptCount: po.goodsReceipts.length,
      purchaseBillCount: po.purchaseBills.length,
    };
  });
}

/**
 * Authoritative Purchase Order Reconciliation Service.
 * Computes complete Quantity, Financial, and Lifecycle Reconciliation across all linked GRNs and Bills.
 */
export async function getPurchaseOrderReconciliation(poId: string) {
  const [po, property, invoiceConfig] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        vendor: true,
        issuedBy: { select: { id: true, name: true, email: true } },
        request: { select: { id: true, requestNumber: true, department: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, code: true, description: true, baseUnit: true } },
          },
        },
        goodsReceipts: {
          include: {
            items: {
              include: { item: { select: { id: true, name: true } } },
            },
            purchaseBills: {
              select: { id: true, billNumber: true, status: true, totalAmount: true },
            },
            stockMovements: {
              select: { id: true, store: { select: { id: true, name: true, code: true, department: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        purchaseBills: {
          include: {
            grn: { select: { id: true, grnNumber: true } },
            allocations: {
              include: {
                vendorPayment: {
                  select: { id: true, paymentNumber: true, paymentDate: true, paymentMethod: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    prisma.property.findFirst(),
    prisma.invoiceConfig.findUnique({ where: { singletonKey: 'DEFAULT' } }),
  ]);

  if (!po) {
    throw new Error(`Purchase order [${poId}] not found.`);
  }

  // Fetch PO-related audit history (issuance, emails)
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entity: 'PurchaseOrder',
      entityId: po.id,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const issuedEvent = auditLogs.find((l) => l.action === 'PURCHASE_ORDER_ISSUED');
  const emailEvents = auditLogs.filter(
    (l) => l.action === 'PURCHASE_ORDER_EMAILED' || l.action === 'PURCHASE_ORDER_EMAIL_FAILED'
  );

  // 1. Quantity Reconciliation
  let orderedQty = new Prisma.Decimal(0);
  let receivedQty = new Prisma.Decimal(0);

  const items = po.items.map((it, idx) => {
    const ord = new Prisma.Decimal(it.orderedQuantity);
    const recv = new Prisma.Decimal(it.receivedQuantity);
    const rem = ord.minus(recv);
    const unitP = new Prisma.Decimal(it.unitPrice);
    const taxR = new Prisma.Decimal(it.taxRate);
    const lineTot = new Prisma.Decimal(it.lineTotal);

    const baseAmount = ord.times(unitP);
    const itemTaxAmount = lineTot.minus(baseAmount);

    orderedQty = orderedQty.plus(ord);
    receivedQty = receivedQty.plus(recv);

    return {
      id: it.id,
      itemIndex: idx + 1,
      itemId: it.itemId,
      itemName: it.item.name,
      itemCode: it.item.code,
      description: it.item.description,
      unitName: it.item.baseUnit.name,
      orderedQuantity: ord.toFixed(4),
      receivedQuantity: recv.toFixed(4),
      remainingReceivable: rem.isNegative() ? '0.0000' : rem.toFixed(4),
      unitPrice: unitP.toFixed(2),
      taxRate: taxR.toFixed(2),
      taxAmount: (itemTaxAmount.isNegative() ? new Prisma.Decimal(0) : itemTaxAmount).toFixed(2),
      lineTotal: lineTot.toFixed(2),
    };
  });

  const remainingReceivable = orderedQty.minus(receivedQty);

  // 2. Financial Reconciliation
  const poTotalAmount = new Prisma.Decimal(po.totalAmount);
  let billedAmount = new Prisma.Decimal(0);
  let paidAmount = new Prisma.Decimal(0);
  let outstandingPayable = new Prisma.Decimal(0);

  const bills = po.purchaseBills.map((b) => {
    const tot = new Prisma.Decimal(b.totalAmount);
    const paid = new Prisma.Decimal(b.paidAmount);
    const bal = new Prisma.Decimal(b.balanceDue);

    if (b.status !== 'CANCELLED') {
      billedAmount = billedAmount.plus(tot);
      paidAmount = paidAmount.plus(paid);
      outstandingPayable = outstandingPayable.plus(bal);
    }

    return {
      id: b.id,
      billNumber: b.billNumber,
      vendorBillNo: b.vendorBillNo,
      status: b.status,
      billDate: b.billDate.toISOString(),
      dueDate: b.dueDate.toISOString(),
      totalAmount: tot.toFixed(2),
      paidAmount: paid.toFixed(2),
      balanceDue: bal.toFixed(2),
      grnNumber: b.grn?.grnNumber || null,
      allocations: b.allocations.map((a) => ({
        id: a.id,
        amountAllocated: a.amountAllocated.toFixed(2),
        paymentNumber: a.vendorPayment.paymentNumber,
        paymentDate: a.vendorPayment.paymentDate.toISOString(),
        paymentMethod: a.vendorPayment.paymentMethod,
      })),
    };
  });

  const unbilledAmount = poTotalAmount.minus(billedAmount);

  // 3. Deliveries (GRNs)
  let deliveryStoreName: string | null = null;
  let deliveryStoreCode: string | null = null;
  let deliveryDepartment: string | null = null;

  const deliveries = po.goodsReceipts.map((g) => {
    let accepted = new Prisma.Decimal(0);
    let rejected = new Prisma.Decimal(0);
    let damaged = new Prisma.Decimal(0);

    for (const gi of g.items) {
      accepted = accepted.plus(new Prisma.Decimal(gi.acceptedQuantity));
      rejected = rejected.plus(new Prisma.Decimal(gi.rejectedQuantity));
      damaged = damaged.plus(new Prisma.Decimal(gi.damagedQuantity));
    }

    const firstStore = g.stockMovements?.[0]?.store;
    if (firstStore && !deliveryStoreName) {
      deliveryStoreName = firstStore.name;
      deliveryStoreCode = firstStore.code;
      deliveryDepartment = firstStore.department;
    }

    return {
      id: g.id,
      grnNumber: g.grnNumber,
      status: g.status,
      challanNumber: g.challanNumber,
      receivedDate: g.receivedDate ? g.receivedDate.toISOString() : g.createdAt.toISOString(),
      storeName: firstStore?.name || 'Default Store',
      acceptedQuantity: accepted.toFixed(4),
      rejectedQuantity: rejected.toFixed(4),
      damagedQuantity: damaged.toFixed(4),
      linkedBills: g.purchaseBills.map((pb) => ({
        id: pb.id,
        billNumber: pb.billNumber,
        status: pb.status,
        totalAmount: pb.totalAmount.toFixed(2),
      })),
    };
  });

  // If destination store not in GRN, check linked PR department
  if (!deliveryDepartment && po.request?.department) {
    deliveryDepartment = po.request.department;
  }

  // 4. Status Flags (Strictly segregated dimensions)
  const isPartiallyReceived = receivedQty.greaterThan(0) && remainingReceivable.greaterThan(0);
  const isFullyReceived = orderedQty.greaterThan(0) && remainingReceivable.lessThanOrEqualTo(0);

  const isPartiallyBilled = billedAmount.greaterThan(0) && billedAmount.lessThan(poTotalAmount);
  const isFullyBilled = poTotalAmount.greaterThan(0) && billedAmount.greaterThanOrEqualTo(poTotalAmount);

  const isPartiallyPaid = paidAmount.greaterThan(0) && outstandingPayable.greaterThan(0);
  const isFullyPaid = billedAmount.greaterThan(0) && outstandingPayable.lessThanOrEqualTo(0);

  // Authoritative Property Profile (configured database record or canonical resort profile)
  const authoritativeProperty = {
    name: property?.name || 'Infinity Resort & Restaurant',
    address: property?.address || '732/1, Mandleshwar Road, Near New Era College, Mhow',
    city: property?.city || 'Mhow',
    state: property?.state || 'Madhya Pradesh',
    postalCode: property?.postalCode || '453441',
    country: property?.country || 'India',
    contactPhone: property?.contactPhone || '+91 98765 43210',
    contactEmail: property?.contactEmail || 'purchase@infinityresort.com',
    gstin: property?.gstin || '23AAAAA0000A1Z5',
    logoUrl: property?.logoUrl || null,
  };

  return {
    poId: po.id,
    poNumber: po.poNumber,
    status: po.status,
    vendor: po.vendor,
    issuedBy: po.issuedBy,
    request: po.request,
    createdAt: po.createdAt.toISOString(),
    expectedDate: po.expectedDate ? po.expectedDate.toISOString() : null,
    notes: po.notes,

    // Audit Issuance & Email History
    issuedAt: issuedEvent ? issuedEvent.createdAt.toISOString() : null,
    issuedByName: issuedEvent?.user?.name || po.issuedBy?.name || 'Authorized Officer',
    auditHistory: auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      userName: l.user?.name || 'System',
      userEmail: l.user?.email || null,
      createdAt: l.createdAt.toISOString(),
      metadata: l.newValues as any,
    })),
    emailHistory: emailEvents.map((l) => ({
      id: l.id,
      action: l.action,
      success: l.action === 'PURCHASE_ORDER_EMAILED',
      userName: l.user?.name || 'Authorized Staff',
      createdAt: l.createdAt.toISOString(),
      recipientEmail: (l.newValues as any)?.recipientEmail || po.vendor.email,
      error: (l.newValues as any)?.error || null,
    })),

    // Authoritative Configuration & Destination
    property: authoritativeProperty,
    deliveryLocation: {
      storeName: deliveryStoreName,
      storeCode: deliveryStoreCode,
      department: deliveryDepartment,
    },
    termsAndConditions: invoiceConfig?.termsAndConditions || null,

    // Quantities
    orderedQty: orderedQty.toFixed(4),
    receivedQty: receivedQty.toFixed(4),
    remainingReceivable: (remainingReceivable.isNegative() ? new Prisma.Decimal(0) : remainingReceivable).toFixed(4),

    // Financials
    subtotal: po.subtotal.toFixed(2),
    taxAmount: po.taxAmount.toFixed(2),
    totalAmount: poTotalAmount.toFixed(2),
    poTotalAmount: poTotalAmount.toFixed(2),
    billedAmount: billedAmount.toFixed(2),
    unbilledAmount: (unbilledAmount.isNegative() ? new Prisma.Decimal(0) : unbilledAmount).toFixed(2),
    paidAmount: paidAmount.toFixed(2),
    outstandingPayable: (outstandingPayable.isNegative() ? new Prisma.Decimal(0) : outstandingPayable).toFixed(2),

    // Independent Status Flags
    isPartiallyReceived,
    isFullyReceived,
    isPartiallyBilled,
    isFullyBilled,
    isPartiallyPaid,
    isFullyPaid,

    // Records Breakdown
    items,
    deliveries,
    bills,
  };
}

/**
 * Builds the authoritative document data structure and generates official HTML.
 */
export async function getPurchaseOrderDocumentHTML(poId: string): Promise<{
  html: string;
  data: AuthoritativePoDocumentData;
}> {
  const recon = await getPurchaseOrderReconciliation(poId);

  const documentData: AuthoritativePoDocumentData = {
    poId: recon.poId,
    poNumber: recon.poNumber,
    status: recon.status,
    createdAt: recon.createdAt,
    expectedDate: recon.expectedDate,
    issuedAt: recon.issuedAt,
    issuedByName: recon.issuedByName,
    notes: recon.notes,
    property: recon.property,
    vendor: {
      id: recon.vendor.id,
      vendorCode: recon.vendor.vendorCode,
      name: recon.vendor.name,
      companyName: recon.vendor.companyName,
      contactPerson: recon.vendor.contactPerson,
      phone: recon.vendor.phone,
      email: recon.vendor.email,
      address: recon.vendor.address,
      gstin: recon.vendor.gstin,
      pan: recon.vendor.pan,
    },
    deliveryLocation: recon.deliveryLocation,
    items: recon.items,
    subtotal: recon.subtotal,
    taxAmount: recon.taxAmount,
    totalAmount: recon.totalAmount,
    termsAndConditions: recon.termsAndConditions,
  };

  const html = generatePurchaseOrderHTML(documentData);
  return { html, data: documentData };
}

/**
 * Renders an authoritative A4 PDF buffer for a Purchase Order.
 * Returns null if Chromium/Puppeteer is unavailable in the environment.
 */
export async function renderPurchaseOrderPdfBuffer(poId: string): Promise<{
  buffer: Buffer | null;
  filename: string;
  poNumber: string;
}> {
  const { html, data } = await getPurchaseOrderDocumentHTML(poId);
  const buffer = await renderHtmlToPdfBuffer(html, { format: 'A4' });
  const filename = `${data.poNumber}.pdf`;
  return { buffer, filename, poNumber: data.poNumber };
}

/**
 * Emails an issued Purchase Order to the authoritative Vendor.email with PDF attachment.
 *
 * BUSINESS RULES:
 * 1. PO must be in an issued or active state (ISSUED, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED).
 * 2. Recipient MUST be the authoritative Vendor.email. No arbitrary overrides.
 * 3. PO PDF attachment is generated strictly from the authoritative HTML document template.
 * 4. AuditLog is written for PURCHASE_ORDER_EMAILED or PURCHASE_ORDER_EMAIL_FAILED.
 * 5. Email failure NEVER mutates or cancels the PO status.
 */
export async function emailPurchaseOrder(
  poId: string,
  userId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const recon = await getPurchaseOrderReconciliation(poId);

  // 1. Status Check
  if (recon.status === PurchaseOrderStatus.DRAFT) {
    throw new Error(`Cannot email PO [${recon.poNumber}]: Purchase Order must be ISSUED before emailing to vendor.`);
  }
  if (recon.status === PurchaseOrderStatus.CANCELLED) {
    throw new Error(`Cannot email cancelled Purchase Order [${recon.poNumber}].`);
  }

  // 2. Authoritative Vendor Email Check
  const recipientEmail = recon.vendor.email?.trim();
  if (!recipientEmail || !recipientEmail.includes('@')) {
    const errorMsg = `Vendor [${recon.vendor.name}] does not have a registered email address. Please update the vendor profile before emailing.`;
    await recordAuditEvent({
      userId,
      action: 'PURCHASE_ORDER_EMAIL_FAILED',
      entity: 'PurchaseOrder',
      entityId: poId,
      newValues: {
        poNumber: recon.poNumber,
        vendorId: recon.vendor.id,
        reason: 'MISSING_VENDOR_EMAIL',
        error: errorMsg,
      },
    });
    return { success: false, error: errorMsg };
  }

  // 3. Generate authoritative document and PDF
  const { html, data } = await getPurchaseOrderDocumentHTML(poId);
  const pdfBuffer = await renderHtmlToPdfBuffer(html, { format: 'A4' });

  // 4. Compose Email Body
  const expectedDateText = data.expectedDate ? new Date(data.expectedDate).toLocaleDateString('en-IN') : 'As agreed';
  const emailSubject = `Purchase Order ${data.poNumber} – ${data.property.name}`;
  const emailText = `Dear ${data.vendor.name},

Please find attached Purchase Order ${data.poNumber} from ${data.property.name}.

PO Number: ${data.poNumber}
Total Amount: ₹${data.totalAmount}
Expected Delivery: ${expectedDateText}

Please acknowledge receipt of this purchase order and reference the PO number on your delivery challan and invoice.

Regards,
Materials & Procurement Department
${data.property.name}`;

  const attachments = pdfBuffer
    ? [{ filename: `${data.poNumber}.pdf`, content: pdfBuffer }]
    : [];

  // 5. Transmit via Resend
  const emailResult = await sendEmail({
    to: recipientEmail,
    subject: emailSubject,
    text: emailText,
    html: `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; font-size: 13px;">
      <p>Dear <strong>${escapeHtml(data.vendor.name)}</strong>,</p>
      <p>Please find attached Purchase Order <strong>${escapeHtml(data.poNumber)}</strong> from <strong>${escapeHtml(data.property.name)}</strong>.</p>
      <table style="border-collapse: collapse; margin: 12px 0; font-size: 13px;">
        <tr><td style="padding: 4px 8px; color: #666;">PO Number:</td><td style="padding: 4px 8px; font-weight: bold;">${escapeHtml(data.poNumber)}</td></tr>
        <tr><td style="padding: 4px 8px; color: #666;">PO Total:</td><td style="padding: 4px 8px; font-weight: bold;">₹${escapeHtml(data.totalAmount)}</td></tr>
        <tr><td style="padding: 4px 8px; color: #666;">Expected Delivery:</td><td style="padding: 4px 8px; font-weight: bold;">${escapeHtml(expectedDateText)}</td></tr>
      </table>
      <p>Please acknowledge receipt of this purchase order and kindly quote the PO number on all delivery challans and tax invoices.</p>
      <br/>
      <p style="margin: 0;">Regards,</p>
      <p style="margin: 0; font-weight: bold;">Purchase Department</p>
      <p style="margin: 0; color: #666;">${escapeHtml(data.property.name)}</p>
    </div>`,
    attachments,
  });

  // 6. Record Audit Event
  if (emailResult.success) {
    await recordAuditEvent({
      userId,
      action: 'PURCHASE_ORDER_EMAILED',
      entity: 'PurchaseOrder',
      entityId: poId,
      newValues: {
        poNumber: data.poNumber,
        vendorId: data.vendor.id,
        recipientEmail,
        messageId: emailResult.messageId,
        hasPdfAttachment: Boolean(pdfBuffer),
      },
    });
    return { success: true, messageId: emailResult.messageId };
  } else {
    await recordAuditEvent({
      userId,
      action: 'PURCHASE_ORDER_EMAIL_FAILED',
      entity: 'PurchaseOrder',
      entityId: poId,
      newValues: {
        poNumber: data.poNumber,
        vendorId: data.vendor.id,
        recipientEmail,
        error: emailResult.error,
      },
    });
    return { success: false, error: emailResult.error || 'Failed to dispatch email to vendor.' };
  }
}
