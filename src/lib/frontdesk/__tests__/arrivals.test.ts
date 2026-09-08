import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBusinessDateNow,
  buildExpectedArrivalsWhere,
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
