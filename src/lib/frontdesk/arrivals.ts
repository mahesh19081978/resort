import { prisma } from '@/lib/db/prisma';
import { Prisma, ReservationStatus } from '@prisma/client';

const PROPERTY_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's business date as a YYYY-MM-DD string in the property timezone (Asia/Kolkata).
 * Uses Intl.DateTimeFormat to avoid timezone shift bugs with Date arithmetic.
 */
export function getBusinessDateNow(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROPERTY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? String(now.getFullYear());
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/**
 * Converts a YYYY-MM-DD business date string to a JavaScript Date representing
 * the start of that calendar day in UTC (safe for Prisma @db.Date comparison).
 */
function businessDateToUtcStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Returns the next business date as a YYYY-MM-DD string.
 */
function nextBusinessDate(dateStr: string): string {
  const d = businessDateToUtcStart(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the Prisma WHERE clause for "Expected Arrivals" — the authoritative
 * business rule shared between the dashboard count and the arrivals page rows.
 *
 * A reservation qualifies as an Expected Arrival when:
 *   1. checkInDate = businessDate (date-only comparison, no timezone shift)
 *   2. status IN (PENDING, CONFIRMED)
 *   3. Does NOT already have an ACTIVE Stay
 *   4. Is not cancelled / expired (implicit via status filter)
 */
export function buildExpectedArrivalsWhere(businessDate: string): Prisma.ReservationWhereInput {
  const dayStart = businessDateToUtcStart(businessDate);
  const dayEnd = businessDateToUtcStart(nextBusinessDate(businessDate));

  return {
    checkInDate: { gte: dayStart, lt: dayEnd },
    status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
    stays: {
      none: { status: 'ACTIVE' as const },
    },
  };
}

/**
 * Returns the count of expected arrivals for the given business date.
 * Used by the Front Desk dashboard card.
 */
export async function getExpectedArrivalsCount(businessDate: string): Promise<number> {
  const where = buildExpectedArrivalsWhere(businessDate);
  return prisma.reservation.count({ where });
}

/**
 * Returns the full reservation rows for expected arrivals.
 * Used by the Arrivals page.
 */
export async function getExpectedArrivals(businessDate: string) {
  const where = buildExpectedArrivalsWhere(businessDate);

  return prisma.reservation.findMany({
    where,
    include: {
      primaryGuest: true,
      reservedRooms: {
        include: { roomType: true },
      },
    },
    orderBy: { checkInDate: 'asc' },
    take: 50,
  });
}
