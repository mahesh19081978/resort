/**
 * Reports & Analytics — Procurement & Vendors Report Service
 *
 * METRIC DEFINITIONS:
 * - Vendor Outstanding = accepted GRN amounts - allocated vendor payments/credits
 * - PO creation ≠ inventory receipt; GRN accepted quantities drive inventory
 * - Uses PurchaseOrder, GoodsReceipt, PurchaseBill, VendorPayment models
 * - VendorPayment has no status field; all stored payments are considered completed
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';
import { getPeriodBuckets } from '@/lib/dashboard/date';

export interface ProcurementReportSummary {
  totalPOs: number;
  pendingPOs: number;
  completedPOs: number;
  cancelledPOs: number;
  totalGRNs: number;
  totalBills: number;
  totalPurchaseValue: Prisma.Decimal;
  totalPaymentsMade: Prisma.Decimal;
  outstandingVendorBalance: Prisma.Decimal;
  totalVendors: number;
}

export interface VendorOutstanding {
  vendorId: string;
  vendorName: string;
  totalBilled: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
}

export interface ProcurementTrendPoint {
  key: string;
  label: string;
  poCount: number;
  grnCount: number;
  purchaseValue: number;
}

export interface ProcurementReportData {
  summary: ProcurementReportSummary;
  vendorOutstanding: VendorOutstanding[];
  trend: ProcurementTrendPoint[];
  hasData: boolean;
}

export async function getProcurementReport(
  periodRange: ResolvedPeriodRange
): Promise<ProcurementReportData> {
  const { current } = periodRange;

  const [
    totalPOs,
    pendingPOs,
    completedPOs,
    cancelledPOs,
    totalGRNs,
    totalBills,
    totalVendors,
    poValueAgg,
    bills,
    payments,
  ] = await Promise.all([
    prisma.purchaseOrder.count({
      where: { createdAt: { gte: current.startTimestamp, lt: current.endTimestamp } },
    }),
    prisma.purchaseOrder.count({
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        status: { in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.ISSUED, PurchaseOrderStatus.PARTIALLY_RECEIVED] },
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        status: PurchaseOrderStatus.FULLY_RECEIVED,
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        status: PurchaseOrderStatus.CANCELLED,
      },
    }),
    prisma.goodsReceipt.count({
      where: { createdAt: { gte: current.startTimestamp, lt: current.endTimestamp } },
    }),
    prisma.purchaseBill.count({
      where: { createdAt: { gte: current.startTimestamp, lt: current.endTimestamp } },
    }),
    prisma.vendor.count({ where: { isActive: true } }),
    prisma.purchaseOrder.aggregate({
      _sum: { totalAmount: true },
      where: { createdAt: { gte: current.startTimestamp, lt: current.endTimestamp } },
    }),
    prisma.purchaseBill.findMany({
      where: { createdAt: { gte: current.startTimestamp, lt: current.endTimestamp } },
      select: {
        id: true,
        totalAmount: true,
        vendorId: true,
        vendor: { select: { name: true } },
      },
    }),
    prisma.vendorPayment.findMany({
      where: { createdAt: { gte: current.startTimestamp, lt: current.endTimestamp } },
      select: {
        id: true,
        amount: true,
        vendorId: true,
      },
    }),
  ]);

  const totalPurchaseValue = poValueAgg._sum.totalAmount || new Prisma.Decimal(0);

  // All vendor payments are considered completed (no status field on VendorPayment)
  let totalPaymentsMade = new Prisma.Decimal(0);
  for (const p of payments) {
    totalPaymentsMade = totalPaymentsMade.plus(p.amount);
  }

  // Total billed by vendor
  const vendorBilled: Record<string, { name: string; billed: Prisma.Decimal }> = {};
  for (const bill of bills) {
    const vid = bill.vendorId;
    if (!vendorBilled[vid]) vendorBilled[vid] = { name: bill.vendor?.name || 'Unknown', billed: new Prisma.Decimal(0) };
    vendorBilled[vid].billed = vendorBilled[vid].billed.plus(bill.totalAmount);
  }

  // Vendor payments
  const vendorPaid: Record<string, Prisma.Decimal> = {};
  for (const p of payments) {
    vendorPaid[p.vendorId] = (vendorPaid[p.vendorId] || new Prisma.Decimal(0)).plus(p.amount);
  }

  // Vendor outstanding
  const vendorOutstanding: VendorOutstanding[] = Object.entries(vendorBilled).map(([vendorId, data]) => {
    const paid = vendorPaid[vendorId] || new Prisma.Decimal(0);
    const outstanding = data.billed.minus(paid);
    return {
      vendorId,
      vendorName: data.name,
      totalBilled: data.billed,
      totalPaid: paid,
      outstanding: outstanding.isNegative() ? new Prisma.Decimal(0) : outstanding,
    };
  }).filter((v) => v.outstanding.greaterThan(0));

  const outstandingVendorBalance = vendorOutstanding.reduce(
    (sum, v) => sum.plus(v.outstanding),
    new Prisma.Decimal(0)
  );

  // Trend
  const poTrend = await prisma.purchaseOrder.findMany({
    where: { createdAt: { gte: current.startTimestamp, lt: current.endTimestamp } },
    select: { createdAt: true, totalAmount: true },
  });

  const buckets = getPeriodBuckets(periodRange);

  const trend: ProcurementTrendPoint[] = buckets.map((bucket) => {
    let poCount = 0;
    let purchaseValue = new Prisma.Decimal(0);
    for (const po of poTrend) {
      if (po.createdAt >= bucket.startTimestamp && po.createdAt < bucket.endTimestamp) {
        poCount++;
        purchaseValue = purchaseValue.plus(po.totalAmount);
      }
    }
    return {
      key: bucket.key,
      label: bucket.label,
      poCount,
      grnCount: 0,
      purchaseValue: purchaseValue.toNumber(),
    };
  });

  return {
    summary: {
      totalPOs,
      pendingPOs,
      completedPOs,
      cancelledPOs,
      totalGRNs,
      totalBills,
      totalPurchaseValue,
      totalPaymentsMade,
      outstandingVendorBalance,
      totalVendors,
    },
    vendorOutstanding,
    trend,
    hasData: totalPOs > 0 || totalBills > 0,
  };
}
