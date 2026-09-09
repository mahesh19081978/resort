import { prisma } from '@/lib/db/prisma';
import { Prisma, ReservationStatus } from '@prisma/client';
import { getBusinessDateNow, getBusinessDayTimestampRange } from './date';

export interface ReservationMetrics {
  todayBookingsCount: number;
  pendingBookingsCount: number;
  confirmedBookingsCount: number;
  cancelledBookingsCount: number;
  todayBookedValue: Prisma.Decimal;
}

/**
 * Authoritative Reservation and Booking volume metrics.
 * Uses Decimal aggregation for financial booked totals.
 */
export async function getReservationMetrics(
  businessDate: string = getBusinessDateNow()
): Promise<ReservationMetrics> {
  const { start, end } = getBusinessDayTimestampRange(businessDate);
  const now = new Date();

  const [
    todayBookingsCount,
    pendingBookingsCount,
    confirmedBookingsCount,
    cancelledBookingsCount,
    bookedValueAgg,
  ] = await Promise.all([
    prisma.reservation.count({
      where: {
        createdAt: { gte: start, lt: end },
        status: { not: ReservationStatus.CANCELLED },
      },
    }),
    prisma.reservation.count({
      where: {
        status: ReservationStatus.PENDING,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    prisma.reservation.count({
      where: {
        status: ReservationStatus.CONFIRMED,
      },
    }),
    prisma.reservation.count({
      where: {
        status: ReservationStatus.CANCELLED,
      },
    }),
    prisma.reservation.aggregate({
      _sum: { totalAmount: true },
      where: {
        createdAt: { gte: start, lt: end },
        status: { not: ReservationStatus.CANCELLED },
      },
    }),
  ]);

  return {
    todayBookingsCount,
    pendingBookingsCount,
    confirmedBookingsCount,
    cancelledBookingsCount,
    todayBookedValue: bookedValueAgg._sum.totalAmount || new Prisma.Decimal(0),
  };
}
