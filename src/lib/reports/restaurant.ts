/**
 * Reports & Analytics — Restaurant & F&B Report Service
 *
 * METRIC DEFINITIONS:
 * - RESTAURANT REVENUE = Sum of RestaurantBill.totalAmount where status IN (SETTLED, CHARGED_TO_ROOM)
 * - Excludes DRAFT, CANCELLED, SPLIT_CHILDREN bills
 * - Top dishes use only finalized/served/completed order items
 * - Room-service charged to room is counted as restaurant revenue, NOT room revenue
 * - POS collections are separate from restaurant revenue
 */

import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  BillStatus,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PaymentContext,
} from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';
import { getPeriodBuckets } from '@/lib/dashboard/date';

export interface RestaurantReportSummary {
  totalRevenue: Prisma.Decimal;
  totalOrders: number;
  averageOrderValue: Prisma.Decimal | null;
  dineInSales: Prisma.Decimal;
  dineInCount: number;
  takeawaySales: Prisma.Decimal;
  takeawayCount: number;
  roomServiceSales: Prisma.Decimal;
  roomServiceCount: number;
  posCollections: Prisma.Decimal;
}

export interface RestaurantTrendPoint {
  key: string;
  label: string;
  sales: number;
  orderCount: number;
}

export interface TopSellingDish {
  rank: number;
  name: string;
  category: string;
  quantitySold: number;
  salesValue: Prisma.Decimal;
}

export interface SalesByCategory {
  category: string;
  amount: number;
  percentage: number;
}

export interface RestaurantReportData {
  summary: RestaurantReportSummary;
  trend: RestaurantTrendPoint[];
  topDishes: TopSellingDish[];
  salesByCategory: SalesByCategory[];
  hasData: boolean;
}

export async function getRestaurantReport(
  periodRange: ResolvedPeriodRange
): Promise<RestaurantReportData> {
  const { current } = periodRange;
  const buckets = getPeriodBuckets(periodRange);

  // Bills in period (revenue recognition)
  const bills = await prisma.restaurantBill.findMany({
    where: {
      status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
      createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
    select: {
      totalAmount: true,
      createdAt: true,
      order: { select: { orderType: true } },
    },
  });

  // Finalized orders for count and order type analysis
  const orders = await prisma.restaurantOrder.findMany({
    where: {
      status: { in: [OrderStatus.SERVED, OrderStatus.DELIVERED, OrderStatus.BILLED, OrderStatus.COMPLETED] },
      createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
    select: { id: true, orderType: true, createdAt: true },
  });

  // POS collections
  const posAgg = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: {
      context: PaymentContext.RESTAURANT_BILL,
      status: PaymentStatus.SUCCESS,
      paymentDate: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
  });

  // Aggregate
  let totalRevenue = new Prisma.Decimal(0);
  let dineInSales = new Prisma.Decimal(0);
  let takeawaySales = new Prisma.Decimal(0);
  let roomServiceSales = new Prisma.Decimal(0);
  let dineInCount = 0, takeawayCount = 0, roomServiceCount = 0;

  for (const bill of bills) {
    totalRevenue = totalRevenue.plus(bill.totalAmount);
    const type = bill.order?.orderType;
    if (type === OrderType.DINE_IN) { dineInSales = dineInSales.plus(bill.totalAmount); dineInCount++; }
    else if (type === OrderType.TAKE_AWAY) { takeawaySales = takeawaySales.plus(bill.totalAmount); takeawayCount++; }
    else if (type === OrderType.ROOM_SERVICE) { roomServiceSales = roomServiceSales.plus(bill.totalAmount); roomServiceCount++; }
  }

  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue.dividedBy(new Prisma.Decimal(totalOrders)) : null;
  const posCollections = posAgg._sum.amount || new Prisma.Decimal(0);

  const summary: RestaurantReportSummary = {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    dineInSales,
    dineInCount,
    takeawaySales,
    takeawayCount,
    roomServiceSales,
    roomServiceCount,
    posCollections,
  };

  // Trend
  const trend: RestaurantTrendPoint[] = buckets.map((bucket) => {
    let sales = new Prisma.Decimal(0);
    let orderCount = 0;
    for (const b of bills) {
      if (b.createdAt >= bucket.startTimestamp && b.createdAt < bucket.endTimestamp) sales = sales.plus(b.totalAmount);
    }
    for (const o of orders) {
      if (o.createdAt >= bucket.startTimestamp && o.createdAt < bucket.endTimestamp) orderCount++;
    }
    return { key: bucket.key, label: bucket.label, sales: sales.toNumber(), orderCount };
  });

  // Top dishes via SQL
  const topDishesRaw = await prisma.$queryRaw<
    Array<{ name: string; category: string; quantity_sold: number | bigint; total_revenue: string | number | null }>
  >`
    SELECT 
      mi.name as name,
      COALESCE(mc.name, 'Uncategorized') as category,
      CAST(SUM(roi.quantity) AS INTEGER) as quantity_sold,
      SUM(roi."unitPrice" * roi.quantity) as total_revenue
    FROM "RestaurantOrderItem" roi
    JOIN "RestaurantOrder" ro ON roi."orderId" = ro.id
    JOIN "MenuItem" mi ON roi."menuItemId" = mi.id
    LEFT JOIN "MenuCategory" mc ON mi."categoryId" = mc.id
    WHERE ro.status IN ('SERVED', 'DELIVERED', 'BILLED', 'COMPLETED')
      AND ro."createdAt" >= ${current.startTimestamp}
      AND ro."createdAt" < ${current.endTimestamp}
    GROUP BY mi.name, mc.name
    ORDER BY quantity_sold DESC
    LIMIT 10
  `;

  const topDishes: TopSellingDish[] = topDishesRaw.map((item, index) => ({
    rank: index + 1,
    name: item.name,
    category: item.category,
    quantitySold: Number(item.quantity_sold),
    salesValue: new Prisma.Decimal(item.total_revenue?.toString() || '0'),
  }));

  // Sales by category
  const totalRevNum = totalRevenue.toNumber();
  const salesByCategory: SalesByCategory[] = [
    { category: 'Dine-In', amount: dineInSales.toNumber(), percentage: totalRevNum > 0 ? Math.round((dineInSales.toNumber() / totalRevNum) * 1000) / 10 : 0 },
    { category: 'Take-Away', amount: takeawaySales.toNumber(), percentage: totalRevNum > 0 ? Math.round((takeawaySales.toNumber() / totalRevNum) * 1000) / 10 : 0 },
    { category: 'Room Service', amount: roomServiceSales.toNumber(), percentage: totalRevNum > 0 ? Math.round((roomServiceSales.toNumber() / totalRevNum) * 1000) / 10 : 0 },
  ];

  return {
    summary,
    trend,
    topDishes,
    salesByCategory,
    hasData: totalRevNum > 0 || totalOrders > 0,
  };
}

export async function getRestaurantDetailRows(
  periodRange: ResolvedPeriodRange,
  page: number = 1,
  pageSize: number = 20
) {
  const { current } = periodRange;
  const skip = (page - 1) * pageSize;

  const [rows, totalRecords] = await Promise.all([
    prisma.restaurantBill.findMany({
      where: {
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
      select: {
        id: true,
        billNumber: true,
        totalAmount: true,
        taxAmount: true,
        status: true,
        createdAt: true,
        order: {
          select: {
            orderType: true,
            restaurant: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.restaurantBill.count({
      where: {
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
    }),
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
