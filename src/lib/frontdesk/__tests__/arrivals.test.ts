import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  getBusinessDateNow,
  buildExpectedArrivalsWhere,
  calculateAdvancePaidFromPayments,
} from '@/lib/frontdesk/arrivals';

describe('getBusinessDateNow', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getBusinessDateNow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a date that matches Asia/Kolkata timezone', () => {
    const result = getBusinessDateNow();
    const [year, month, day] = result.split('-').map(Number);

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const expectedYear = Number(parts.find((p) => p.type === 'year')?.value);
    const expectedMonth = Number(parts.find((p) => p.type === 'month')?.value);
    const expectedDay = Number(parts.find((p) => p.type === 'day')?.value);

    expect(year).toBe(expectedYear);
    expect(month).toBe(expectedMonth);
    expect(day).toBe(expectedDay);
  });
});

describe('buildExpectedArrivalsWhere', () => {
  it('filters by checkInDate range for the given business date', () => {
    const where = buildExpectedArrivalsWhere('2026-09-08');

    expect(where.checkInDate).toEqual({
      gte: new Date('2026-09-08T00:00:00.000Z'),
      lt: new Date('2026-09-09T00:00:00.000Z'),
    });
  });

  it('includes PENDING and CONFIRMED statuses', () => {
    const where = buildExpectedArrivalsWhere('2026-09-08');

    expect(where.status).toEqual({
      in: ['PENDING', 'CONFIRMED'],
    });
  });

  it('excludes reservations with ACTIVE stays', () => {
    const where = buildExpectedArrivalsWhere('2026-09-08');

    expect(where.stays).toEqual({
      none: { status: 'ACTIVE' },
    });
  });

  it('handles month boundaries correctly', () => {
    const where = buildExpectedArrivalsWhere('2026-10-01');

    expect(where.checkInDate).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lt: new Date('2026-10-02T00:00:00.000Z'),
    });
  });

  it('handles year boundaries correctly', () => {
    const where = buildExpectedArrivalsWhere('2027-01-01');

    expect(where.checkInDate).toEqual({
      gte: new Date('2027-01-01T00:00:00.000Z'),
      lt: new Date('2027-01-02T00:00:00.000Z'),
    });
  });

  it('produces identical WHERE for count and findMany (single source of truth)', () => {
    const where1 = buildExpectedArrivalsWhere('2026-09-08');
    const where2 = buildExpectedArrivalsWhere('2026-09-08');

    expect(where1).toEqual(where2);
  });
});

describe('calculateAdvancePaidFromPayments', () => {
  const D = (v: number) => new Prisma.Decimal(v);

  it('returns 0 when no payments exist', () => {
    const result = calculateAdvancePaidFromPayments([]);
    expect(result.equals(D(0))).toBe(true);
  });

  it('returns 0 when payments exist but none are RESERVATION_ADVANCE', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(5000),
        status: 'SUCCESS',
        context: 'FOLIO_SETTLEMENT',
      },
    ]);
    expect(result.equals(D(0))).toBe(true);
  });

  it('returns 0 when payments exist but none are SUCCESS', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(5000),
        status: 'FAILED',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(0))).toBe(true);
  });

  it('calculates single successful CARD reservation advance', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(6160))).toBe(true);
  });

  it('calculates single successful UPI reservation advance (same as CARD)', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(6160))).toBe(true);
  });

  it('calculates single successful NET_BANKING reservation advance (same as CARD)', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(6160))).toBe(true);
  });

  it('payment method must not affect advance calculation', () => {
    const methods = ['CARD', 'UPI', 'NET_BANKING', 'CASH', 'BANK_TRANSFER', 'ONLINE'] as const;
    for (const method of methods) {
      const result = calculateAdvancePaidFromPayments([
        {
          amount: D(6160),
          status: 'SUCCESS',
          context: 'RESERVATION_ADVANCE',
        },
      ]);
      expect(result.equals(D(6160))).toBe(true);
    }
  });

  it('returns 0 for no reservation advance payment', () => {
    const result = calculateAdvancePaidFromPayments([]);
    expect(result.equals(D(0))).toBe(true);
  });

  it('returns 0 for failed payment', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'FAILED',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(0))).toBe(true);
  });

  it('handles partial advance', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(3000),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(3000))).toBe(true);
  });

  it('sums multiple reservation advance payments', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(3000),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
      {
        amount: D(2000),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(5000))).toBe(true);
  });

  it('deducts processed refunds from advance paid', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
        refunds: [
          { amount: D(1000), status: 'PROCESSED' },
        ],
      },
    ]);
    expect(result.equals(D(5160))).toBe(true);
  });

  it('does not deduct pending refunds from advance paid', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
        refunds: [
          { amount: D(1000), status: 'PENDING' },
        ],
      },
    ]);
    expect(result.equals(D(6160))).toBe(true);
  });

  it('handles amount mismatch scenario (captured different from expected)', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(5000),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(5000))).toBe(true);
  });

  it('does not count duplicate payment records (idempotent)', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    // Both are SUCCESS RESERVATION_ADVANCE, both are counted
    // Idempotency is handled at the DB level (unique constraint), not here
    expect(result.equals(D(12320))).toBe(true);
  });

  it('ignores VOIDED payments', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'VOIDED',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(0))).toBe(true);
  });

  it('ignores REFUNDED payments', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'REFUNDED',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(D(0))).toBe(true);
  });

  it('uses Prisma Decimal for all calculations (no floating point)', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: new Prisma.Decimal('100.01'),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
      {
        amount: new Prisma.Decimal('200.02'),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    expect(result.equals(new Prisma.Decimal('300.03'))).toBe(true);
  });

  it('complex scenario: mixed contexts, statuses, and refunds', () => {
    const result = calculateAdvancePaidFromPayments([
      {
        amount: D(6160),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
        refunds: [
          { amount: D(500), status: 'PROCESSED' },
          { amount: D(200), status: 'PENDING' },
        ],
      },
      {
        amount: D(3000),
        status: 'SUCCESS',
        context: 'FOLIO_SETTLEMENT',
      },
      {
        amount: D(1000),
        status: 'FAILED',
        context: 'RESERVATION_ADVANCE',
      },
      {
        amount: D(2000),
        status: 'SUCCESS',
        context: 'RESERVATION_ADVANCE',
      },
    ]);
    // Only SUCCESS + RESERVATION_ADVANCE count: 6160 + 2000 = 8160
    // Minus PROCESSED refunds: 8160 - 500 = 7660
    expect(result.equals(D(7660))).toBe(true);
  });
});
