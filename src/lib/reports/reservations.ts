/**
 * Reports & Analytics — Reservations Report Service
 *
 * DATE SEMANTICS:
 * - Booking volume: filtered by Reservation.createdAt (when booking was created)
 * - Cancellation count: status = CANCELLED in the filtered set
 * - Check-in/checkout dates used for arrival/departure reports, NOT this report
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma, ReservationStatus, BookingSource } from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';
import { getPeriodBuckets } from '@/lib/dashboard/date';

export interface ReservationReportSummary {
  totalReservations: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  expired: number;
  noShow: number;
  completed: number;
  averageLeadTimeDays: number | null;
  averageLengthOfStay: number | null;
  totalRoomsBooked: number;
  totalGuestsBooked: number;
  totalBookingValue: Prisma.Decimal;
}

export interface ReservationTrendPoint {
  key: string;
  label: string;
  count: number;
}

export interface BookingSourceBreakdown {
  source: string;
  count: number;
  percentage: number;
}

export interface RoomTypeDemand {
  roomType: string;
  count: number;
  percentage: number;
}

export interface ReservationReportData {
  summary: ReservationReportSummary;
  trend: ReservationTrendPoint[];
  bySource: BookingSourceBreakdown[];
  byRoomType: RoomTypeDemand[];
  byStatus: Array<{ status: string; count: number; color: string }>;
  hasData: boolean;
}

export async function getReservationReport(
  propertyId: string,
  periodRange: ResolvedPeriodRange
): Promise<ReservationReportData> {
  const { current } = periodRange;
  const buckets = getPeriodBuckets(periodRange);

  const reservations = await prisma.reservation.findMany({
    where: {
      createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
    select: {
      id: true,
      status: true,
      checkInDate: true,
      checkOutDate: true,
      totalAmount: true,
      adults: true,
      children: true,
      source: true,
      createdAt: true,
      reservedRooms: {
        select: {
          roomType: { select: { name: true } },
        },
      },
    },
  });

  let confirmed = 0, pending = 0, cancelled = 0, expired = 0, noShow = 0, completed = 0;
  let totalNights = 0;
  let totalGuests = 0;
  let totalBookingValue = new Prisma.Decimal(0);
  let totalLeadTimeDays = 0;
  let leadTimeCount = 0;
  const sourceCounts: Record<string, number> = {};
  const roomTypeCounts: Record<string, number> = {};

  const now = new Date();

  for (const r of reservations) {
    if (r.status === ReservationStatus.CONFIRMED) confirmed++;
    else if (r.status === ReservationStatus.PENDING) pending++;
    else if (r.status === ReservationStatus.CANCELLED) cancelled++;
    else if (r.status === ReservationStatus.EXPIRED) expired++;
    else if (r.status === ReservationStatus.NO_SHOW) noShow++;
    else if (r.status === ReservationStatus.COMPLETED) completed++;

    const checkInMs = r.checkInDate.getTime();
    const checkOutMs = r.checkOutDate.getTime();
    const nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (1000 * 60 * 60 * 24)));
    totalNights += nights;
    totalGuests += r.adults + (r.children || 0);
    totalBookingValue = totalBookingValue.plus(r.totalAmount);

    // Lead time: days between createdAt and checkInDate
    const leadDays = Math.round((checkInMs - r.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (leadDays >= 0) {
      totalLeadTimeDays += leadDays;
      leadTimeCount++;
    }

    sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;

    for (const rr of r.reservedRooms) {
      const rtName = rr.roomType?.name || 'Unknown';
      roomTypeCounts[rtName] = (roomTypeCounts[rtName] || 0) + 1;
    }
  }

  const totalReservations = reservations.length;
  const averageLengthOfStay = totalReservations > 0 ? Math.round((totalNights / totalReservations) * 10) / 10 : null;
  const averageLeadTimeDays = leadTimeCount > 0 ? Math.round((totalLeadTimeDays / leadTimeCount) * 10) / 10 : null;

  const summary: ReservationReportSummary = {
    totalReservations,
    confirmed,
    pending,
    cancelled,
    expired,
    noShow,
    completed,
    averageLeadTimeDays,
    averageLengthOfStay,
    totalRoomsBooked: totalNights,
    totalGuestsBooked: totalGuests,
    totalBookingValue,
  };

  // Trend
  const trend: ReservationTrendPoint[] = buckets.map((bucket) => {
    let count = 0;
    for (const r of reservations) {
      if (r.createdAt >= bucket.startTimestamp && r.createdAt < bucket.endTimestamp) count++;
    }
    return { key: bucket.key, label: bucket.label, count };
  });

  // By Source
  const bySource: BookingSourceBreakdown[] = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      source: source.replace(/_/g, ' '),
      count,
      percentage: totalReservations > 0 ? Math.round((count / totalReservations) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // By Room Type
  const byRoomType: RoomTypeDemand[] = Object.entries(roomTypeCounts)
    .map(([roomType, count]) => ({
      roomType,
      count,
      percentage: totalReservations > 0 ? Math.round((count / totalReservations) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // By Status
  const byStatus = [
    { status: 'Confirmed', count: confirmed, color: 'bg-emerald-600' },
    { status: 'Pending', count: pending, color: 'bg-amber-500' },
    { status: 'Completed', count: completed, color: 'bg-blue-600' },
    { status: 'Cancelled', count: cancelled, color: 'bg-rose-500' },
    { status: 'Expired', count: expired, color: 'bg-neutral-400' },
    { status: 'No Show', count: noShow, color: 'bg-purple-500' },
  ];

  return {
    summary,
    trend,
    bySource,
    byRoomType,
    byStatus,
    hasData: totalReservations > 0,
  };
}

/**
 * Paginated reservation detail rows.
 */
export async function getReservationDetailRows(
  _propertyId: string,
  periodRange: ResolvedPeriodRange,
  page: number = 1,
  pageSize: number = 20
) {
  const { current } = periodRange;
  const skip = (page - 1) * pageSize;

  const [rows, totalRecords] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
      include: {
        primaryGuest: {
          select: { firstName: true, lastName: true },
        },
        reservedRooms: {
          select: { roomType: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.reservation.count({
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      guestName: `${r.primaryGuest?.firstName || ''} ${r.primaryGuest?.lastName || ''}`.trim() || '—',
      roomType: r.reservedRooms?.[0]?.roomType?.name || '—',
    })),
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
    },
  };
}
