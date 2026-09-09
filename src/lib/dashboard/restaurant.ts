import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  TableSessionStatus,
  OrderStatus,
  KOTStatus,
  BillStatus,
  PaymentContext,
  PaymentStatus,
} from '@prisma/client';
import { getBusinessDateNow, getBusinessDayTimestampRange } from './date';

export interface RestaurantMetrics {
  activeSessionsCount: number;
  totalTables: number;
  activeOrdersCount: number;
  pendingKOTsCount: number;
  readyKOTsCount: number;
  todayRestaurantSales: Prisma.Decimal;
  todayPosCollections: Prisma.Decimal;
}

/**
 * Authoritative Restaurant POS and Kitchen metrics.
 *
 * Rules:
 * 1. Today's Restaurant Sales = Sum of historical transaction snapshot (totalAmount)
 *    from RestaurantBill records with status SETTLED or CHARGED_TO_ROOM created today.
 * 2. Today's POS Collections = Direct cash/UPI/card payments recorded at POS
 *    (context: RESTAURANT_BILL, status: SUCCESS).
 * 3. Room-service charges posted to folios are realized sales, but NOT counted as POS cash collections.
 */
export async function getRestaurantMetrics(
  businessDate: string = getBusinessDateNow(),
  restaurantId?: string
): Promise<RestaurantMetrics> {
  const { start, end } = getBusinessDayTimestampRange(businessDate);

  const [
    activeSessionsCount,
    totalTables,
    activeOrdersCount,
    pendingKOTsCount,
    readyKOTsCount,
    salesAgg,
    posCollectionsAgg,
  ] = await Promise.all([
    prisma.tableSession.count({
      where: {
        status: TableSessionStatus.ACTIVE,
        ...(restaurantId
          ? {
              tables: {
                some: { table: { restaurantId } },
              },
            }
          : {}),
      },
    }),
    prisma.restaurantTable.count({
      where: {
        isActive: true,
        ...(restaurantId ? { restaurantId } : {}),
      },
    }),
    prisma.restaurantOrder.count({
      where: {
        status: {
          in: [OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.SERVED],
        },
        ...(restaurantId ? { restaurantId } : {}),
      },
    }),
    prisma.kOT.count({
      where: {
        status: { in: [KOTStatus.SENT, KOTStatus.PREPARING] },
        ...(restaurantId ? { order: { restaurantId } } : {}),
      },
    }),
    prisma.kOT.count({
      where: {
        status: KOTStatus.READY,
        ...(restaurantId ? { order: { restaurantId } } : {}),
      },
    }),
    prisma.restaurantBill.aggregate({
      _sum: { totalAmount: true },
      where: {
        createdAt: { gte: start, lt: end },
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
        ...(restaurantId ? { order: { restaurantId } } : {}),
      },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        context: PaymentContext.RESTAURANT_BILL,
        status: PaymentStatus.SUCCESS,
        paymentDate: { gte: start, lt: end },
        ...(restaurantId ? { restaurantBill: { order: { restaurantId } } } : {}),
      },
    }),
  ]);

  return {
    activeSessionsCount,
    totalTables,
    activeOrdersCount,
    pendingKOTsCount,
    readyKOTsCount,
    todayRestaurantSales: salesAgg._sum.totalAmount || new Prisma.Decimal(0),
    todayPosCollections: posCollectionsAgg._sum.amount || new Prisma.Decimal(0),
  };
}
