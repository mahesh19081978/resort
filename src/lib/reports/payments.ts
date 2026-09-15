/**
 * Reports & Analytics — Payments & Collections Report Service
 *
 * METRIC DEFINITIONS:
 * - PAYMENT COLLECTIONS = sum of successful Payment.amount minus processed Refund.amount
 * - Payment contexts are distinct and must NOT be conflated
 * - VENDOR_PAYMENT is excluded from guest revenue
 * - Reservation advance counted once
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma, PaymentStatus, PaymentContext, RefundStatus } from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';
import { getPeriodBuckets } from '@/lib/dashboard/date';

export interface PaymentReportSummary {
  totalSuccessful: Prisma.Decimal;
  totalPending: Prisma.Decimal;
  totalFailed: Prisma.Decimal;
  totalRefunded: Prisma.Decimal;
  totalPartiallyRefunded: Prisma.Decimal;
  totalVoided: Prisma.Decimal;
  netCollections: Prisma.Decimal;
  totalTransactions: number;
  successfulTransactions: number;
}

export interface PaymentByMethod {
  method: string;
  count: number;
  amount: number;
}

export interface PaymentByContext {
  context: string;
  count: number;
  amount: number;
}

export interface PaymentTrendPoint {
  key: string;
  label: string;
  collections: number;
  refunds: number;
  transactionCount: number;
}

export interface PaymentReportData {
  summary: PaymentReportSummary;
  byMethod: PaymentByMethod[];
  byContext: PaymentByContext[];
  trend: PaymentTrendPoint[];
  hasData: boolean;
}

export async function getPaymentReport(
  periodRange: ResolvedPeriodRange
): Promise<PaymentReportData> {
  const { current } = periodRange;
  const buckets = getPeriodBuckets(periodRange);

  // All payments in period
  const payments = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
    select: {
      id: true,
      amount: true,
      status: true,
      method: true,
      context: true,
      paymentDate: true,
    },
  });

  // Refunds in period
  const refunds = await prisma.refund.findMany({
    where: {
      processedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
    select: {
      id: true,
      amount: true,
      status: true,
      processedAt: true,
    },
  });

  // Aggregate by status
  let totalSuccessful = new Prisma.Decimal(0);
  let totalPending = new Prisma.Decimal(0);
  let totalFailed = new Prisma.Decimal(0);
  let totalRefunded = new Prisma.Decimal(0);
  let totalPartiallyRefunded = new Prisma.Decimal(0);
  let totalVoided = new Prisma.Decimal(0);
  let successfulTransactions = 0;

  const methodCounts: Record<string, { count: number; amount: Prisma.Decimal }> = {};
  const contextCounts: Record<string, { count: number; amount: Prisma.Decimal }> = {};

  for (const p of payments) {
    const amount = p.amount;
    if (p.status === PaymentStatus.SUCCESS) {
      totalSuccessful = totalSuccessful.plus(amount);
      successfulTransactions++;
    } else if (p.status === PaymentStatus.PENDING) {
      totalPending = totalPending.plus(amount);
    } else if (p.status === PaymentStatus.FAILED) {
      totalFailed = totalFailed.plus(amount);
    } else if (p.status === PaymentStatus.REFUNDED) {
      totalRefunded = totalRefunded.plus(amount);
    } else if (p.status === PaymentStatus.PARTIALLY_REFUNDED) {
      totalPartiallyRefunded = totalPartiallyRefunded.plus(amount);
    } else if (p.status === PaymentStatus.VOIDED) {
      totalVoided = totalVoided.plus(amount);
    }

    // By method
    const method = p.method;
    if (!methodCounts[method]) methodCounts[method] = { count: 0, amount: new Prisma.Decimal(0) };
    methodCounts[method].count++;
    methodCounts[method].amount = methodCounts[method].amount.plus(amount);

    // By context
    const ctx = p.context;
    if (!contextCounts[ctx]) contextCounts[ctx] = { count: 0, amount: new Prisma.Decimal(0) };
    contextCounts[ctx].count++;
    contextCounts[ctx].amount = contextCounts[ctx].amount.plus(amount);
  }

  // Processed refunds
  let processedRefunds = new Prisma.Decimal(0);
  for (const r of refunds) {
    if (r.status === RefundStatus.PROCESSED) {
      processedRefunds = processedRefunds.plus(r.amount);
    }
  }

  const netCollections = totalSuccessful.minus(processedRefunds);

  const summary: PaymentReportSummary = {
    totalSuccessful,
    totalPending,
    totalFailed,
    totalRefunded,
    totalPartiallyRefunded,
    totalVoided,
    netCollections,
    totalTransactions: payments.length,
    successfulTransactions,
  };

  // By method
  const byMethod: PaymentByMethod[] = Object.entries(methodCounts).map(([method, data]) => ({
    method: method.replace(/_/g, ' '),
    count: data.count,
    amount: data.amount.toNumber(),
  }));

  // By context
  const contextLabels: Record<string, string> = {
    RESERVATION_ADVANCE: 'Reservation Advance',
    FOLIO_SETTLEMENT: 'Folio Settlement',
    RESTAURANT_BILL: 'Restaurant Bill',
    VENDOR_PAYMENT: 'Vendor Payment',
    DIRECT_SERVICE: 'Direct Service',
  };
  const byContext: PaymentByContext[] = Object.entries(contextCounts).map(([ctx, data]) => ({
    context: contextLabels[ctx] || ctx,
    count: data.count,
    amount: data.amount.toNumber(),
  }));

  // Trend
  const refundByDate: Record<string, Prisma.Decimal> = {};
  for (const r of refunds) {
    if (r.status === RefundStatus.PROCESSED && r.processedAt) {
      const key = r.processedAt.toISOString().slice(0, 10);
      refundByDate[key] = (refundByDate[key] || new Prisma.Decimal(0)).plus(r.amount);
    }
  }

  const trend: PaymentTrendPoint[] = buckets.map((bucket) => {
    let collections = new Prisma.Decimal(0);
    let transactionCount = 0;
    for (const p of payments) {
      if (p.paymentDate >= bucket.startTimestamp && p.paymentDate < bucket.endTimestamp) {
        if (p.status === PaymentStatus.SUCCESS) {
          collections = collections.plus(p.amount);
          transactionCount++;
        }
      }
    }
    const refundsInBucket = refundByDate[bucket.dateStr] || new Prisma.Decimal(0);
    return {
      key: bucket.key,
      label: bucket.label,
      collections: collections.toNumber(),
      refunds: refundsInBucket.toNumber(),
      transactionCount,
    };
  });

  return {
    summary,
    byMethod,
    byContext,
    trend,
    hasData: payments.length > 0,
  };
}

export async function getPaymentDetailRows(
  periodRange: ResolvedPeriodRange,
  page: number = 1,
  pageSize: number = 20,
  status?: string,
  context?: string
) {
  const { current } = periodRange;
  const skip = (page - 1) * pageSize;

  const where: Prisma.PaymentWhereInput = {
    paymentDate: { gte: current.startTimestamp, lt: current.endTimestamp },
    ...(status ? { status: status as PaymentStatus } : {}),
    ...(context ? { context: context as PaymentContext } : {}),
  };

  const [rows, totalRecords] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        status: true,
        method: true,
        context: true,
        paymentDate: true,
        reservation: {
          select: { reservationNumber: true },
        },
        folio: {
          select: { folioNumber: true },
        },
        restaurantBill: {
          select: { billNumber: true },
        },
      },
      orderBy: { paymentDate: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
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
