import { prisma } from '@/lib/db/prisma';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import { recordAuditEvent } from '@/lib/auth/audit';
import { Prisma, PurchaseBillStatus } from '@prisma/client';

export interface CreatePurchaseBillInput {
  vendorId: string;
  vendorBillNo: string;
  poId?: string | null;
  grnId?: string | null;
  billDate: Date | string;
  dueDate: Date | string;
  subtotal: number | string | Prisma.Decimal;
  taxAmount?: number | string | Prisma.Decimal;
  totalAmount: number | string | Prisma.Decimal;
  userId?: string | null;
}

export async function createPurchaseBill(input: CreatePurchaseBillInput) {
  return prisma.$transaction(async (tx) => {
    // 1. Verify Vendor
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) {
      throw new Error(`Vendor [${input.vendorId}] not found.`);
    }

    // 2. Prevent duplicate vendor invoice numbers for the same vendor
    const existing = await tx.purchaseBill.findFirst({
      where: {
        vendorId: input.vendorId,
        vendorBillNo: { equals: input.vendorBillNo.trim(), mode: 'insensitive' },
        status: { not: PurchaseBillStatus.CANCELLED },
      },
    });

    if (existing) {
      throw new Error(
        `A purchase bill with invoice number "${input.vendorBillNo}" already exists for vendor [${vendor.name}].`
      );
    }

    // 3. PO/GRN/Bill Header Reconciliation + GRN Quantity Control
    let po = null;
    if (input.poId) {
      po = await tx.purchaseOrder.findUnique({
        where: { id: input.poId },
        include: { items: true },
      });
      if (!po) {
        throw new Error(`Purchase order [${input.poId}] not found.`);
      }

      // Reconciliation Invariant: Vendor must match PO vendor
      if (po.vendorId !== input.vendorId) {
        throw new Error(
          `Header Reconciliation Failed: Vendor mismatch. Bill vendor [${input.vendorId}] does not match PO vendor [${po.vendorId}].`
        );
      }

      // PO must be in an issued or received state, not DRAFT or CANCELLED
      if (
        po.status !== 'ISSUED' &&
        po.status !== 'PARTIALLY_RECEIVED' &&
        po.status !== 'FULLY_RECEIVED'
      ) {
        throw new Error(
          `Cannot bill against PO [${po.poNumber}] with status [${po.status}]. Must be ISSUED, PARTIALLY_RECEIVED, or FULLY_RECEIVED.`
        );
      }
    }

    if (input.grnId) {
      const grn = await tx.goodsReceipt.findUnique({
        where: { id: input.grnId },
        include: { items: true },
      });
      if (!grn) {
        throw new Error(`Goods receipt note [${input.grnId}] not found.`);
      }

      // Reconciliation Invariant: Vendor must match GRN vendor
      if (grn.vendorId !== input.vendorId) {
        throw new Error(
          `Header Reconciliation Failed: Vendor mismatch. Bill vendor [${input.vendorId}] does not match GRN vendor [${grn.vendorId}].`
        );
      }

      // If poId is also supplied or GRN is linked to a PO, verify consistency
      if (input.poId && grn.poId !== input.poId) {
        throw new Error(
          `Header Reconciliation Failed: Linkage mismatch. GRN [${grn.grnNumber}] is associated with PO [${grn.poId}], which does not match supplied PO [${input.poId}].`
        );
      }

      // GRN must be STORED (physically received & verified)
      if (grn.status !== 'STORED') {
        throw new Error(
          `Cannot bill against GRN [${grn.grnNumber}] with status [${grn.status}]. Must be STORED.`
        );
      }
    }

    // 4. Financial values with Decimal precision
    const subtotal = new Prisma.Decimal(input.subtotal);
    const taxAmount = input.taxAmount ? new Prisma.Decimal(input.taxAmount) : new Prisma.Decimal(0);
    const totalAmount = new Prisma.Decimal(input.totalAmount);

    if (subtotal.isNegative()) {
      throw new Error(`Subtotal cannot be negative.`);
    }

    if (taxAmount.isNegative()) {
      throw new Error(`Tax amount cannot be negative.`);
    }

    if (totalAmount.lessThanOrEqualTo(0)) {
      throw new Error(`Total bill amount must be greater than zero.`);
    }

    // Strict invariant: totalAmount === subtotal + taxAmount after canonical 2-decimal rounding
    const roundedSubtotal = new Prisma.Decimal(subtotal.toFixed(2));
    const roundedTaxAmount = new Prisma.Decimal(taxAmount.toFixed(2));
    const roundedTotalAmount = new Prisma.Decimal(totalAmount.toFixed(2));
    const calculatedTotal = roundedSubtotal.plus(roundedTaxAmount);

    if (!calculatedTotal.equals(roundedTotalAmount)) {
      throw new Error(
        `Financial validation failed: Total amount (${roundedTotalAmount.toFixed(2)}) must exactly equal subtotal (${roundedSubtotal.toFixed(2)}) + tax amount (${roundedTaxAmount.toFixed(2)}).`
      );
    }

    const billNumber = generateInventoryNumber('PB');

    const bill = await tx.purchaseBill.create({
      data: {
        billNumber,
        vendorBillNo: input.vendorBillNo.trim(),
        vendorId: input.vendorId,
        poId: input.poId || null,
        grnId: input.grnId || null,
        status: PurchaseBillStatus.RECEIVED,
        billDate: new Date(input.billDate),
        dueDate: new Date(input.dueDate),
        subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
        taxAmount: new Prisma.Decimal(taxAmount.toFixed(2)),
        totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
        paidAmount: new Prisma.Decimal(0),
        balanceDue: new Prisma.Decimal(totalAmount.toFixed(2)),
      },
      include: {
        vendor: true,
        po: true,
        grn: true,
      },
    });

    await recordAuditEvent(
      {
        userId: input.userId,
        action: 'PURCHASE_BILL_CREATED',
        entity: 'PurchaseBill',
        entityId: bill.id,
        newValues: {
          billNumber: bill.billNumber,
          vendorBillNo: bill.vendorBillNo,
          vendorName: vendor.name,
          totalAmount: bill.totalAmount.toFixed(2),
        },
      },
      tx
    );

    return bill;
  });
}

export async function verifyPurchaseBill(billId: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.purchaseBill.findUnique({ where: { id: billId } });
    if (!bill) throw new Error(`Purchase bill [${billId}] not found.`);

    if (bill.status !== PurchaseBillStatus.RECEIVED) {
      throw new Error(`Cannot verify bill with status [${bill.status}]. Must be RECEIVED.`);
    }

    const updated = await tx.purchaseBill.update({
      where: { id: billId },
      data: { status: PurchaseBillStatus.VERIFIED },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'PURCHASE_BILL_VERIFIED',
        entity: 'PurchaseBill',
        entityId: bill.id,
        oldValues: { status: bill.status },
        newValues: { status: updated.status },
      },
      tx
    );

    return updated;
  });
}

export async function getPurchaseBillsList(options?: {
  status?: PurchaseBillStatus;
  vendorId?: string;
  search?: string;
}) {
  const where: Prisma.PurchaseBillWhereInput = {};
  if (options?.status) {
    where.status = options.status;
  }
  if (options?.vendorId) {
    where.vendorId = options.vendorId;
  }
  if (options?.search) {
    const q = options.search.trim();
    where.OR = [
      { billNumber: { contains: q, mode: 'insensitive' } },
      { vendorBillNo: { contains: q, mode: 'insensitive' } },
      { vendor: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const bills = await prisma.purchaseBill.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: { select: { id: true, name: true, companyName: true, paymentTermsDays: true } },
      po: { select: { id: true, poNumber: true } },
      grn: { select: { id: true, grnNumber: true } },
      allocations: {
        include: {
          vendorPayment: { select: { paymentNumber: true, paymentDate: true, paymentMethod: true } },
        },
      },
    },
  });

  const now = new Date();

  return bills.map((b) => {
    const isOverdue =
      new Prisma.Decimal(b.balanceDue).greaterThan(0) &&
      new Date(b.dueDate).getTime() < now.getTime();

    return {
      id: b.id,
      billNumber: b.billNumber,
      vendorBillNo: b.vendorBillNo,
      vendor: b.vendor,
      po: b.po,
      grn: b.grn,
      status: b.status,
      billDate: b.billDate.toISOString(),
      dueDate: b.dueDate.toISOString(),
      subtotal: b.subtotal.toFixed(2),
      taxAmount: b.taxAmount.toFixed(2),
      totalAmount: b.totalAmount.toFixed(2),
      paidAmount: b.paidAmount.toFixed(2),
      balanceDue: b.balanceDue.toFixed(2),
      isOverdue,
      allocations: b.allocations.map((a) => ({
        id: a.id,
        amountAllocated: a.amountAllocated.toFixed(2),
        allocatedAt: a.allocatedAt.toISOString(),
        paymentNumber: a.vendorPayment.paymentNumber,
        paymentMethod: a.vendorPayment.paymentMethod,
        paymentDate: a.vendorPayment.paymentDate.toISOString(),
      })),
    };
  });
}
