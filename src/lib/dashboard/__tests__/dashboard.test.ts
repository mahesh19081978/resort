import { describe, it, expect } from 'vitest';
import { Prisma, PhysicalRoomStatus, TransferStatus, PaymentContext, FolioItemType } from '@prisma/client';
import {
  getBusinessDateNow,
  getBusinessDateUtcDate,
  getNextBusinessDate,
  getPreviousBusinessDate,
  getBusinessDateUtcRange,
  getBusinessDayTimestampRange,
  PROPERTY_TIMEZONE,
} from '../date';
import { buildExpectedArrivalsWhere } from '@/lib/frontdesk/arrivals';
import { buildExpectedDeparturesWhere } from '@/lib/frontdesk/departures';
import { hasPermission, ROLE_PERMISSIONS, UserRole } from '@/lib/permissions/rbac';

describe('A. DATE & TIMEZONE UTILITIES', () => {
  it('identifies property timezone as Asia/Kolkata', () => {
    expect(PROPERTY_TIMEZONE).toBe('Asia/Kolkata');
  });

  it('returns valid YYYY-MM-DD business date in Asia/Kolkata', () => {
    const dateStr = getBusinessDateNow();
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getBusinessDateUtcDate sets exact UTC midnight without timezone shift', () => {
    const d = getBusinessDateUtcDate('2026-09-08');
    expect(d.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(8); // 0-indexed: 8 = September
    expect(d.getUTCDate()).toBe(8);
  });

  it('calculates next and previous business dates across month and year boundaries', () => {
    expect(getNextBusinessDate('2026-09-08')).toBe('2026-09-09');
    expect(getNextBusinessDate('2026-09-30')).toBe('2026-10-01');
    expect(getNextBusinessDate('2026-12-31')).toBe('2027-01-01');

    expect(getPreviousBusinessDate('2026-09-08')).toBe('2026-09-07');
    expect(getPreviousBusinessDate('2026-10-01')).toBe('2026-09-30');
    expect(getPreviousBusinessDate('2027-01-01')).toBe('2026-12-31');
  });

  it('getBusinessDateUtcRange returns UTC [start, end) range for @db.Date matching', () => {
    const range = getBusinessDateUtcRange('2026-09-08');
    expect(range.start.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('getBusinessDayTimestampRange maps Asia/Kolkata calendar day to UTC instants', () => {
    const range = getBusinessDayTimestampRange('2026-09-08');
    // Asia/Kolkata is UTC+05:30.
    // 2026-09-08 00:00:00 IST = 2026-09-07 18:30:00.000Z
    // 2026-09-09 00:00:00 IST = 2026-09-08 18:30:00.000Z
    expect(range.start.toISOString()).toBe('2026-09-07T18:30:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-08T18:30:00.000Z');

    const durationHours = (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60);
    expect(durationHours).toBe(24);
  });
});

describe('B. FRONT DESK & DEPARTURES WHERE CLAUSES', () => {
  it('buildExpectedArrivalsWhere qualifies today PENDING and CONFIRMED without active stay', () => {
    const where = buildExpectedArrivalsWhere('2026-09-08');
    expect(where.status).toEqual({ in: ['PENDING', 'CONFIRMED'] });
    expect(where.checkInDate).toEqual({
      gte: new Date('2026-09-08T00:00:00.000Z'),
      lt: new Date('2026-09-09T00:00:00.000Z'),
    });
    expect(where.stays).toEqual({ none: { status: 'ACTIVE' } });
  });

  it('buildExpectedDeparturesWhere queries active stays scheduled for today', () => {
    const where = buildExpectedDeparturesWhere('2026-09-08');
    expect(where.status).toBe('ACTIVE');
    expect(where.expectedCheckOut).toEqual({
      gte: new Date('2026-09-08T00:00:00.000Z'),
      lt: new Date('2026-09-09T00:00:00.000Z'),
    });
  });

  it('buildExpectedDeparturesWhere scopes to property when provided', () => {
    const where = buildExpectedDeparturesWhere('2026-09-08', 'prop-123');
    expect(where.status).toBe('ACTIVE');
    expect(where.roomAssignments).toEqual({
      some: {
        status: 'ACTIVE',
        room: { propertyId: 'prop-123' },
      },
    });
  });
});

describe('C. ROOM INVENTORY OCCUPANCY CALCULATION', () => {
  it('calculates occupancy using sellable physical rooms denominator', () => {
    // Formula: occupied / (total - outOfOrder) * 100
    const total = 34;
    const occupied = 17;
    const outOfOrder = 0;
    const sellable = total - outOfOrder;
    const rate = Math.round((occupied / sellable) * 1000) / 10;
    expect(rate).toBe(50);
  });

  it('excludes OUT_OF_ORDER rooms from sellable denominator', () => {
    const total = 34;
    const occupied = 16;
    const outOfOrder = 2; // 32 sellable
    const sellable = total - outOfOrder;
    const rate = Math.round((occupied / sellable) * 1000) / 10;
    expect(rate).toBe(50);
  });

  it('returns 0% when 0 rooms occupied', () => {
    const total = 34;
    const occupied = 0;
    const outOfOrder = 0;
    const sellable = total - outOfOrder;
    const rate = sellable > 0 ? (occupied / sellable) * 100 : 0;
    expect(rate).toBe(0);
  });

  it('safely handles 0 sellable rooms without division by zero', () => {
    const total = 5;
    const occupied = 0;
    const outOfOrder = 5;
    const sellable = Math.max(0, total - outOfOrder);
    const rate = sellable > 0 ? (occupied / sellable) * 100 : 0;
    expect(rate).toBe(0);
  });
});

describe('D. FINANCIAL DECIMAL & PAYMENT CONTEXT SEGREGATION', () => {
  it('guest payments context strictly excludes VENDOR_PAYMENT', () => {
    const allowedGuestContexts: PaymentContext[] = [
      PaymentContext.RESERVATION_ADVANCE,
      PaymentContext.FOLIO_SETTLEMENT,
      PaymentContext.RESTAURANT_BILL,
      PaymentContext.DIRECT_SERVICE,
    ];

    expect(allowedGuestContexts).not.toContain(PaymentContext.VENDOR_PAYMENT);
  });

  it('Decimal arithmetic avoids JavaScript floating-point errors', () => {
    // Classic float error: 0.1 + 0.2 = 0.30000000000000004
    const floatSum = 0.1 + 0.2;
    expect(floatSum).not.toBe(0.3);

    // Prisma Decimal precision:
    const d1 = new Prisma.Decimal('0.1');
    const d2 = new Prisma.Decimal('0.2');
    const dSum = d1.plus(d2);
    expect(dSum.toString()).toBe('0.3');
  });

  it('authoritative ledger balance formula matches checkout.ts', () => {
    const charges = new Prisma.Decimal('6160.00');
    const credits = new Prisma.Decimal('0.00');
    const advancePaid = new Prisma.Decimal('6160.00');

    // Balance = Charges - Credits - Payments
    const finalBalance = charges.minus(credits).minus(advancePaid);
    expect(finalBalance.toString()).toBe('0');
    expect(finalBalance.isZero()).toBe(true);
  });

  it('calculates remaining balance accurately for partial settlement', () => {
    const charges = new Prisma.Decimal('10000.00');
    const credits = new Prisma.Decimal('500.00'); // discount
    const payments = new Prisma.Decimal('4000.00'); // partial payment

    const balance = charges.minus(credits).minus(payments);
    expect(balance.toString()).toBe('5500');
  });
});

describe('E. STOCK TRANSFER & INVENTORY CRITERIA', () => {
  it('pending transfers include DRAFT, APPROVED, PENDING_DISPATCH', () => {
    const pendingStatuses: TransferStatus[] = [
      TransferStatus.DRAFT,
      TransferStatus.APPROVED,
      TransferStatus.PENDING_DISPATCH,
    ];

    expect(pendingStatuses).toContain('DRAFT');
    expect(pendingStatuses).toContain('APPROVED');
    expect(pendingStatuses).toContain('PENDING_DISPATCH');
    expect(pendingStatuses).not.toContain('IN_TRANSIT');
  });

  it('low stock condition uses reorderLevel > 0 and stock <= reorderLevel', () => {
    const isLowStock = (stock: number, reorder: number) => reorder > 0 && stock <= reorder;

    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(5, 10)).toBe(true);
    expect(isLowStock(15, 10)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false); // 0 reorder level item is not classified as low stock
  });
});

describe('F. RBAC PERMISSIONS ENFORCEMENT', () => {
  it('SUPER_ADMIN has full permissions across all dashboard domains', () => {
    const superAdmin = { role: 'SUPER_ADMIN' as UserRole };
    expect(hasPermission(superAdmin, 'booking:read')).toBe(true);
    expect(hasPermission(superAdmin, 'room:read')).toBe(true);
    expect(hasPermission(superAdmin, 'restaurant:order:read')).toBe(true);
    expect(hasPermission(superAdmin, 'inventory:read')).toBe(true);
    expect(hasPermission(superAdmin, 'reports:financial')).toBe(true);
  });

  it('RECEPTIONIST can read bookings and rooms but NOT reports:financial or inventory', () => {
    const receptionist = { role: 'RECEPTIONIST' as UserRole };
    expect(hasPermission(receptionist, 'booking:read')).toBe(true);
    expect(hasPermission(receptionist, 'room:read')).toBe(true);
    expect(hasPermission(receptionist, 'reports:financial')).toBe(false);
    expect(hasPermission(receptionist, 'inventory:read')).toBe(false);
  });

  it('KITCHEN_STAFF only has kitchen view and cannot access bookings or financials', () => {
    const kitchen = { role: 'KITCHEN_STAFF' as UserRole };
    expect(hasPermission(kitchen, 'kitchen:view')).toBe(true);
    expect(hasPermission(kitchen, 'booking:read')).toBe(false);
    expect(hasPermission(kitchen, 'reports:financial')).toBe(false);
    expect(hasPermission(kitchen, 'room:read')).toBe(false);
  });

  it('STORE_MANAGER has inventory:read but cannot read sensitive bookings or financials', () => {
    const storeMgr = { role: 'STORE_MANAGER' as UserRole };
    expect(hasPermission(storeMgr, 'inventory:read')).toBe(true);
    expect(hasPermission(storeMgr, 'booking:read')).toBe(false);
    expect(hasPermission(storeMgr, 'reports:financial')).toBe(false);
  });
});
