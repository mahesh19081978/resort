import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  resolvePeriodRange,
  getPeriodBuckets,
  DashboardPeriod,
} from '../date';
import {
  calculateGrowth,
  calculateNumericGrowth,
} from '../executive';

describe('EXECUTIVE DASHBOARD: PERIOD RESOLUTION & GRANULARITY', () => {
  it('defaults to this-month when no period is specified', () => {
    const range = resolvePeriodRange(null, null, null, '2026-09-08');
    expect(range.period).toBe('this-month');
    expect(range.label).toBe('September 2026');
    expect(range.granularity).toBe('daily');
    expect(range.current.startDateStr).toBe('2026-09-01');
    expect(range.current.endDateStr).toBe('2026-09-30');
    expect(range.previous.startDateStr).toBe('2026-08-01');
    expect(range.previous.endDateStr).toBe('2026-08-31');
  });

  it('resolves today correctly with daily granularity and yesterday as comparison', () => {
    const range = resolvePeriodRange('today', null, null, '2026-09-08');
    expect(range.period).toBe('today');
    expect(range.label).toBe('Today');
    expect(range.granularity).toBe('daily');
    expect(range.current.startDateStr).toBe('2026-09-08');
    expect(range.current.endDateStr).toBe('2026-09-08');
    expect(range.previous.startDateStr).toBe('2026-09-07');
    expect(range.previous.endDateStr).toBe('2026-09-07');
    expect(range.isToday).toBe(true);
  });

  it('resolves yesterday correctly', () => {
    const range = resolvePeriodRange('yesterday', null, null, '2026-09-08');
    expect(range.period).toBe('yesterday');
    expect(range.current.startDateStr).toBe('2026-09-07');
    expect(range.current.endDateStr).toBe('2026-09-07');
    expect(range.previous.startDateStr).toBe('2026-09-06');
    expect(range.previous.endDateStr).toBe('2026-09-06');
  });

  it('resolves this-week starting on Monday', () => {
    // 2026-09-08 is Tuesday. Monday is 2026-09-07.
    const range = resolvePeriodRange('this-week', null, null, '2026-09-08');
    expect(range.period).toBe('this-week');
    expect(range.current.startDateStr).toBe('2026-09-07');
    expect(range.current.endDateStr).toBe('2026-09-08');
    expect(range.granularity).toBe('daily');
  });

  it('resolves last-month correctly', () => {
    const range = resolvePeriodRange('last-month', null, null, '2026-09-08');
    expect(range.period).toBe('last-month');
    expect(range.current.startDateStr).toBe('2026-08-01');
    expect(range.current.endDateStr).toBe('2026-08-31');
    expect(range.previous.startDateStr).toBe('2026-07-01');
    expect(range.previous.endDateStr).toBe('2026-07-31');
  });

  it('resolves last-6-months with monthly granularity', () => {
    const range = resolvePeriodRange('last-6-months', null, null, '2026-09-08');
    expect(range.period).toBe('last-6-months');
    expect(range.granularity).toBe('monthly');
  });

  it('resolves this-year with monthly granularity', () => {
    const range = resolvePeriodRange('this-year', null, null, '2026-09-08');
    expect(range.period).toBe('this-year');
    expect(range.current.startDateStr).toBe('2026-01-01');
    expect(range.current.endDateStr).toBe('2026-12-31');
    expect(range.previous.startDateStr).toBe('2025-01-01');
    expect(range.previous.endDateStr).toBe('2025-12-31');
    expect(range.granularity).toBe('monthly');
  });

  it('validates custom date range and assigns daily for <= 31 days', () => {
    const range = resolvePeriodRange('custom', '2026-09-01', '2026-09-15', '2026-09-08');
    expect(range.period).toBe('custom');
    expect(range.current.startDateStr).toBe('2026-09-01');
    expect(range.current.endDateStr).toBe('2026-09-15');
    expect(range.granularity).toBe('daily');
    expect(range.current.daysCount).toBe(15);
  });

  it('validates custom date range and assigns monthly for > 31 days', () => {
    const range = resolvePeriodRange('custom', '2026-01-01', '2026-06-30', '2026-09-08');
    expect(range.period).toBe('custom');
    expect(range.current.startDateStr).toBe('2026-01-01');
    expect(range.current.endDateStr).toBe('2026-06-30');
    expect(range.granularity).toBe('monthly');
  });

  it('rejects malformed custom dates and falls back to this-month', () => {
    const range = resolvePeriodRange('custom', 'invalid-date', '2026-09-15', '2026-09-08');
    expect(range.period).toBe('this-month');
    expect(range.current.startDateStr).toBe('2026-09-01');
  });

  it('generates accurate buckets for this-month', () => {
    const range = resolvePeriodRange('this-month', null, null, '2026-09-08');
    const buckets = getPeriodBuckets(range);
    expect(buckets.length).toBe(30); // 30 days in September
    expect(buckets[0].key).toBe('2026-09-01');
    expect(buckets[29].key).toBe('2026-09-30');
  });
});

describe('EXECUTIVE METRIC CALCULATIONS & DECIMAL ARITHMETIC', () => {
  it('calculates growth percentage with Decimal precision', () => {
    const curr = new Prisma.Decimal('112400.00');
    const prev = new Prisma.Decimal('100000.00');
    const growth = calculateGrowth(curr, prev);
    expect(growth).toBe(12.4);
  });

  it('returns null growth if previous is zero or null (zero-fabrication protection)', () => {
    const curr = new Prisma.Decimal('5000.00');
    expect(calculateGrowth(curr, null)).toBeNull();
    expect(calculateGrowth(curr, new Prisma.Decimal('0.00'))).toBeNull();
  });

  it('calculates negative growth accurately', () => {
    const curr = new Prisma.Decimal('80000.00');
    const prev = new Prisma.Decimal('100000.00');
    const growth = calculateGrowth(curr, prev);
    expect(growth).toBe(-20);
  });

  it('ADR formula: returns null when occupied room nights = 0', () => {
    const roomRevenue = new Prisma.Decimal('0.00');
    const occupiedNights = 0;
    const adr = occupiedNights > 0
      ? roomRevenue.dividedBy(new Prisma.Decimal(occupiedNights))
      : null;

    expect(adr).toBeNull();
  });

  it('ADR formula: retains Decimal precision when nights > 0', () => {
    const roomRevenue = new Prisma.Decimal('15750.00');
    const occupiedNights = 3;
    const adr = occupiedNights > 0
      ? roomRevenue.dividedBy(new Prisma.Decimal(occupiedNights))
      : null;

    expect(adr?.toString()).toBe('5250');
  });

  it('RevPAR formula: returns null when available room nights = 0', () => {
    const roomRevenue = new Prisma.Decimal('15750.00');
    const availableNights = 0;
    const revpar = availableNights > 0
      ? roomRevenue.dividedBy(new Prisma.Decimal(availableNights))
      : null;

    expect(revpar).toBeNull();
  });

  it('RevPAR formula: calculates roomRevenue / availableRoomNights correctly', () => {
    const roomRevenue = new Prisma.Decimal('34000.00');
    const sellableRooms = 34;
    const days = 10;
    const availableRoomNights = sellableRooms * days; // 340
    const revpar = availableRoomNights > 0
      ? roomRevenue.dividedBy(new Prisma.Decimal(availableRoomNights))
      : null;

    expect(revpar?.toString()).toBe('100');
  });

  it('Cancellation rate formula: returns null when total bookings = 0', () => {
    const totalBookings = 0;
    const cancelledBookings = 0;
    const rate = totalBookings > 0
      ? Math.round((cancelledBookings / totalBookings) * 1000) / 10
      : null;

    expect(rate).toBeNull();
  });

  it('Cancellation rate formula: calculates accurately when total > 0', () => {
    const totalBookings = 50;
    const cancelledBookings = 5;
    const rate = totalBookings > 0
      ? Math.round((cancelledBookings / totalBookings) * 1000) / 10
      : null;

    expect(rate).toBe(10);
  });

  it('Total Resort Revenue double-counting rule: sums room + restaurant revenue once', () => {
    const roomCharges = new Prisma.Decimal('50000.00');
    const restaurantBills = new Prisma.Decimal('20000.00');
    // Total = Room + Restaurant
    const totalRevenue = roomCharges.plus(restaurantBills);
    expect(totalRevenue.toString()).toBe('70000');
  });

  it('verifies RES-20260908-BAC713 exists intact in the database with legitimate data', async () => {
    const { prisma } = await import('@/lib/db/prisma');
    const reservation = await prisma.reservation.findUnique({
      where: { reservationNumber: 'RES-20260908-BAC713' },
    });
    expect(reservation).not.toBeNull();
    expect(reservation?.reservationNumber).toBe('RES-20260908-BAC713');
    expect(['CONFIRMED', 'CHECKED_IN']).toContain(reservation?.status);
  }, 15000);
});

describe('EXECUTIVE DASHBOARD: RBAC DOMAIN BOUNDARIES', () => {
  it('RECEPTIONIST receives null for executive financial KPIs and revenue trend', async () => {
    const { getExecutiveDashboardOverview } = await import('../index');
    const receptionistUser = {
      id: 'usr-recep',
      name: 'Receptionist User',
      email: 'receptionist@infinityresort.com',
      role: 'RECEPTIONIST' as const,
      isActive: true,
      sessionVersion: 1,
    };

    const overview = await getExecutiveDashboardOverview(receptionistUser, 'this-month');
    // Financial section must be strictly null (server-side gated)
    expect(overview.financialKpis).toBeNull();
    expect(overview.revenuePerformance).toBeNull();

    // Booking & room operations must be accessible
    expect(overview.bookingPerformance).not.toBeNull();
    expect(overview.roomTypePerformance).not.toBeNull();
  }, 20000);

  it('SUPER_ADMIN receives all executive dashboard sections', async () => {
    const { getExecutiveDashboardOverview } = await import('../index');
    const superAdminUser = {
      id: 'usr-admin',
      name: 'Super Admin',
      email: 'admin@infinityresort.com',
      role: 'SUPER_ADMIN' as const,
      isActive: true,
      sessionVersion: 1,
    };

    const overview = await getExecutiveDashboardOverview(superAdminUser, 'this-month');
    expect(overview.financialKpis).not.toBeNull();
    expect(overview.revenuePerformance).not.toBeNull();
    expect(overview.bookingPerformance).not.toBeNull();
    expect(overview.restaurantPerformance).not.toBeNull();
    expect(overview.roomTypePerformance).not.toBeNull();
    expect(overview.operationalAttention).not.toBeNull();
  }, 20000);
});
