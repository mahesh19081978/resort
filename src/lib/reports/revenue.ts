/**
 * Reports & Analytics — Revenue & Financial Report Service
 *
 * METRIC DEFINITIONS:
 * - TOTAL RESORT REVENUE = Room Revenue + Restaurant Revenue + Other Service Revenue
 * - ROOM REVENUE = Sum of unvoided FolioItem (itemType: ROOM_CHARGE) in period
 * - RESTAURANT REVENUE = Sum of RestaurantBill (status: SETTLED or CHARGED_TO_ROOM) in period
 * - OTHER SERVICE REVENUE = Sum of unvoided FolioItem (itemType: EXTRA_SERVICE_CHARGE, LAUNDRY_CHARGE, etc.)
 * - DISCOUNTS = Sum of unvoided FolioItem (itemType: DISCOUNT_CREDIT) in period
 * - TAXES = Sum of FolioItem (itemType: TAX_CHARGE) + RestaurantBill taxAmount
 * - PAYMENT COLLECTIONS = Sum of successful Payments minus processed Refunds
 *
 * CRITICAL: Revenue ≠ Collections.
 * A room charged to a folio is revenue when posted. A payment settling that folio is a collection.
 */

import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  FolioItemType,
  BillStatus,
  PaymentStatus,
  PaymentContext,
  RefundStatus,
} from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';
import { getPeriodBuckets } from '@/lib/dashboard/date';

export interface RevenueReportSummary {
  totalResortRevenue: Prisma.Decimal;
  roomRevenue: Prisma.Decimal;
  restaurantRevenue: Prisma.Decimal;
  otherServiceRevenue: Prisma.Decimal;
  discounts: Prisma.Decimal;
  taxes: Prisma.Decimal;
  grossRevenue: Prisma.Decimal;
  netRevenue: Prisma.Decimal;
  totalCollections: Prisma.Decimal;
  refunds: Prisma.Decimal;
  netCollections: Prisma.Decimal;
}

export interface RevenueTrendPoint {
  key: string;
  label: string;
  dateStr: string;
  roomRevenue: number;
  restaurantRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
}

export interface RevenueByCategory {
  category: string;
  amount: number;
  percentage: number;
}

export interface RevenueByPaymentContext {
  context: string;
  amount: number;
  percentage: number;
}

export interface RevenueReportData {
  summary: RevenueReportSummary;
  trend: RevenueTrendPoint[];
  byCategory: RevenueByCategory[];
  byPaymentContext: RevenueByPaymentContext[];
  hasData: boolean;
}

/**
 * Generates the comprehensive Revenue & Financial Report.
 *
 * Date semantics: Revenue is recognized when posted/created (folio postedAt, bill createdAt).
 * Collections are recognized when payment succeeds (paymentDate).
 */
export async function getRevenueReport(
  propertyId: string,
  periodRange: ResolvedPeriodRange
): Promise<RevenueReportData> {
  const { current, previous } = periodRange;
  const buckets = getPeriodBuckets(periodRange);

  // 1. Room Revenue (FolioItem ROOM_CHARGE, unvoided)
  const [currentRoomCharges, previousRoomCharges] = await Promise.all([
    prisma.folioItem.findMany({
      where: {
        itemType: FolioItemType.ROOM_CHARGE,
        isVoided: false,
        postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        folio: {
          stay: {
            roomAssignments: { some: { room: { propertyId } } },
          },
        },
      },
      select: { amount: true, postedAt: true },
    }),
    prisma.folioItem.aggregate({
      _sum: { amount: true },
      where: {
        itemType: FolioItemType.ROOM_CHARGE,
        isVoided: false,
        postedAt: { gte: previous.startTimestamp, lt: previous.endTimestamp },
        folio: {
          stay: {
            roomAssignments: { some: { room: { propertyId } } },
          },
        },
      },
    }),
  ]);

  // 2. Restaurant Revenue (SETTLED or CHARGED_TO_ROOM bills)
  const [currentBills, previousBillsAgg] = await Promise.all([
    prisma.restaurantBill.findMany({
      where: {
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
      select: {
        totalAmount: true,
        taxAmount: true,
        createdAt: true,
        order: { select: { orderType: true } },
      },
    }),
    prisma.restaurantBill.aggregate({
      _sum: { totalAmount: true, taxAmount: true },
      where: {
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
        createdAt: { gte: previous.startTimestamp, lt: previous.endTimestamp },
      },
    }),
  ]);

  // 3. Other Service Revenue (LAUNDRY, EXTRA_SERVICE, DAMAGE_FEE, MISC)
  const otherServiceTypes = [
    FolioItemType.EXTRA_SERVICE_CHARGE,
    FolioItemType.LAUNDRY_CHARGE,
    FolioItemType.DAMAGE_FEE,
    FolioItemType.MISC_CHARGE,
  ];
  const [currentOtherCharges, previousOtherCharges] = await Promise.all([
    prisma.folioItem.aggregate({
      _sum: { amount: true },
      where: {
        itemType: { in: otherServiceTypes },
        isVoided: false,
        postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        folio: {
          stay: {
            roomAssignments: { some: { room: { propertyId } } },
          },
        },
      },
    }),
    prisma.folioItem.aggregate({
      _sum: { amount: true },
      where: {
        itemType: { in: otherServiceTypes },
        isVoided: false,
        postedAt: { gte: previous.startTimestamp, lt: previous.endTimestamp },
        folio: {
          stay: {
            roomAssignments: { some: { room: { propertyId } } },
          },
        },
      },
    }),
  ]);

  // 4. Discounts
  const currentDiscountsAgg = await prisma.folioItem.aggregate({
    _sum: { amount: true },
    where: {
      itemType: FolioItemType.DISCOUNT_CREDIT,
      isVoided: false,
      postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      folio: {
        stay: {
          roomAssignments: { some: { room: { propertyId } } },
        },
      },
    },
  });

  // 5. Taxes (FolioItem TAX_CHARGE + RestaurantBill taxAmount)
  const [currentTaxCharges, currentRestTaxAgg] = await Promise.all([
    prisma.folioItem.aggregate({
      _sum: { amount: true },
      where: {
        itemType: FolioItemType.TAX_CHARGE,
        isVoided: false,
        postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        folio: {
          stay: {
            roomAssignments: { some: { room: { propertyId } } },
          },
        },
      },
    }),
    prisma.restaurantBill.aggregate({
      _sum: { taxAmount: true },
      where: {
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
    }),
  ]);

  // 6. Collections (successful payments in guest contexts)
  const currentPayments = await prisma.payment.groupBy({
    by: ['context'],
    where: {
      status: PaymentStatus.SUCCESS,
      paymentDate: { gte: current.startTimestamp, lt: current.endTimestamp },
      context: {
        in: [
          PaymentContext.RESERVATION_ADVANCE,
          PaymentContext.FOLIO_SETTLEMENT,
          PaymentContext.RESTAURANT_BILL,
          PaymentContext.DIRECT_SERVICE,
        ],
      },
    },
    _sum: { amount: true },
  });

  // 7. Refunds
  const currentRefundsAgg = await prisma.refund.aggregate({
    _sum: { amount: true },
    where: {
      status: RefundStatus.PROCESSED,
      processedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
  });

  // Assemble summary
  const roomRevenue = currentRoomCharges.reduce(
    (sum, item) => sum.plus(item.amount),
    new Prisma.Decimal(0)
  );
  const restaurantRevenue = currentBills.reduce(
    (sum, bill) => sum.plus(bill.totalAmount),
    new Prisma.Decimal(0)
  );
  const otherServiceRevenue = currentOtherCharges._sum.amount || new Prisma.Decimal(0);
  const discounts = currentDiscountsAgg._sum.amount || new Prisma.Decimal(0);
  const taxes = (currentTaxCharges._sum.amount || new Prisma.Decimal(0)).plus(
    currentRestTaxAgg._sum.taxAmount || new Prisma.Decimal(0)
  );
  const totalResortRevenue = roomRevenue.plus(restaurantRevenue).plus(otherServiceRevenue);
  const grossRevenue = totalResortRevenue.plus(discounts).plus(taxes);
  const netRevenue = totalResortRevenue;

  let totalCollections = new Prisma.Decimal(0);
  const contextBreakdown: Array<{ context: string; amount: Prisma.Decimal }> = [];
  for (const group of currentPayments) {
    const amount = group._sum.amount || new Prisma.Decimal(0);
    totalCollections = totalCollections.plus(amount);
    contextBreakdown.push({ context: group.context, amount });
  }
  const refunds = currentRefundsAgg._sum.amount || new Prisma.Decimal(0);
  const netCollections = totalCollections.minus(refunds);

  const summary: RevenueReportSummary = {
    totalResortRevenue,
    roomRevenue,
    restaurantRevenue,
    otherServiceRevenue,
    discounts: discounts.abs(),
    taxes,
    grossRevenue,
    netRevenue,
    totalCollections,
    refunds,
    netCollections,
  };

  // Build trend from batch data
  const totalRevNum = totalResortRevenue.toNumber();
  const otherChargesAll = currentOtherCharges._sum.amount || new Prisma.Decimal(0);
  const otherNum = otherChargesAll.toNumber();

  const trend: RevenueTrendPoint[] = buckets.map((bucket) => {
    let bucketRoom = new Prisma.Decimal(0);
    for (const item of currentRoomCharges) {
      if (item.postedAt >= bucket.startTimestamp && item.postedAt < bucket.endTimestamp) {
        bucketRoom = bucketRoom.plus(item.amount);
      }
    }
    let bucketRest = new Prisma.Decimal(0);
    for (const bill of currentBills) {
      if (bill.createdAt >= bucket.startTimestamp && bill.createdAt < bucket.endTimestamp) {
        bucketRest = bucketRest.plus(bill.totalAmount);
      }
    }
    const bucketOther = new Prisma.Decimal(0);
    const bucketTotal = bucketRoom.plus(bucketRest).plus(bucketOther);
    return {
      key: bucket.key,
      label: bucket.label,
      dateStr: bucket.dateStr,
      roomRevenue: bucketRoom.toNumber(),
      restaurantRevenue: bucketRest.toNumber(),
      otherRevenue: bucketOther.toNumber(),
      totalRevenue: bucketTotal.toNumber(),
    };
  });

  // Revenue by category
  const byCategory: RevenueByCategory[] = [
    { category: 'Room Revenue', amount: roomRevenue.toNumber(), percentage: totalRevNum > 0 ? Math.round((roomRevenue.toNumber() / totalRevNum) * 1000) / 10 : 0 },
    { category: 'Restaurant Revenue', amount: restaurantRevenue.toNumber(), percentage: totalRevNum > 0 ? Math.round((restaurantRevenue.toNumber() / totalRevNum) * 1000) / 10 : 0 },
    { category: 'Other Services', amount: otherNum, percentage: totalRevNum > 0 ? Math.round((otherNum / totalRevNum) * 1000) / 10 : 0 },
  ];

  // Revenue by payment context
  const totalContextAmount = contextBreakdown.reduce((sum, c) => sum.plus(c.amount), new Prisma.Decimal(0));
  const contextLabelMap: Record<string, string> = {
    RESERVATION_ADVANCE: 'Reservation Advance',
    FOLIO_SETTLEMENT: 'Folio Settlement',
    RESTAURANT_BILL: 'Restaurant Bill',
    DIRECT_SERVICE: 'Direct Service',
  };
  const byPaymentContext: RevenueByPaymentContext[] = contextBreakdown.map((c) => ({
    context: contextLabelMap[c.context] || c.context,
    amount: c.amount.toNumber(),
    percentage: totalContextAmount.toNumber() > 0
      ? Math.round((c.amount.toNumber() / totalContextAmount.toNumber()) * 1000) / 10
      : 0,
  }));

  return {
    summary,
    trend,
    byCategory,
    byPaymentContext,
    hasData: totalRevNum > 0 || totalCollections.toNumber() > 0,
  };
}

/**
 * Generates paginated revenue detail rows for the table.
 */
export async function getRevenueDetailRows(
  propertyId: string,
  periodRange: ResolvedPeriodRange,
  page: number = 1,
  pageSize: number = 20,
  sortBy: string = 'date',
  sortOrder: 'asc' | 'desc' = 'desc'
) {
  const { current } = periodRange;
  const skip = (page - 1) * pageSize;

  const [roomCharges, bills, totalCount] = await Promise.all([
    prisma.folioItem.findMany({
      where: {
        itemType: FolioItemType.ROOM_CHARGE,
        isVoided: false,
        postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        folio: {
          stay: {
            roomAssignments: { some: { room: { propertyId } } },
          },
        },
      },
      select: {
        id: true,
        amount: true,
        taxAmount: true,
        description: true,
        postedAt: true,
        folio: {
          select: {
            folioNumber: true,
            stay: {
              select: {
                stayNumber: true,
                reservation: {
                  select: { reservationNumber: true },
                },
              },
            },
          },
        },
      },
      orderBy: { postedAt: sortOrder },
      skip,
      take: pageSize,
    }),
    prisma.restaurantBill.findMany({
      where: {
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
      select: {
        id: true,
        totalAmount: true,
        taxAmount: true,
        billNumber: true,
        createdAt: true,
        order: {
          select: { orderType: true },
        },
      },
      orderBy: { createdAt: sortOrder },
      skip,
      take: pageSize,
    }),
    // Approximate total for pagination
    Promise.all([
      prisma.folioItem.count({
        where: {
          itemType: FolioItemType.ROOM_CHARGE,
          isVoided: false,
          postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
          folio: { stay: { roomAssignments: { some: { room: { propertyId } } } } },
        },
      }),
      prisma.restaurantBill.count({
        where: {
          status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
          createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        },
      }),
    ]),
  ]);

  const rows = [
    ...roomCharges.map((item) => ({
      date: item.postedAt,
      type: 'Room Charge' as const,
      reference: item.folio?.stay?.reservation?.reservationNumber || item.folio?.folioNumber || '—',
      description: item.description || 'Room Charge',
      amount: item.amount,
      tax: item.taxAmount || new Prisma.Decimal(0),
    })),
    ...bills.map((bill) => ({
      date: bill.createdAt,
      type: 'Restaurant' as const,
      reference: bill.billNumber,
      description: `Restaurant Bill (${bill.order?.orderType || 'N/A'})`,
      amount: bill.totalAmount,
      tax: bill.taxAmount || new Prisma.Decimal(0),
    })),
  ].sort((a, b) => {
    if (sortBy === 'date') return sortOrder === 'desc' ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime();
    if (sortBy === 'amount') return sortOrder === 'desc' ? b.amount.toNumber() - a.amount.toNumber() : a.amount.toNumber() - b.amount.toNumber();
    return 0;
  });

  const totalRecords = (totalCount as number[]).reduce((a, b) => a + b, 0);

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


