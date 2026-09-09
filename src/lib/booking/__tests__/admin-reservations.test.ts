import { describe, it, expect } from 'vitest';
import { Prisma, PaymentStatus, RefundStatus, ReservationStatus, BookingSource } from '@prisma/client';
import { deriveReservationPaymentState, serializeAdminReservations, PaginatedAdminReservations } from '../admin-reservation-service';
import { hasPermission } from '@/lib/permissions/rbac';

describe('deriveReservationPaymentState', () => {
  it('derives UNPAID when no payments exist', () => {
    const total = new Prisma.Decimal(6160);
    const result = deriveReservationPaymentState(total, []);

    expect(result.derivedStatus).toBe('UNPAID');
    expect(result.totalPaid.toNumber()).toBe(0);
    expect(result.totalRefunded.toNumber()).toBe(0);
    expect(result.balanceDue.toNumber()).toBe(6160);
  });

  it('derives PAID when successful payment equals total amount', () => {
    const total = new Prisma.Decimal(6160);
    const payments = [
      {
        amount: new Prisma.Decimal(6160),
        status: PaymentStatus.SUCCESS,
        refunds: [],
      },
    ];

    const result = deriveReservationPaymentState(total, payments);
    expect(result.derivedStatus).toBe('PAID');
    expect(result.totalPaid.toNumber()).toBe(6160);
    expect(result.netPaid.toNumber()).toBe(6160);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  it('derives PARTIALLY_PAID when payment is less than total amount', () => {
    const total = new Prisma.Decimal(6160);
    const payments = [
      {
        amount: new Prisma.Decimal(2000),
        status: PaymentStatus.SUCCESS,
        refunds: [],
      },
    ];

    const result = deriveReservationPaymentState(total, payments);
    expect(result.derivedStatus).toBe('PARTIALLY_PAID');
    expect(result.totalPaid.toNumber()).toBe(2000);
    expect(result.balanceDue.toNumber()).toBe(4160);
  });

  it('derives REFUND_PENDING when a payment has a pending refund', () => {
    const total = new Prisma.Decimal(6160);
    const payments = [
      {
        amount: new Prisma.Decimal(6160),
        status: PaymentStatus.SUCCESS,
        refunds: [
          {
            amount: new Prisma.Decimal(6160),
            status: RefundStatus.PENDING,
          },
        ],
      },
    ];

    const result = deriveReservationPaymentState(total, payments);
    expect(result.derivedStatus).toBe('REFUND_PENDING');
    expect(result.totalPendingRefund.toNumber()).toBe(6160);
  });

  it('derives REFUNDED when a payment is fully processed for refund', () => {
    const total = new Prisma.Decimal(6160);
    const payments = [
      {
        amount: new Prisma.Decimal(6160),
        status: PaymentStatus.SUCCESS,
        refunds: [
          {
            amount: new Prisma.Decimal(6160),
            status: RefundStatus.PROCESSED,
          },
        ],
      },
    ];

    const result = deriveReservationPaymentState(total, payments);
    expect(result.derivedStatus).toBe('REFUNDED');
    expect(result.totalRefunded.toNumber()).toBe(6160);
    expect(result.netPaid.toNumber()).toBe(0);
    expect(result.balanceDue.toNumber()).toBe(6160);
  });

  it('ignores FAILED and VOIDED payments in financial totals', () => {
    const total = new Prisma.Decimal(5000);
    const payments = [
      {
        amount: new Prisma.Decimal(5000),
        status: PaymentStatus.FAILED,
      },
      {
        amount: new Prisma.Decimal(5000),
        status: PaymentStatus.VOIDED,
      },
    ];

    const result = deriveReservationPaymentState(total, payments);
    expect(result.derivedStatus).toBe('UNPAID');
    expect(result.totalPaid.toNumber()).toBe(0);
    expect(result.balanceDue.toNumber()).toBe(5000);
  });
});

describe('RBAC Permission Checks for Admin Reservations', () => {
  const superAdmin = { role: 'SUPER_ADMIN' };
  const admin = { role: 'ADMIN' };
  const receptionist = { role: 'RECEPTIONIST' };
  const storeManager = { role: 'STORE_MANAGER' };

  it('allows SUPER_ADMIN and ADMIN and RECEPTIONIST to read and create bookings', () => {
    expect(hasPermission(superAdmin, 'booking:read')).toBe(true);
    expect(hasPermission(admin, 'booking:read')).toBe(true);
    expect(hasPermission(receptionist, 'booking:read')).toBe(true);

    expect(hasPermission(superAdmin, 'booking:create')).toBe(true);
    expect(hasPermission(admin, 'booking:create')).toBe(true);
    expect(hasPermission(receptionist, 'booking:create')).toBe(true);
  });

  it('allows SUPER_ADMIN and ADMIN and RECEPTIONIST to cancel bookings', () => {
    expect(hasPermission(superAdmin, 'booking:cancel')).toBe(true);
    expect(hasPermission(admin, 'booking:cancel')).toBe(true);
    expect(hasPermission(receptionist, 'booking:cancel')).toBe(true);
  });

  it('restricts sensitive guest documents to authorized roles only', () => {
    expect(hasPermission(superAdmin, 'guest:view_sensitive')).toBe(true);
    expect(hasPermission(admin, 'guest:view_sensitive')).toBe(true);
    // Receptionist does NOT have guest:view_sensitive by default in rbac.ts
    expect(hasPermission(receptionist, 'guest:view_sensitive')).toBe(false);
  });

  it('restricts financial reports to authorized roles only', () => {
    expect(hasPermission(superAdmin, 'reports:financial')).toBe(true);
    expect(hasPermission(admin, 'reports:financial')).toBe(true);
    expect(hasPermission(receptionist, 'reports:financial')).toBe(false);
  });

  it('denies booking operations to non-frontdesk roles', () => {
    expect(hasPermission(storeManager, 'booking:read')).toBe(false);
    expect(hasPermission(storeManager, 'booking:create')).toBe(false);
    expect(hasPermission(storeManager, 'booking:cancel')).toBe(false);
  });
});

describe('serializeAdminReservations', () => {
  it('converts Prisma.Decimal and Date objects into plain serializable values for Client Components', () => {
    const rawData: PaginatedAdminReservations = {
      pagination: {
        page: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1,
      },
      reservations: [
        {
          id: 'res-1',
          reservationNumber: 'RES-20260908-BAC713',
          checkInDate: new Date('2026-09-08T00:00:00.000Z'),
          checkOutDate: new Date('2026-09-09T00:00:00.000Z'),
          createdAt: new Date('2026-09-08T11:26:35.385Z'),
          adults: 2,
          children: 0,
          totalRooms: 1,
          totalAmount: new Prisma.Decimal('6160.00'),
          advancePaidAmount: new Prisma.Decimal('6160.00'),
          status: ReservationStatus.CONFIRMED,
          source: BookingSource.DIRECT_WEBSITE,
          primaryGuest: {
            id: 'guest-1',
            firstName: 'Mahesh',
            lastName: 'Chouhan',
            phone: '1234564000',
            email: 'mahesh@mailinator.com',
            vip: false,
            blacklisted: false,
          },
          rooms: [
            {
              id: 'room-1',
              roomsCount: 1,
              ratePerNight: new Prisma.Decimal('5500.00'),
              lineTotal: new Prisma.Decimal('6160.00'),
              roomType: {
                id: 'rt-1',
                name: 'Standard Heritage Room',
                code: 'HERITAGE-STD',
              },
            },
          ],
          stayInfo: null,
          financials: {
            totalPaid: new Prisma.Decimal('6160.00'),
            totalRefunded: new Prisma.Decimal('0.00'),
            totalPendingRefund: new Prisma.Decimal('0.00'),
            netPaid: new Prisma.Decimal('6160.00'),
            balanceDue: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('6160.00'),
            derivedStatus: 'PAID',
          },
        },
      ],
    };

    const serialized = serializeAdminReservations(rawData);

    // Verify all Decimals and Dates are plain strings/primitives
    const res = serialized.reservations[0];
    expect(typeof res.totalAmount).toBe('string');
    expect(res.totalAmount).toBe('6160');
    expect(typeof res.advancePaidAmount).toBe('string');
    expect(typeof res.checkInDate).toBe('string');
    expect(typeof res.checkOutDate).toBe('string');
    expect(typeof res.createdAt).toBe('string');

    expect(typeof res.rooms[0].ratePerNight).toBe('string');
    expect(typeof res.rooms[0].lineTotal).toBe('string');

    expect(typeof res.financials.totalPaid).toBe('string');
    expect(typeof res.financials.balanceDue).toBe('string');
    expect(res.financials.derivedStatus).toBe('PAID');
    expect(res.financials.hasAdvancePayment).toBe(true);
    expect(res.financials.hasBalanceDue).toBe(false);

    // Verify plain JSON stringification (no class instances)
    const jsonString = JSON.stringify(serialized);
    const parsed = JSON.parse(jsonString);
    expect(parsed.reservations[0].reservationNumber).toBe('RES-20260908-BAC713');
  });
});
