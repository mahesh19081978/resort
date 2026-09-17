import { prisma } from '@/lib/db/prisma';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import { recordAuditEvent } from '@/lib/auth/audit';
import { Prisma, PaymentMethod, PurchaseBillStatus } from '@prisma/client';

export interface CreateVendorPaymentInput {
  vendorId: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: PaymentMethod;
  paymentDate?: Date | string | null;
  transactionReference?: string | null;
  notes?: string | null;
  userId?: string | null;
  allocations: {
    purchaseBillId: string;
    amountAllocated: number | string | Prisma.Decimal;
  }[];
}

/**
 * Creates and Allocates a Vendor Payment.
 *
 * CRITICAL FINANCIAL & AUDIT INVARIANTS:
 * 1. Total allocated across bills must not exceed payment amount.
 * 2. Bill balance cannot be over-paid (allocated <= current bill balanceDue).
 * 3. Atomically updates PurchaseBill.paidAmount and balanceDue.
 * 4. Transitions bill status to PARTIALLY_PAID or FULLY_PAID.
 * 5. All mutations happen in a single interactive Prisma transaction.
 */
export async function createVendorPayment(input: CreateVendorPaymentInput) {
  if (!input.allocations || input.allocations.length === 0) {
    throw new Error('At least one bill allocation must be provided.');
  }

  const paymentAmount = new Prisma.Decimal(input.amount);
  if (paymentAmount.lessThanOrEqualTo(0)) {
    throw new Error('Payment amount must be greater than zero.');
  }

  // Normalize transactionReference: empty or whitespace becomes null so it never collides as an idempotency key
  const normalizedTxRef = input.transactionReference && input.transactionReference.trim().length > 0
    ? input.transactionReference.trim()
    : null;

  return prisma.$transaction(async (tx) => {
    // 1. Verify Vendor
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) {
      throw new Error(`Vendor [${input.vendorId}] not found.`);
    }

    // 2. Idempotency Check: if transactionReference is provided, check for existing payment
    if (normalizedTxRef) {
      const existingPayment = await tx.vendorPayment.findFirst({
        where: {
          vendorId: input.vendorId,
          transactionReference: normalizedTxRef,
        },
        include: {
          allocations: true,
        },
      });

      if (existingPayment) {
        // Strict Financial Context Verification on pre-check retry
        const existingAmount = new Prisma.Decimal(existingPayment.amount);
        if (!existingAmount.equals(paymentAmount)) {
          throw new Error(
            `Conflicting duplicate payment: Existing payment [${existingPayment.paymentNumber}] has amount ${existingAmount.toFixed(2)}, but requested amount is ${paymentAmount.toFixed(2)}.`
          );
        }

        if (existingPayment.paymentMethod !== input.paymentMethod) {
          throw new Error(
            `Conflicting duplicate payment: Existing payment [${existingPayment.paymentNumber}] used method ${existingPayment.paymentMethod}, but requested method is ${input.paymentMethod}.`
          );
        }

        // Verify allocations match
        if (existingPayment.allocations.length !== input.allocations.length) {
          throw new Error(
            `Conflicting duplicate payment: Existing payment [${existingPayment.paymentNumber}] has ${existingPayment.allocations.length} allocations, but requested ${input.allocations.length}.`
          );
        }

        for (const inputAlloc of input.allocations) {
          const match = existingPayment.allocations.find((a) => a.purchaseBillId === inputAlloc.purchaseBillId);
          if (!match) {
            throw new Error(
              `Conflicting duplicate payment: Existing payment [${existingPayment.paymentNumber}] does not contain bill allocation [${inputAlloc.purchaseBillId}].`
            );
          }
          const matchedAmt = new Prisma.Decimal(match.amountAllocated);
          const reqAmt = new Prisma.Decimal(inputAlloc.amountAllocated);
          if (!matchedAmt.equals(reqAmt)) {
            throw new Error(
              `Conflicting duplicate payment: Allocation for bill [${inputAlloc.purchaseBillId}] differs (${matchedAmt.toFixed(2)} vs ${reqAmt.toFixed(2)}).`
            );
          }
        }

        // Exact match -> return existing payment idempotently
        return existingPayment;
      }
    }

    // 3. Row-Level Lock and validate each purchase bill
    let totalAllocated = new Prisma.Decimal(0);
    const preparedAllocations: Array<{
      purchaseBillId: string;
      amountAllocated: Prisma.Decimal;
      bill: {
        id: string;
        billNumber: string;
        vendorId: string;
        totalAmount: Prisma.Decimal;
        paidAmount: Prisma.Decimal;
        balanceDue: Prisma.Decimal;
        status: PurchaseBillStatus;
      };
    }> = [];

    for (const alloc of input.allocations) {
      const allocAmt = new Prisma.Decimal(alloc.amountAllocated);
      if (allocAmt.lessThanOrEqualTo(0)) {
        throw new Error('Allocated amount for a bill must be greater than zero.');
      }

      // Concurrency protection: Lock bill row with SELECT ... FOR UPDATE
      const lockedBills = await tx.$queryRaw<
        Array<{
          id: string;
          billNumber: string;
          vendorId: string;
          totalAmount: Prisma.Decimal;
          paidAmount: Prisma.Decimal;
          balanceDue: Prisma.Decimal;
          status: PurchaseBillStatus;
        }>
      >`
        SELECT id, "billNumber", "vendorId", "totalAmount", "paidAmount", "balanceDue", status
        FROM "PurchaseBill"
        WHERE id = ${alloc.purchaseBillId}
        FOR UPDATE
      `;

      if (!lockedBills || lockedBills.length === 0) {
        throw new Error(`Purchase bill [${alloc.purchaseBillId}] not found.`);
      }

      const bill = lockedBills[0];

      if (bill.vendorId !== input.vendorId) {
        throw new Error(`Purchase bill [${bill.billNumber}] does not belong to vendor [${vendor.name}].`);
      }

      if (bill.status === PurchaseBillStatus.FULLY_PAID || bill.status === PurchaseBillStatus.CANCELLED) {
        throw new Error(`Cannot allocate payment to bill [${bill.billNumber}] with status [${bill.status}].`);
      }

      const balanceDue = new Prisma.Decimal(bill.balanceDue);
      if (allocAmt.greaterThan(balanceDue)) {
        throw new Error(
          `Allocated amount (${allocAmt.toFixed(2)}) exceeds remaining balance (${balanceDue.toFixed(2)}) on bill [${bill.billNumber}].`
        );
      }

      totalAllocated = totalAllocated.plus(allocAmt);
      preparedAllocations.push({
        purchaseBillId: alloc.purchaseBillId,
        amountAllocated: allocAmt,
        bill,
      });
    }

    if (totalAllocated.greaterThan(paymentAmount)) {
      throw new Error(
        `Total allocated (${totalAllocated.toFixed(2)}) exceeds payment amount (${paymentAmount.toFixed(2)}).`
      );
    }

    // 3. Create VendorPayment record
    const paymentNumber = generateInventoryNumber('VP');

    const payment = await tx.vendorPayment.create({
      data: {
        paymentNumber,
        vendorId: input.vendorId,
        amount: new Prisma.Decimal(paymentAmount.toFixed(2)),
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
        transactionReference: normalizedTxRef,
        notes: input.notes?.trim() || null,
        allocations: {
          create: preparedAllocations.map((a) => ({
            purchaseBillId: a.purchaseBillId,
            amountAllocated: new Prisma.Decimal(a.amountAllocated.toFixed(2)),
          })),
        },
      },
      include: {
        allocations: true,
        vendor: true,
      },
    });

    // 4. Update each bill's paidAmount, balanceDue, and status
    for (const alloc of preparedAllocations) {
      const prevPaid = new Prisma.Decimal(alloc.bill.paidAmount);
      const totalBill = new Prisma.Decimal(alloc.bill.totalAmount);
      const newPaid = prevPaid.plus(alloc.amountAllocated);
      const newBalance = totalBill.minus(newPaid);

      const isFullyPaid = newBalance.lessThanOrEqualTo(0);
      const newStatus = isFullyPaid ? PurchaseBillStatus.FULLY_PAID : PurchaseBillStatus.PARTIALLY_PAID;

      await tx.purchaseBill.update({
        where: { id: alloc.purchaseBillId },
        data: {
          paidAmount: new Prisma.Decimal(newPaid.toFixed(2)),
          balanceDue: new Prisma.Decimal(newBalance.isNegative() ? '0.00' : newBalance.toFixed(2)),
          status: newStatus,
        },
      });
    }

    // 5. Audit Logging
    await recordAuditEvent(
      {
        userId: input.userId,
        action: 'VENDOR_PAYMENT_RECORDED',
        entity: 'VendorPayment',
        entityId: payment.id,
        newValues: {
          paymentNumber: payment.paymentNumber,
          vendorName: vendor.name,
          amount: payment.amount.toFixed(2),
          allocationsCount: preparedAllocations.length,
        },
      },
      tx
    );

    return payment;
  },
  {
    maxWait: 10000,
    timeout: 30000,
  }).catch(async (err: any) => {
    // Database-level idempotency handling:
    // If a concurrent duplicate request hits @@unique([vendorId, transactionReference]),
    // Prisma throws P2002. We intercept it, verify exact financial context, and return or reject.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      normalizedTxRef
    ) {
      const existing = await prisma.vendorPayment.findFirst({
        where: {
          vendorId: input.vendorId,
          transactionReference: normalizedTxRef,
        },
        include: {
          allocations: true,
          vendor: true,
        },
      });

      if (existing) {
        // Strict Financial Context Verification on P2002 retry
        const existingAmount = new Prisma.Decimal(existing.amount);
        if (!existingAmount.equals(paymentAmount)) {
          throw new Error(
            `Conflicting duplicate payment: Existing payment [${existing.paymentNumber}] has amount ${existingAmount.toFixed(2)}, but retry requested ${paymentAmount.toFixed(2)}.`
          );
        }

        if (existing.paymentMethod !== input.paymentMethod) {
          throw new Error(
            `Conflicting duplicate payment: Existing payment [${existing.paymentNumber}] used method ${existing.paymentMethod}, but retry requested ${input.paymentMethod}.`
          );
        }

        // Verify allocations match exactly
        if (existing.allocations.length !== input.allocations.length) {
          throw new Error(
            `Conflicting duplicate payment: Existing payment [${existing.paymentNumber}] has ${existing.allocations.length} allocations, but retry requested ${input.allocations.length}.`
          );
        }

        for (const inputAlloc of input.allocations) {
          const match = existing.allocations.find((a) => a.purchaseBillId === inputAlloc.purchaseBillId);
          if (!match) {
            throw new Error(
              `Conflicting duplicate payment: Existing payment [${existing.paymentNumber}] does not contain bill allocation [${inputAlloc.purchaseBillId}].`
            );
          }
          const matchedAmt = new Prisma.Decimal(match.amountAllocated);
          const reqAmt = new Prisma.Decimal(inputAlloc.amountAllocated);
          if (!matchedAmt.equals(reqAmt)) {
            throw new Error(
              `Conflicting duplicate payment: Allocation for bill [${inputAlloc.purchaseBillId}] differs (${matchedAmt.toFixed(2)} vs ${reqAmt.toFixed(2)}).`
            );
          }
        }

        return existing;
      }
    }
    throw err;
  });
}

export async function getVendorPaymentsList(options?: {
  vendorId?: string;
  search?: string;
}) {
  const where: Prisma.VendorPaymentWhereInput = {};
  if (options?.vendorId) {
    where.vendorId = options.vendorId;
  }
  if (options?.search) {
    const q = options.search.trim();
    where.OR = [
      { paymentNumber: { contains: q, mode: 'insensitive' } },
      { transactionReference: { contains: q, mode: 'insensitive' } },
      { vendor: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const payments = await prisma.vendorPayment.findMany({
    where,
    orderBy: { paymentDate: 'desc' },
    include: {
      vendor: { select: { id: true, name: true, companyName: true } },
      allocations: {
        include: {
          purchaseBill: {
            select: { id: true, billNumber: true, vendorBillNo: true, totalAmount: true },
          },
        },
      },
    },
  });

  return payments.map((p) => {
    let allocatedTotal = new Prisma.Decimal(0);
    for (const a of p.allocations) {
      allocatedTotal = allocatedTotal.plus(a.amountAllocated);
    }
    const unallocated = new Prisma.Decimal(p.amount).minus(allocatedTotal);

    return {
      id: p.id,
      paymentNumber: p.paymentNumber,
      vendor: p.vendor,
      amount: p.amount.toFixed(2),
      allocatedTotal: allocatedTotal.toFixed(2),
      unallocatedAmount: unallocated.isNegative() ? '0.00' : unallocated.toFixed(2),
      paymentMethod: p.paymentMethod,
      paymentDate: p.paymentDate.toISOString(),
      transactionReference: p.transactionReference,
      notes: p.notes,
      allocations: p.allocations.map((a) => ({
        id: a.id,
        billId: a.purchaseBill.id,
        billNumber: a.purchaseBill.billNumber,
        vendorBillNo: a.purchaseBill.vendorBillNo,
        amountAllocated: a.amountAllocated.toFixed(2),
        allocatedAt: a.allocatedAt.toISOString(),
      })),
    };
  });
}

export async function getProcurementKpis() {
  const [
    pendingPRs,
    openPOs,
    recentGRNs,
    unpaidBills,
    activeVendorsCount,
  ] = await Promise.all([
    prisma.purchaseRequest.count({
      where: { status: 'PENDING_APPROVAL' },
    }),
    prisma.purchaseOrder.count({
      where: { status: { in: ['DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED'] } },
    }),
    prisma.goodsReceipt.count(),
    prisma.purchaseBill.findMany({
      where: { status: { in: ['RECEIVED', 'VERIFIED', 'PARTIALLY_PAID'] } },
      select: { balanceDue: true, dueDate: true },
    }),
    prisma.vendor.count({ where: { isActive: true } }),
  ]);

  let totalPayables = new Prisma.Decimal(0);
  let overduePayables = new Prisma.Decimal(0);
  let overdueCount = 0;
  const now = new Date();

  for (const b of unpaidBills) {
    const due = new Prisma.Decimal(b.balanceDue);
    totalPayables = totalPayables.plus(due);
    if (new Date(b.dueDate).getTime() < now.getTime()) {
      overduePayables = overduePayables.plus(due);
      overdueCount++;
    }
  }

  return {
    // Standard names expected by ProcurementKpis and ProcurementConsoleClient
    pendingRequestsCount: pendingPRs,
    openOrdersCount: openPOs,
    grnThisMonthCount: recentGRNs,
    unpaidBillsCount: unpaidBills.length,
    totalOutstandingPayables: totalPayables.toFixed(2),
    totalPaidThisMonth: '0.00',
    activeVendorsCount,

    // Aliases preserved for backwards compatibility
    pendingPRs,
    openPOs,
    recentGRNs,
    totalPayables: totalPayables.toFixed(2),
    overduePayables: overduePayables.toFixed(2),
    overdueCount,
  };
}

