/**
 * Resort & Restaurant Management System — Executive Analytics Domain Service
 * 
 * Single source of truth for Executive / General Manager performance analytics:
 * - Revenue (Room, Restaurant, Total Resort Revenue) with Decimal precision
 * - Occupancy % (Historical interval-derived & Live)
 * - ADR (Average Daily Rate) & RevPAR (Revenue Per Available Room)
 * - Time-series trends (Revenue, Bookings, Restaurant Sales)
 * - Commercial booking analytics & status breakdown
 * - Restaurant performance, order types, and top-selling dishes
 * - Room type performance
 * - Compact operational attention alerts
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma, PhysicalRoomStatus, BillStatus, OrderType, OrderStatus, FolioItemType, ReservationStatus } from '@prisma/client';
import { ResolvedPeriodRange, PeriodBucket, getPeriodBuckets, getBusinessDateUtcDate, getNextBusinessDate } from './date';
import { buildExpectedArrivalsWhere } from '@/lib/frontdesk/arrivals';
import { buildExpectedDeparturesWhere } from '@/lib/frontdesk/departures';

export interface ExecutiveKpiSummary {
  totalRevenue: Prisma.Decimal;
  totalRevenuePrevious: Prisma.Decimal | null;
  totalRevenueGrowth: number | null; // e.g. +12.4%

  roomRevenue: Prisma.Decimal;
  roomRevenuePrevious: Prisma.Decimal | null;
  roomRevenueGrowth: number | null;

  restaurantRevenue: Prisma.Decimal;
  restaurantRevenuePrevious: Prisma.Decimal | null;
  restaurantRevenueGrowth: number | null;

  occupancyRate: number; // e.g. 62.5%
  occupancyRatePrevious: number | null;
  occupancyRateGrowth: number | null;
  occupiedRoomNights: number;
  availableRoomNights: number;

  adr: Prisma.Decimal | null; // null if 0 occupied nights (displays as —)
  adrPrevious: Prisma.Decimal | null;
  adrGrowth: number | null;

  revpar: Prisma.Decimal | null; // null if 0 available nights (displays as —)
  revparPrevious: Prisma.Decimal | null;
  revparGrowth: number | null;
}

export interface RevenueTrendPoint {
  key: string;
  label: string;
  dateStr: string;
  roomRevenue: number;
  restaurantRevenue: number;
  totalRevenue: number;
}

export interface RevenuePerformanceData {
  trend: RevenueTrendPoint[];
  hasData: boolean;
  roomRevenueTotal: Prisma.Decimal;
  restaurantRevenueTotal: Prisma.Decimal;
  totalRevenueTotal: Prisma.Decimal;
  roomRevenueSharePct: number;
  restaurantRevenueSharePct: number;
}

export interface BookingStatusCount {
  status: string;
  label: string;
  count: number;
  color: string;
}

export interface BookingPerformanceData {
  totalBookings: number;
  confirmedBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  completedBookings: number;
  roomNightsBooked: number;
  totalBookedValue: Prisma.Decimal;
  averageBookingValue: Prisma.Decimal | null;
  cancellationRate: number | null; // null if total = 0
  previousTotalBookings: number | null;
  bookingGrowth: number | null;
  trend: Array<{ key: string; label: string; count: number }>;
  statusBreakdown: BookingStatusCount[];
}

export interface TopSellingDishItem {
  rank: number;
  name: string;
  quantitySold: number;
  salesValue: number;
}

export interface RestaurantExecutiveData {
  totalSales: Prisma.Decimal;
  totalOrders: number;
  averageOrderValue: Prisma.Decimal | null;
  salesPrevious: Prisma.Decimal | null;
  salesGrowth: number | null;
  orderTypeBreakdown: {
    dineInCount: number;
    dineInSales: Prisma.Decimal;
    takeAwayCount: number;
    takeAwaySales: Prisma.Decimal;
    roomServiceCount: number;
    roomServiceSales: Prisma.Decimal;
  };
  trend: Array<{ key: string; label: string; sales: number; orderCount: number }>;
  topDishes: TopSellingDishItem[];
}

export interface RoomTypePerformanceItem {
  roomTypeId: string;
  name: string;
  totalRooms: number;
  occupiedNights: number;
  revenue: Prisma.Decimal;
  adr: Prisma.Decimal | null;
  occupancyRate: number;
}

export interface OperationalAttentionData {
  arrivalsToday: number;
  departuresToday: number;
  inHouseStays: number;
  lowStockCount: number;
  pendingKOTs: number;
  roomIssues: number;
}

/**
 * Calculates percentage growth between two Decimal values safely.
 * Returns null if previous value is null or zero (zero-fabrication prevention).
 */
export function calculateGrowth(
  current: Prisma.Decimal,
  previous: Prisma.Decimal | null
): number | null {
  if (!previous || previous.isZero()) return null;
  const currNum = current.toNumber();
  const prevNum = previous.toNumber();
  const growth = ((currNum - prevNum) / prevNum) * 100;
  return Math.round(growth * 10) / 10;
}

/**
 * Calculates percentage growth between two numeric values safely.
 */
export function calculateNumericGrowth(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  const growth = ((current - previous) / previous) * 100;
  return Math.round(growth * 10) / 10;
}

/**
 * 1. EXECUTIVE FINANCIAL & OCCUPANCY KPIS
 * Authoritative sources:
 * - Room Revenue: FolioItem (itemType: ROOM_CHARGE, isVoided: false)
 * - Restaurant Revenue: RestaurantBill (status: [SETTLED, CHARGED_TO_ROOM], excludes SPLIT_CHILDREN)
 * - Total Resort Revenue = Room Revenue + Restaurant Revenue
 * - Occupancy: Derived from Stay/RoomAssignment physical intervals (or live room status if today)
 * - ADR = Room Revenue / Occupied Room Nights
 * - RevPAR = Room Revenue / Available Room Nights
 */
export async function getExecutiveFinancialKpis(
  propertyId: string,
  periodRange: ResolvedPeriodRange
): Promise<ExecutiveKpiSummary> {
  const { current, previous, isToday } = periodRange;

  // Active sellable physical rooms for the property (excluding OUT_OF_ORDER per room-status policy)
  const [totalSellableRooms, activeRoomsCount] = await Promise.all([
    prisma.room.count({
      where: { propertyId, isActive: true, status: { not: PhysicalRoomStatus.OUT_OF_ORDER } },
    }),
    prisma.room.count({
      where: { propertyId, isActive: true },
    }),
  ]);

  const effectiveSellableRooms = totalSellableRooms > 0 ? totalSellableRooms : activeRoomsCount;

  // CURRENT PERIOD: Room Revenue (ROOM_CHARGE only, unvoided)
  const currentRoomCharges = await prisma.folioItem.aggregate({
    _sum: { amount: true },
    where: {
      itemType: FolioItemType.ROOM_CHARGE,
      isVoided: false,
      postedAt: {
        gte: current.startTimestamp,
        lt: current.endTimestamp,
      },
      folio: {
        stay: {
          roomAssignments: {
            some: {
              room: { propertyId },
            },
          },
        },
      },
    },
  });

  // PREVIOUS PERIOD: Room Revenue
  const previousRoomCharges = await prisma.folioItem.aggregate({
    _sum: { amount: true },
    where: {
      itemType: FolioItemType.ROOM_CHARGE,
      isVoided: false,
      postedAt: {
        gte: previous.startTimestamp,
        lt: previous.endTimestamp,
      },
      folio: {
        stay: {
          roomAssignments: {
            some: {
              room: { propertyId },
            },
          },
        },
      },
    },
  });

  // CURRENT PERIOD: Restaurant Revenue (Settled or Charged to Room; excludes SPLIT_CHILDREN parent bills)
  const currentRestaurantBills = await prisma.restaurantBill.aggregate({
    _sum: { totalAmount: true },
    where: {
      status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
      createdAt: {
        gte: current.startTimestamp,
        lt: current.endTimestamp,
      },
    },
  });

  // PREVIOUS PERIOD: Restaurant Revenue
  const previousRestaurantBills = await prisma.restaurantBill.aggregate({
    _sum: { totalAmount: true },
    where: {
      status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
      createdAt: {
        gte: previous.startTimestamp,
        lt: previous.endTimestamp,
      },
    },
  });

  const roomRevenue = currentRoomCharges._sum.amount || new Prisma.Decimal('0.00');
  const roomRevenuePrev = previousRoomCharges._sum.amount ?? null;
  const roomRevenueGrowth = calculateGrowth(roomRevenue, roomRevenuePrev);

  const restaurantRevenue = currentRestaurantBills._sum.totalAmount || new Prisma.Decimal('0.00');
  const restaurantRevenuePrev = previousRestaurantBills._sum.totalAmount ?? null;
  const restaurantRevenueGrowth = calculateGrowth(restaurantRevenue, restaurantRevenuePrev);

  // Total Resort Revenue = Room Revenue + Restaurant Revenue (Decimal addition)
  const totalRevenue = roomRevenue.plus(restaurantRevenue);
  const totalRevenuePrev = roomRevenuePrev !== null || restaurantRevenuePrev !== null
    ? (roomRevenuePrev || new Prisma.Decimal('0.00')).plus(restaurantRevenuePrev || new Prisma.Decimal('0.00'))
    : null;
  const totalRevenueGrowth = calculateGrowth(totalRevenue, totalRevenuePrev);

  // OCCUPANCY & ROOM NIGHTS CALCULATION
  const availableRoomNights = effectiveSellableRooms * current.daysCount;
  const availableRoomNightsPrev = effectiveSellableRooms * previous.daysCount;

  let occupiedRoomNights = 0;
  let occupancyRate = 0;

  if (isToday) {
    // Current live physical occupancy
    const liveOccupiedRooms = await prisma.room.count({
      where: { propertyId, isActive: true, status: PhysicalRoomStatus.OCCUPIED },
    });
    occupiedRoomNights = liveOccupiedRooms;
    occupancyRate = effectiveSellableRooms > 0
      ? Math.round((liveOccupiedRooms / effectiveSellableRooms) * 1000) / 10
      : 0;
  } else {
    // Historical interval calculation: Query Stays with physical RoomAssignment overlapping current range
    occupiedRoomNights = await calculateHistoricalOccupiedNights(propertyId, current.startDateStr, current.endDateStr);
    occupancyRate = availableRoomNights > 0
      ? Math.round((occupiedRoomNights / availableRoomNights) * 1000) / 10
      : 0;
  }

  // Previous period occupancy
  const occupiedRoomNightsPrev = await calculateHistoricalOccupiedNights(propertyId, previous.startDateStr, previous.endDateStr);
  const occupancyRatePrev = availableRoomNightsPrev > 0
    ? Math.round((occupiedRoomNightsPrev / availableRoomNightsPrev) * 1000) / 10
    : null;
  const occupancyRateGrowth = calculateNumericGrowth(occupancyRate, occupancyRatePrev);

  // ADR = Room Revenue / Occupied Room Nights (Decimal arithmetic)
  // If occupiedRoomNights === 0, ADR is null (mathematically undefined; displays as —)
  const adr = occupiedRoomNights > 0
    ? roomRevenue.dividedBy(new Prisma.Decimal(occupiedRoomNights))
    : null;

  const adrPrev = (occupiedRoomNightsPrev > 0 && roomRevenuePrev)
    ? roomRevenuePrev.dividedBy(new Prisma.Decimal(occupiedRoomNightsPrev))
    : null;

  const adrGrowth = (adr && adrPrev) ? calculateGrowth(adr, adrPrev) : null;

  // RevPAR = Room Revenue / Available Room Nights (Decimal arithmetic)
  const revpar = availableRoomNights > 0
    ? roomRevenue.dividedBy(new Prisma.Decimal(availableRoomNights))
    : null;

  const revparPrev = (availableRoomNightsPrev > 0 && roomRevenuePrev)
    ? roomRevenuePrev.dividedBy(new Prisma.Decimal(availableRoomNightsPrev))
    : null;

  const revparGrowth = (revpar && revparPrev) ? calculateGrowth(revpar, revparPrev) : null;

  return {
    totalRevenue,
    totalRevenuePrevious: totalRevenuePrev,
    totalRevenueGrowth,
    roomRevenue,
    roomRevenuePrevious: roomRevenuePrev,
    roomRevenueGrowth,
    restaurantRevenue,
    restaurantRevenuePrevious: restaurantRevenuePrev,
    restaurantRevenueGrowth,
    occupancyRate,
    occupancyRatePrevious: occupancyRatePrev,
    occupancyRateGrowth,
    occupiedRoomNights,
    availableRoomNights,
    adr,
    adrPrevious: adrPrev,
    adrGrowth,
    revpar,
    revparPrevious: revparPrev,
    revparGrowth,
  };
}

/**
 * Calculates historical occupied room nights from physical RoomAssignments and Stays.
 * Iterates through each calendar day in the interval and checks whether a room was physically occupied at night.
 */
export async function calculateHistoricalOccupiedNights(
  propertyId: string,
  startDateStr: string,
  endDateStr: string
): Promise<number> {
  const rangeStartTs = new Date(`${startDateStr}T00:00:00.000+05:30`);
  const nextEndDate = getNextBusinessDate(endDateStr);
  const rangeEndTs = new Date(`${nextEndDate}T00:00:00.000+05:30`);

  // Stays that were active or checked out, intersecting the reporting range
  const stays = await prisma.stay.findMany({
    where: {
      status: { in: ['ACTIVE', 'CHECKED_OUT'] },
      roomAssignments: {
        some: {
          room: { propertyId },
        },
      },
      actualCheckIn: { lt: rangeEndTs },
      OR: [
        { actualCheckOut: { gt: rangeStartTs } },
        { actualCheckOut: null, expectedCheckOut: { gt: rangeStartTs } },
      ],
    },
    select: {
      id: true,
      actualCheckIn: true,
      actualCheckOut: true,
      expectedCheckOut: true,
      roomAssignments: {
        where: {
          room: { propertyId },
        },
        select: {
          roomId: true,
          assignedAt: true,
          releasedAt: true,
          status: true,
        },
      },
    },
  });

  if (stays.length === 0) return 0;

  // For each night (at midnight boundary 23:00 IST) in the range, count unique occupied rooms
  let totalNightCount = 0;
  let currDate = startDateStr;

  while (currDate <= endDateStr) {
    const nightInstant = new Date(`${currDate}T23:00:00.000+05:30`);
    const occupiedRoomSet = new Set<string>();

    for (const stay of stays) {
      const checkIn = stay.actualCheckIn;
      const checkOut = stay.actualCheckOut || stay.expectedCheckOut;

      if (nightInstant >= checkIn && nightInstant < checkOut) {
        for (const ra of stay.roomAssignments) {
          const assignStart = ra.assignedAt;
          const assignEnd = ra.releasedAt || checkOut;
          if (nightInstant >= assignStart && nightInstant < assignEnd) {
            occupiedRoomSet.add(ra.roomId);
          }
        }
      }
    }

    totalNightCount += occupiedRoomSet.size;
    currDate = getNextBusinessDate(currDate);
  }

  return totalNightCount;
}

/**
 * 2. REVENUE PERFORMANCE TREND GRAPH
 * Generates monthly/daily trend points for Total, Room, and Restaurant Revenue using real DB data.
 */
export async function getRevenueTrend(
  propertyId: string,
  periodRange: ResolvedPeriodRange
): Promise<RevenuePerformanceData> {
  const buckets = getPeriodBuckets(periodRange);
  const { current } = periodRange;

  // Batch query all room charges in current range
  const roomCharges = await prisma.folioItem.findMany({
    where: {
      itemType: FolioItemType.ROOM_CHARGE,
      isVoided: false,
      postedAt: {
        gte: current.startTimestamp,
        lt: current.endTimestamp,
      },
      folio: {
        stay: {
          roomAssignments: {
            some: {
              room: { propertyId },
            },
          },
        },
      },
    },
    select: {
      amount: true,
      postedAt: true,
    },
  });

  // Batch query all settled/charged restaurant bills in current range
  const restaurantBills = await prisma.restaurantBill.findMany({
    where: {
      status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
      createdAt: {
        gte: current.startTimestamp,
        lt: current.endTimestamp,
      },
    },
    select: {
      totalAmount: true,
      createdAt: true,
    },
  });

  let totalRoomDecimal = new Prisma.Decimal('0.00');
  let totalRestaurantDecimal = new Prisma.Decimal('0.00');

  const trend: RevenueTrendPoint[] = buckets.map((bucket) => {
    // Sum room charges falling into bucket [startTimestamp, endTimestamp)
    let bucketRoomDec = new Prisma.Decimal('0.00');
    for (const item of roomCharges) {
      if (item.postedAt >= bucket.startTimestamp && item.postedAt < bucket.endTimestamp) {
        bucketRoomDec = bucketRoomDec.plus(item.amount);
      }
    }

    // Sum restaurant bills falling into bucket
    let bucketRestDec = new Prisma.Decimal('0.00');
    for (const bill of restaurantBills) {
      if (bill.createdAt >= bucket.startTimestamp && bill.createdAt < bucket.endTimestamp) {
        bucketRestDec = bucketRestDec.plus(bill.totalAmount);
      }
    }

    totalRoomDecimal = totalRoomDecimal.plus(bucketRoomDec);
    totalRestaurantDecimal = totalRestaurantDecimal.plus(bucketRestDec);

    const bucketTotalDec = bucketRoomDec.plus(bucketRestDec);

    return {
      key: bucket.key,
      label: bucket.label,
      dateStr: bucket.dateStr,
      roomRevenue: bucketRoomDec.toNumber(),
      restaurantRevenue: bucketRestDec.toNumber(),
      totalRevenue: bucketTotalDec.toNumber(),
    };
  });

  const totalRevDecimal = totalRoomDecimal.plus(totalRestaurantDecimal);
  const totalRevNum = totalRevDecimal.toNumber();

  const roomRevenueSharePct = totalRevNum > 0
    ? Math.round((totalRoomDecimal.toNumber() / totalRevNum) * 1000) / 10
    : 0;
  const restaurantRevenueSharePct = totalRevNum > 0
    ? Math.round((totalRestaurantDecimal.toNumber() / totalRevNum) * 1000) / 10
    : 0;

  const hasData = totalRevNum > 0;

  return {
    trend,
    hasData,
    roomRevenueTotal: totalRoomDecimal,
    restaurantRevenueTotal: totalRestaurantDecimal,
    totalRevenueTotal: totalRevDecimal,
    roomRevenueSharePct,
    restaurantRevenueSharePct,
  };
}

/**
 * 3. RESERVATIONS & BOOKING PERFORMANCE
 * Authoritative: Reservation.createdAt in period range (created booking demand).
 */
export async function getBookingPerformance(
  propertyId: string,
  periodRange: ResolvedPeriodRange
): Promise<BookingPerformanceData> {
  const { current, previous } = periodRange;
  const buckets = getPeriodBuckets(periodRange);

  // Query reservations created in current period
  const reservations = await prisma.reservation.findMany({
    where: {
      createdAt: {
        gte: current.startTimestamp,
        lt: current.endTimestamp,
      },
    },
    select: {
      id: true,
      status: true,
      checkInDate: true,
      checkOutDate: true,
      totalAmount: true,
      createdAt: true,
    },
  });

  // Previous period count for comparison
  const previousTotalBookings = await prisma.reservation.count({
    where: {
      createdAt: {
        gte: previous.startTimestamp,
        lt: previous.endTimestamp,
      },
    },
  });

  const totalBookings = reservations.length;
  let confirmedBookings = 0;
  let pendingBookings = 0;
  let cancelledBookings = 0;
  let completedBookings = 0;
  let expiredBookings = 0;
  let noShowBookings = 0;

  let totalNightsBooked = 0;
  let totalBookedValue = new Prisma.Decimal('0.00');

  for (const r of reservations) {
    if (r.status === ReservationStatus.CONFIRMED) confirmedBookings++;
    else if (r.status === ReservationStatus.PENDING) pendingBookings++;
    else if (r.status === ReservationStatus.CANCELLED) cancelledBookings++;
    else if (r.status === ReservationStatus.COMPLETED) completedBookings++;
    else if (r.status === ReservationStatus.EXPIRED) expiredBookings++;
    else if (r.status === ReservationStatus.NO_SHOW) noShowBookings++;

    // Calculate room nights booked: checkOutDate - checkInDate in days
    const checkInMs = r.checkInDate.getTime();
    const checkOutMs = r.checkOutDate.getTime();
    const nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (1000 * 60 * 60 * 24)));
    totalNightsBooked += nights;

    totalBookedValue = totalBookedValue.plus(r.totalAmount);
  }

  const averageBookingValue = totalBookings > 0
    ? totalBookedValue.dividedBy(new Prisma.Decimal(totalBookings))
    : null;

  // Cancellation rate: (Cancelled / Total Bookings) * 100. If 0 total bookings, return null.
  const cancellationRate = totalBookings > 0
    ? Math.round((cancelledBookings / totalBookings) * 1000) / 10
    : null;

  const bookingGrowth = calculateNumericGrowth(totalBookings, previousTotalBookings);

  // Time-series trend by Reservation.createdAt
  const trend = buckets.map((bucket) => {
    let count = 0;
    for (const r of reservations) {
      if (r.createdAt >= bucket.startTimestamp && r.createdAt < bucket.endTimestamp) {
        count++;
      }
    }
    return {
      key: bucket.key,
      label: bucket.label,
      count,
    };
  });

  const statusBreakdown: BookingStatusCount[] = [
    { status: 'CONFIRMED', label: 'Confirmed', count: confirmedBookings, color: 'bg-emerald-600' },
    { status: 'PENDING', label: 'Pending', count: pendingBookings, color: 'bg-amber-500' },
    { status: 'COMPLETED', label: 'Completed', count: completedBookings, color: 'bg-blue-600' },
    { status: 'CANCELLED', label: 'Cancelled', count: cancelledBookings, color: 'bg-rose-500' },
    { status: 'EXPIRED', label: 'Expired', count: expiredBookings, color: 'bg-neutral-400' },
    { status: 'NO_SHOW', label: 'No Show', count: noShowBookings, color: 'bg-purple-500' },
  ];

  return {
    totalBookings,
    confirmedBookings,
    pendingBookings,
    cancelledBookings,
    completedBookings,
    roomNightsBooked: totalNightsBooked,
    totalBookedValue,
    averageBookingValue,
    cancellationRate,
    previousTotalBookings,
    bookingGrowth,
    trend,
    statusBreakdown,
  };
}

/**
 * 4. RESTAURANT PERFORMANCE & TOP SELLING DISHES
 * Authoritative: RestaurantBill, RestaurantOrder (excluding cancelled), and Top Dishes via SQL
 */
export async function getRestaurantExecutiveAnalytics(
  periodRange: ResolvedPeriodRange,
  limit: number = 5
): Promise<RestaurantExecutiveData> {
  const { current, previous } = periodRange;
  const buckets = getPeriodBuckets(periodRange);

  // Total restaurant bills in current range
  const bills = await prisma.restaurantBill.findMany({
    where: {
      status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
      createdAt: {
        gte: current.startTimestamp,
        lt: current.endTimestamp,
      },
    },
    select: {
      totalAmount: true,
      createdAt: true,
      order: {
        select: {
          orderType: true,
        },
      },
    },
  });

  // Previous period bills for sales growth
  const prevBillsAgg = await prisma.restaurantBill.aggregate({
    _sum: { totalAmount: true },
    where: {
      status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
      createdAt: {
        gte: previous.startTimestamp,
        lt: previous.endTimestamp,
      },
    },
  });

  const totalSales = bills.reduce(
    (acc: Prisma.Decimal, b) => acc.plus(b.totalAmount),
    new Prisma.Decimal('0.00')
  );

  const salesPrevious = prevBillsAgg._sum.totalAmount ?? null;
  const salesGrowth = calculateGrowth(totalSales, salesPrevious);

  // Order counts & order type distribution (finalized/served commercial orders only)
  const orders = await prisma.restaurantOrder.findMany({
    where: {
      status: { in: [OrderStatus.SERVED, OrderStatus.DELIVERED, OrderStatus.BILLED, OrderStatus.COMPLETED] },
      createdAt: {
        gte: current.startTimestamp,
        lt: current.endTimestamp,
      },
    },
    select: {
      id: true,
      orderType: true,
      createdAt: true,
    },
  });

  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0
    ? totalSales.dividedBy(new Prisma.Decimal(totalOrders))
    : null;

  let dineInCount = 0;
  let takeAwayCount = 0;
  let roomServiceCount = 0;

  for (const o of orders) {
    if (o.orderType === OrderType.DINE_IN) dineInCount++;
    else if (o.orderType === OrderType.TAKE_AWAY) takeAwayCount++;
    else if (o.orderType === OrderType.ROOM_SERVICE) roomServiceCount++;
  }

  let dineInSales = new Prisma.Decimal('0.00');
  let takeAwaySales = new Prisma.Decimal('0.00');
  let roomServiceSales = new Prisma.Decimal('0.00');

  for (const b of bills) {
    const type = b.order?.orderType;
    if (type === OrderType.DINE_IN) dineInSales = dineInSales.plus(b.totalAmount);
    else if (type === OrderType.TAKE_AWAY) takeAwaySales = takeAwaySales.plus(b.totalAmount);
    else if (type === OrderType.ROOM_SERVICE) roomServiceSales = roomServiceSales.plus(b.totalAmount);
  }

  // Restaurant sales trend
  const trend = buckets.map((bucket) => {
    let salesDec = new Prisma.Decimal('0.00');
    let orderCount = 0;

    for (const b of bills) {
      if (b.createdAt >= bucket.startTimestamp && b.createdAt < bucket.endTimestamp) {
        salesDec = salesDec.plus(b.totalAmount);
      }
    }

    for (const o of orders) {
      if (o.createdAt >= bucket.startTimestamp && o.createdAt < bucket.endTimestamp) {
        orderCount++;
      }
    }

    return {
      key: bucket.key,
      label: bucket.label,
      sales: salesDec.toNumber(),
      orderCount,
    };
  });

  // Top Selling Dishes via database query
  // Strictly counts finalized commercial orders (SERVED, DELIVERED, BILLED, COMPLETED)
  const topDishesRaw = await prisma.$queryRaw<
    Array<{
      name: string;
      quantity_sold: number | bigint;
      total_revenue: string | number | Prisma.Decimal | null;
    }>
  >`
    SELECT 
      mi.name as name,
      CAST(SUM(roi.quantity) AS INTEGER) as quantity_sold,
      SUM(roi."unitPrice" * roi.quantity) as total_revenue
    FROM "RestaurantOrderItem" roi
    JOIN "RestaurantOrder" ro ON roi."orderId" = ro.id
    JOIN "MenuItem" mi ON roi."menuItemId" = mi.id
    WHERE ro.status IN ('SERVED', 'DELIVERED', 'BILLED', 'COMPLETED')
      AND ro."createdAt" >= ${current.startTimestamp}
      AND ro."createdAt" < ${current.endTimestamp}
    GROUP BY mi.name
    ORDER BY quantity_sold DESC
    LIMIT ${limit}
  `;

  const topDishes: TopSellingDishItem[] = (topDishesRaw as Array<{ name: string; quantity_sold: number | bigint; total_revenue?: Prisma.Decimal | number }>).map((item, index) => ({
    rank: index + 1,
    name: item.name,
    quantitySold: Number(item.quantity_sold),
    salesValue: Number(item.total_revenue?.toString() || '0'),
  }));

  return {
    totalSales,
    totalOrders,
    averageOrderValue,
    salesPrevious,
    salesGrowth,
    orderTypeBreakdown: {
      dineInCount,
      dineInSales,
      takeAwayCount,
      takeAwaySales,
      roomServiceCount,
      roomServiceSales,
    },
    trend,
    topDishes,
  };
}

/**
 * 5. ROOM PERFORMANCE BY ROOM TYPE
 * Loads room types dynamically from DB and computes nights, revenue, and ADR.
 */
export async function getRoomTypePerformance(
  propertyId: string,
  periodRange: ResolvedPeriodRange
): Promise<RoomTypePerformanceItem[]> {
  const { current } = periodRange;

  const [roomTypes, rooms] = await Promise.all([
    prisma.roomType.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.room.findMany({
      where: {
        isActive: true,
        ...(propertyId ? { propertyId } : {}),
      },
      select: { id: true, roomTypeId: true },
    }),
  ]);

  const results: RoomTypePerformanceItem[] = [];

  for (const rt of roomTypes) {
    const rtRooms = rooms.filter((r) => r.roomTypeId === rt.id);
    const totalRooms = rtRooms.length;
    const roomIds = rtRooms.map((r) => r.id);

    if (roomIds.length === 0) {
      results.push({
        roomTypeId: rt.id,
        name: rt.name,
        totalRooms: 0,
        occupiedNights: 0,
        revenue: new Prisma.Decimal('0.00'),
        adr: null,
        occupancyRate: 0,
      });
      continue;
    }

    // Revenue posted for this room type's physical rooms
    const charges = await prisma.folioItem.aggregate({
      _sum: { amount: true },
      where: {
        itemType: FolioItemType.ROOM_CHARGE,
        isVoided: false,
        postedAt: {
          gte: current.startTimestamp,
          lt: current.endTimestamp,
        },
        folio: {
          stay: {
            roomAssignments: {
              some: {
                roomId: { in: roomIds },
              },
            },
          },
        },
      },
    });

    const revenue = charges._sum.amount || new Prisma.Decimal('0.00');

    // Historical nights for rooms of this room type
    let occupiedNights = 0;
    const stays = await prisma.stay.findMany({
      where: {
        status: { in: ['ACTIVE', 'CHECKED_OUT'] },
        roomAssignments: {
          some: {
            roomId: { in: roomIds },
          },
        },
        actualCheckIn: { lt: current.endTimestamp },
        OR: [
          { actualCheckOut: { gt: current.startTimestamp } },
          { actualCheckOut: null, expectedCheckOut: { gt: current.startTimestamp } },
        ],
      },
      select: {
        actualCheckIn: true,
        actualCheckOut: true,
        expectedCheckOut: true,
        roomAssignments: {
          where: {
            roomId: { in: roomIds },
          },
          select: {
            roomId: true,
            assignedAt: true,
            releasedAt: true,
          },
        },
      },
    });

    let currDate = current.startDateStr;
    while (currDate <= current.endDateStr) {
      const nightInstant = new Date(`${currDate}T23:00:00.000+05:30`);
      const occupiedInType = new Set<string>();

      for (const s of stays) {
        const cIn = s.actualCheckIn;
        const cOut = s.actualCheckOut || s.expectedCheckOut;
        if (nightInstant >= cIn && nightInstant < cOut) {
          for (const ra of s.roomAssignments) {
            const raStart = ra.assignedAt;
            const raEnd = ra.releasedAt || cOut;
            if (nightInstant >= raStart && nightInstant < raEnd) {
              occupiedInType.add(ra.roomId);
            }
          }
        }
      }
      occupiedNights += occupiedInType.size;
      currDate = getNextBusinessDate(currDate);
    }

    const availableNights = totalRooms * current.daysCount;
    const occupancyRate = availableNights > 0
      ? Math.round((occupiedNights / availableNights) * 1000) / 10
      : 0;

    const adr = occupiedNights > 0
      ? revenue.dividedBy(new Prisma.Decimal(occupiedNights))
      : null;

    results.push({
      roomTypeId: rt.id,
      name: rt.name,
      totalRooms,
      occupiedNights,
      revenue,
      adr,
      occupancyRate,
    });
  }

  return results;
}

/**
 * 6. OPERATIONAL ATTENTION (COMPACT BOTTOM SECTION)
 * Quick navigation alerts: Arrivals, Departures, In-House, Low Stock, Pending KOTs, Room Issues
 */
export async function getOperationalAttention(
  propertyId: string,
  businessDateStr: string
): Promise<OperationalAttentionData> {
  const [
    arrivalsToday,
    departuresToday,
    inHouseStays,
    lowStockItems,
    pendingKOTs,
    roomIssues,
  ] = await Promise.all([
    // Expected Arrivals Today
    prisma.reservation.count({
      where: buildExpectedArrivalsWhere(businessDateStr),
    }),

    // Expected Departures Today
    prisma.stay.count({
      where: buildExpectedDeparturesWhere(businessDateStr),
    }),

    // In-House Active Stays
    prisma.stay.count({
      where: {
        status: 'ACTIVE',
        roomAssignments: {
          some: {
            status: 'ACTIVE',
            room: { propertyId },
          },
        },
      },
    }),

    // Low stock items (stock <= reorderLevel && reorderLevel > 0)
    prisma.inventoryItem.findMany({
      where: { isActive: true, reorderLevel: { gt: 0 } },
      select: {
        id: true,
        reorderLevel: true,
        stocks: {
          select: { quantityOnHand: true },
        },
      },
    }),

    // Pending Kitchen KOTs
    prisma.kOT.count({
      where: {
        status: { in: ['SENT', 'PREPARING'] },
      },
    }),

    // Physical rooms requiring attention (DIRTY, CLEANING, MAINTENANCE, OUT_OF_ORDER)
    prisma.room.count({
      where: {
        propertyId,
        isActive: true,
        status: {
          in: [
            PhysicalRoomStatus.DIRTY,
            PhysicalRoomStatus.CLEANING,
            PhysicalRoomStatus.MAINTENANCE,
            PhysicalRoomStatus.OUT_OF_ORDER,
          ],
        },
      },
    }),
  ]);

  let lowStockCount = 0;
  for (const item of lowStockItems) {
    const totalQty = item.stocks.reduce(
      (sum: Prisma.Decimal, s: { quantityOnHand: Prisma.Decimal }) => sum.plus(s.quantityOnHand),
      new Prisma.Decimal(0)
    );
    if (totalQty.toNumber() <= item.reorderLevel.toNumber()) {
      lowStockCount++;
    }
  }

  return {
    arrivalsToday,
    departuresToday,
    inHouseStays,
    lowStockCount,
    pendingKOTs,
    roomIssues,
  };
}
