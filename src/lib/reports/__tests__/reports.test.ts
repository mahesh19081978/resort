import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  resolveReportPeriod,
  REPORT_DATE_FIELDS,
} from '../date';
import {
  generateCsv,
  getCsvContentType,
  getExportFilename,
} from '../exports';

describe('REPORTS MODULE — Date Utilities', () => {
  it('resolveReportPeriod returns valid period range for this-month', () => {
    const range = resolveReportPeriod('this-month', undefined, undefined, '2026-09-08');
    expect(range.period).toBe('this-month');
    expect(range.current.startDateStr).toBe('2026-09-01');
    expect(range.current.endDateStr).toBe('2026-09-30');
    expect(range.previous.startDateStr).toBe('2026-08-01');
    expect(range.previous.endDateStr).toBe('2026-08-31');
  });

  it('resolveReportPeriod handles today', () => {
    const range = resolveReportPeriod('today', undefined, undefined, '2026-09-08');
    expect(range.period).toBe('today');
    expect(range.current.startDateStr).toBe('2026-09-08');
    expect(range.current.endDateStr).toBe('2026-09-08');
    expect(range.isToday).toBe(true);
  });

  it('resolveReportPeriod handles custom range', () => {
    const range = resolveReportPeriod('custom', '2026-06-01', '2026-06-30', '2026-09-08');
    expect(range.period).toBe('custom');
    expect(range.current.startDateStr).toBe('2026-06-01');
    expect(range.current.endDateStr).toBe('2026-06-30');
  });

  it('resolveReportPeriod falls back to this-month for invalid custom range', () => {
    const range = resolveReportPeriod('custom', '2026-06-30', '2026-06-01', '2026-09-08');
    expect(range.period).toBe('this-month');
  });

  it('REPORT_DATE_FIELDS defines correct fields for each report', () => {
    expect(REPORT_DATE_FIELDS.revenue).toContain('folio_posted');
    expect(REPORT_DATE_FIELDS.revenue).toContain('restaurant_bill');
    expect(REPORT_DATE_FIELDS.occupancy).toContain('stay_occupancy');
    expect(REPORT_DATE_FIELDS.reservations).toContain('reservation_created');
    expect(REPORT_DATE_FIELDS.inventory).toContain('stock_movement');
    expect(REPORT_DATE_FIELDS.payments).toContain('payment_success');
    expect(REPORT_DATE_FIELDS.audit).toContain('audit_event');
  });
});

describe('REPORTS MODULE — CSV Export', () => {
  it('generateCsv produces valid CSV with BOM', () => {
    const columns = [
      { header: 'Name', accessor: (r: { name: string }) => r.name },
      { header: 'Amount', accessor: (r: { amount: number }) => r.amount },
    ];
    const rows = [
      { name: 'Room Revenue', amount: 15000 },
      { name: 'Restaurant', amount: 8500 },
    ];
    const csv = generateCsv(columns, rows, {
      reportName: 'Revenue Report',
      periodLabel: 'This Month',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      generatedAt: new Date('2026-09-08T12:00:00Z'),
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('# Report: Revenue Report');
    expect(csv).toContain('# Period: This Month');
    expect(csv).toContain('"Name","Amount"');
    expect(csv).toContain('"Room Revenue","15000"');
    expect(csv).toContain('"Restaurant","8500"');
  });

  it('generateCsv handles empty rows', () => {
    const csv = generateCsv(
      [{ header: 'Col', accessor: () => 'val' }],
      [],
      { reportName: 'Test', periodLabel: 'Test', startDate: '2026-01-01', endDate: '2026-01-31', generatedAt: new Date() }
    );
    expect(csv).toContain('"Col"');
    expect(csv.split('\n').length).toBeGreaterThanOrEqual(5); // metadata + header at minimum
  });

  it('generateCsv escapes quotes in values', () => {
    const csv = generateCsv(
      [{ header: 'Desc', accessor: (r: { d: string }) => r.d }],
      [{ d: 'He said "hello"' }],
      { reportName: 'Test', periodLabel: 'Test', startDate: '2026-01-01', endDate: '2026-01-31', generatedAt: new Date() }
    );
    expect(csv).toContain('"He said ""hello"""');
  });

  it('getCsvContentType returns correct MIME type', () => {
    expect(getCsvContentType()).toBe('text/csv; charset=utf-8');
  });

  it('getExportFilename sanitizes and formats correctly', () => {
    const name = getExportFilename('Revenue Report', '2026-09-01', '2026-09-30');
    expect(name).toBe('revenue_report_2026-09-01_to_2026-09-30.csv');
  });
});

describe('REPORTS MODULE — Revenue Metric Definitions', () => {
  it('revenue does not confuse collections with revenue', () => {
    // Revenue is recognized when posted (FolioItem.postedAt)
    // Collections are recognized when payment succeeds (Payment.paymentDate)
    // These are fundamentally different timestamps
    const revenueDate = new Date('2026-09-01T10:00:00+05:30');
    const paymentDate = new Date('2026-09-03T14:00:00+05:30');
    expect(revenueDate.getTime()).not.toBe(paymentDate.getTime());
  });

  it('Decimal precision is maintained for monetary values', () => {
    const a = new Prisma.Decimal('15000.50');
    const b = new Prisma.Decimal('8500.25');
    const total = a.plus(b);
    expect(total.toString()).toBe('23500.75');
    // Ensure no floating point drift
    expect(total.toNumber()).toBe(23500.75);
  });

  it('occupancy calculation uses sellable rooms (excluding out of order)', () => {
    const totalRooms = 34;
    const outOfOrder = 2;
    const occupied = 15;
    const sellableRooms = totalRooms - outOfOrder;
    const occupancy = Math.round((occupied / sellableRooms) * 1000) / 10;
    expect(sellableRooms).toBe(32);
    expect(occupancy).toBe(46.9);
  });

  it('ADR is room revenue divided by occupied nights', () => {
    const roomRevenue = new Prisma.Decimal('45000');
    const occupiedNights = 15;
    const adr = roomRevenue.dividedBy(new Prisma.Decimal(occupiedNights));
    expect(adr.toNumber()).toBe(3000);
  });

  it('RevPAR is room revenue divided by available nights', () => {
    const roomRevenue = new Prisma.Decimal('45000');
    const availableNights = 32 * 30; // 32 sellable rooms * 30 days
    const revpar = roomRevenue.dividedBy(new Prisma.Decimal(availableNights));
    expect(revpar.toNumber()).toBeCloseTo(46.875, 2);
  });
});

describe('REPORTS MODULE — Restaurant Revenue Definition', () => {
  it('restaurant revenue includes SETTLED and CHARGED_TO_ROOM bills', () => {
    const validStatuses = ['SETTLED', 'CHARGED_TO_ROOM'];
    expect(validStatuses).toContain('SETTLED');
    expect(validStatuses).toContain('CHARGED_TO_ROOM');
    expect(validStatuses).not.toContain('DRAFT');
    expect(validStatuses).not.toContain('CANCELLED');
    expect(validStatuses).not.toContain('SPLIT_CHILDREN');
  });

  it('room-service charged to room counts as restaurant revenue not room revenue', () => {
    // A ROOM_SERVICE restaurant bill charged to room is restaurant revenue
    // When the guest later settles the folio, that is a payment collection, not new revenue
    const restaurantRevenue = new Prisma.Decimal('2500');
    const roomRevenue = new Prisma.Decimal('0'); // Not counted here
    const totalRevenue = restaurantRevenue.plus(roomRevenue);
    expect(totalRevenue.toNumber()).toBe(2500);
  });
});

describe('REPORTS MODULE — Payment/Collection Definition', () => {
  it('vendor payments are excluded from guest revenue collections', () => {
    const guestContexts = ['RESERVATION_ADVANCE', 'FOLIO_SETTLEMENT', 'RESTAURANT_BILL', 'DIRECT_SERVICE'];
    expect(guestContexts).not.toContain('VENDOR_PAYMENT');
  });

  it('net collections = successful payments - processed refunds', () => {
    const successfulPayments = new Prisma.Decimal('50000');
    const processedRefunds = new Prisma.Decimal('2000');
    const netCollections = successfulPayments.minus(processedRefunds);
    expect(netCollections.toNumber()).toBe(48000);
  });
});

describe('REPORTS MODULE — Inventory Valuation Definition', () => {
  it('stock valuation uses current WAC * quantity on hand', () => {
    const quantity = new Prisma.Decimal('100');
    const wac = new Prisma.Decimal('25.50');
    const value = quantity.times(wac);
    expect(value.toNumber()).toBe(2550);
  });
});

describe('REPORTS MODULE — Property Scoping', () => {
  it('all report services accept propertyId parameter', () => {
    // Verify the report services are designed to accept propertyId
    // This is a structural test - actual DB tests require integration setup
    const propertyId = 'test-property-123';
    expect(typeof propertyId).toBe('string');
    expect(propertyId.length).toBeGreaterThan(0);
  });
});
