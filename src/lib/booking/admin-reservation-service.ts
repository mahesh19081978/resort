import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  ReservationStatus,
  BookingSource,
  PaymentMethod,
  PaymentStatus,
  PaymentContext,
  RefundStatus,
  StayStatus,
} from '@prisma/client';
import { getAvailableRoomTypes } from '@/lib/availability/service';
import { calculateNights, calculateReservationPricing, roundCurrency, calculateBookingPrice } from './pricing-calculator';
import { generateBookingNumber, generateRefundIdempotencyKey } from './numbers';
import { recordAuditEvent } from '@/lib/auth/audit';
import { getBusinessDateNow, getExpectedArrivalsCount } from '@/lib/frontdesk/arrivals';
import { getExpectedDeparturesCount } from '@/lib/frontdesk/departures';
import { AuthenticatedUser } from '@/lib/auth/auth';
import { requirePermission as assertPermission, hasPermission } from '@/lib/permissions/rbac';

export type DerivedPaymentStatus =
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'UNPAID'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export interface ReservationPaymentCalculation {
  totalAmount: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  totalRefunded: Prisma.Decimal;
  totalPendingRefund: Prisma.Decimal;
  netPaid: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  derivedStatus: DerivedPaymentStatus;
}

/**
 * Derives presentation-level payment status and financial balances from
 * Reservation totalAmount + Payment records + Refund records.
 * Uses Decimal for pure banker's rounding without JS floating point arithmetic.
 */
export function deriveReservationPaymentState(
  totalAmountDecimal: Prisma.Decimal,
  payments: Array<{
    amount: Prisma.Decimal;
    status: PaymentStatus;
    refunds?: Array<{ amount: Prisma.Decimal; status: RefundStatus }>;
  }>
): ReservationPaymentCalculation {
  let totalPaid = new Prisma.Decimal(0);
  let totalRefunded = new Prisma.Decimal(0);
  let totalPendingRefund = new Prisma.Decimal(0);

  for (const payment of payments) {
    if (payment.status === PaymentStatus.SUCCESS) {
      totalPaid = totalPaid.add(payment.amount);

      if (payment.refunds) {
        for (const refund of payment.refunds) {
          if (refund.status === RefundStatus.PROCESSED) {
            totalRefunded = totalRefunded.add(refund.amount);
          } else if (refund.status === RefundStatus.PENDING) {
            totalPendingRefund = totalPendingRefund.add(refund.amount);
          }
        }
      }
    }
  }

  const netPaid = roundCurrency(totalPaid.sub(totalRefunded));
  const totalAmount = roundCurrency(totalAmountDecimal);
  const rawBalance = totalAmount.sub(netPaid);
  const balanceDue = roundCurrency(Prisma.Decimal.max(0, rawBalance));

  let derivedStatus: DerivedPaymentStatus = 'UNPAID';

  if (totalPaid.gt(0) && (totalRefunded.gte(totalPaid) || netPaid.lte(0))) {
    derivedStatus = 'REFUNDED';
  } else if (totalPendingRefund.gt(0)) {
    derivedStatus = 'REFUND_PENDING';
  } else if (netPaid.gte(totalAmount)) {
    derivedStatus = 'PAID';
  } else if (netPaid.gt(0) && netPaid.lt(totalAmount)) {
    derivedStatus = 'PARTIALLY_PAID';
  } else {
    derivedStatus = 'UNPAID';
  }

  return {
    totalAmount,
    totalPaid: roundCurrency(totalPaid),
    totalRefunded: roundCurrency(totalRefunded),
    totalPendingRefund: roundCurrency(totalPendingRefund),
    netPaid,
    balanceDue,
    derivedStatus,
  };
}

export interface AdminReservationFilters {
  search?: string;
  status?: ReservationStatus | 'ALL';
  paymentStatus?: DerivedPaymentStatus | 'ALL';
  roomTypeId?: string;
  source?: BookingSource | 'ALL';
  dateType?: 'checkIn' | 'checkOut' | 'createdAt';
  startDate?: string;
  endDate?: string;
  quickTab?: 'all' | 'today' | 'upcoming' | 'pending' | 'confirmed' | 'cancelled';
  sort?: 'checkInDate' | 'checkOutDate' | 'createdAt' | 'totalAmount';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedAdminReservations {
  reservations: Array<{
    id: string;
    reservationNumber: string;
    checkInDate: Date;
    checkOutDate: Date;
    adults: number;
    children: number;
    totalRooms: number;
    totalAmount: Prisma.Decimal;
    advancePaidAmount: Prisma.Decimal;
    status: ReservationStatus;
    source: BookingSource;
    createdAt: Date;
    primaryGuest: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      vip: boolean;
      blacklisted: boolean;
    };
    rooms: Array<{
      id: string;
      roomsCount: number;
      ratePerNight: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      roomType: {
        id: string;
        name: string;
        code: string;
      };
    }>;
    stayInfo: {
      hasActiveStay: boolean;
      stayNumber?: string;
      stayStatus?: StayStatus;
      assignedRooms: string[];
    } | null;
    financials: ReservationPaymentCalculation;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface SerializedAdminReservations {
  reservations: Array<{
    id: string;
    reservationNumber: string;
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    children: number;
    totalRooms: number;
    totalAmount: string;
    advancePaidAmount: string;
    status: ReservationStatus;
    source: BookingSource;
    createdAt: string;
    primaryGuest: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      vip: boolean;
      blacklisted: boolean;
    };
    rooms: Array<{
      id: string;
      roomsCount: number;
      ratePerNight: string;
      lineTotal: string;
      roomType: {
        id: string;
        name: string;
        code: string;
      };
    }>;
    stayInfo: {
      hasActiveStay: boolean;
      stayNumber?: string;
      stayStatus?: StayStatus;
      assignedRooms: string[];
    } | null;
    financials: {
      totalPaid: string;
      totalRefunded: string;
      netPaid: string;
      balanceDue: string;
      totalAmount: string;
      derivedStatus: DerivedPaymentStatus;
      hasAdvancePayment: boolean;
      hasBalanceDue: boolean;
    };
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * Converts PaginatedAdminReservations containing Prisma.Decimal and Date instances
 * into a plain JSON-serializable structure safe for React Client Components.
 */
export function serializeAdminReservations(
  data: PaginatedAdminReservations
): SerializedAdminReservations {
  return {
    pagination: data.pagination,
    reservations: data.reservations.map((res) => ({
      ...res,
      checkInDate: res.checkInDate instanceof Date ? res.checkInDate.toISOString() : String(res.checkInDate),
      checkOutDate: res.checkOutDate instanceof Date ? res.checkOutDate.toISOString() : String(res.checkOutDate),
      createdAt: res.createdAt instanceof Date ? res.createdAt.toISOString() : String(res.createdAt),
      totalAmount: res.totalAmount.toString(),
      advancePaidAmount: res.advancePaidAmount.toString(),
      rooms: res.rooms.map((rm) => ({
        ...rm,
        ratePerNight: rm.ratePerNight.toString(),
        lineTotal: rm.lineTotal.toString(),
      })),
      financials: {
        totalPaid: res.financials.totalPaid.toString(),
        totalRefunded: res.financials.totalRefunded.toString(),
        netPaid: res.financials.netPaid.toString(),
        balanceDue: res.financials.balanceDue.toString(),
        totalAmount: res.financials.totalAmount.toString(),
        derivedStatus: res.financials.derivedStatus,
        hasAdvancePayment: res.financials.totalPaid.gt(0),
        hasBalanceDue: res.financials.balanceDue.gt(0),
      },
    })),
  };
}

/**
 * Server-side parameterized reservation search & filter query.
 * Gated by 'booking:read' permission.
 */
export async function getAdminReservations(
  filters: AdminReservationFilters,
  user: AuthenticatedUser
): Promise<PaginatedAdminReservations> {
  assertPermission(user, 'booking:read');

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(10, filters.limit || 25));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ReservationWhereInput = {};
  const businessDate = getBusinessDateNow();
  const todayUtcStart = new Date(`${businessDate}T00:00:00.000Z`);
  const tomorrowUtcStart = new Date(todayUtcStart);
  tomorrowUtcStart.setUTCDate(tomorrowUtcStart.getUTCDate() + 1);

  // 1. Quick Tabs
  if (filters.quickTab === 'today') {
    where.checkInDate = { gte: todayUtcStart, lt: tomorrowUtcStart };
  } else if (filters.quickTab === 'upcoming') {
    where.checkInDate = { gte: todayUtcStart };
    where.status = { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] };
  } else if (filters.quickTab === 'pending') {
    where.status = ReservationStatus.PENDING;
  } else if (filters.quickTab === 'confirmed') {
    where.status = ReservationStatus.CONFIRMED;
  } else if (filters.quickTab === 'cancelled') {
    where.status = ReservationStatus.CANCELLED;
  }

  // 2. Explicit Status Filter (overrides quickTab if set and not ALL)
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }

  // 3. Source Filter
  if (filters.source && filters.source !== 'ALL') {
    where.source = filters.source;
  }

  // 4. RoomType Filter
  if (filters.roomTypeId && filters.roomTypeId !== 'ALL') {
    where.reservedRooms = {
      some: {
        roomTypeId: filters.roomTypeId,
      },
    };
  }

  // 5. Date Range Filter
  if (filters.startDate || filters.endDate) {
    const dateField: 'checkInDate' | 'checkOutDate' | 'createdAt' =
      filters.dateType === 'checkOut'
        ? 'checkOutDate'
        : filters.dateType === 'createdAt'
        ? 'createdAt'
        : 'checkInDate';
    const range: Prisma.DateTimeFilter = {};
    if (filters.startDate) {
      range.gte = new Date(`${filters.startDate}T00:00:00.000Z`);
    }
    if (filters.endDate) {
      const endD = new Date(`${filters.endDate}T00:00:00.000Z`);
      endD.setUTCDate(endD.getUTCDate() + 1); // inclusive end date
      range.lt = endD;
    }
    where[dateField] = range;
  }

  // 6. Search Query (reservation number, guest name, phone, email)
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim();
    where.OR = [
      { reservationNumber: { contains: q, mode: 'insensitive' } },
      { primaryGuest: { firstName: { contains: q, mode: 'insensitive' } } },
      { primaryGuest: { lastName: { contains: q, mode: 'insensitive' } } },
      { primaryGuest: { phone: { contains: q, mode: 'insensitive' } } },
      { primaryGuest: { email: { contains: q, mode: 'insensitive' } } },
    ];
  }

  // 7. Sort Whitelist
  const sortField = filters.sort || 'checkInDate';
  const sortDirection = filters.order || (sortField === 'createdAt' ? 'desc' : 'asc');
  const orderBy: Prisma.ReservationOrderByWithRelationInput = {
    [sortField]: sortDirection,
  };

  // If filtering by derived paymentStatus, we must query candidates and filter
  const isPaymentStatusFilter = filters.paymentStatus && filters.paymentStatus !== 'ALL';

  if (!isPaymentStatusFilter) {
    const [totalCount, rows] = await Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.findMany({
        where,
        include: {
          primaryGuest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              vip: true,
              blacklisted: true,
            },
          },
          reservedRooms: {
            include: {
              roomType: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          payments: {
            select: {
              amount: true,
              status: true,
              refunds: { select: { amount: true, status: true } },
            },
          },
          stays: {
            select: {
              stayNumber: true,
              status: true,
              roomAssignments: {
                where: { status: 'ACTIVE' },
                select: { room: { select: { roomNumber: true } } },
              },
            },
          },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
    ]);

    const formatted = rows.map((r) => {
      const activeStay = r.stays.find((s) => s.status === StayStatus.ACTIVE) || r.stays[0];
      const assignedRooms = activeStay
        ? activeStay.roomAssignments.map((ra) => ra.room.roomNumber)
        : [];
      const financials = deriveReservationPaymentState(r.totalAmount, r.payments);

      return {
        id: r.id,
        reservationNumber: r.reservationNumber,
        checkInDate: r.checkInDate,
        checkOutDate: r.checkOutDate,
        adults: r.adults,
        children: r.children,
        totalRooms: r.totalRooms,
        totalAmount: r.totalAmount,
        advancePaidAmount: r.advancePaidAmount,
        status: r.status,
        source: r.source,
        createdAt: r.createdAt,
        primaryGuest: r.primaryGuest,
        rooms: r.reservedRooms.map((rr) => ({
          id: rr.id,
          roomsCount: rr.roomsCount,
          ratePerNight: rr.ratePerNight,
          lineTotal: rr.lineTotal,
          roomType: rr.roomType,
        })),
        stayInfo: activeStay
          ? {
              hasActiveStay: activeStay.status === StayStatus.ACTIVE,
              stayNumber: activeStay.stayNumber,
              stayStatus: activeStay.status,
              assignedRooms,
            }
          : null,
        financials,
      };
    });

    return {
      reservations: formatted,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    };
  }

  // If filtering by derived payment status:
  const candidates = await prisma.reservation.findMany({
    where,
    include: {
      primaryGuest: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          vip: true,
          blacklisted: true,
        },
      },
      reservedRooms: {
        include: {
          roomType: {
            select: { id: true, name: true, code: true },
          },
        },
      },
      payments: {
        select: {
          amount: true,
          status: true,
          refunds: { select: { amount: true, status: true } },
        },
      },
      stays: {
        select: {
          stayNumber: true,
          status: true,
          roomAssignments: {
            where: { status: 'ACTIVE' },
            select: { room: { select: { roomNumber: true } } },
          },
        },
      },
    },
    orderBy,
    take: 500, // safe ceiling for payment-filtered queries
  });

  const filtered = candidates
    .map((r) => {
      const activeStay = r.stays.find((s) => s.status === StayStatus.ACTIVE) || r.stays[0];
      const assignedRooms = activeStay
        ? activeStay.roomAssignments.map((ra) => ra.room.roomNumber)
        : [];
      const financials = deriveReservationPaymentState(r.totalAmount, r.payments);

      return {
        id: r.id,
        reservationNumber: r.reservationNumber,
        checkInDate: r.checkInDate,
        checkOutDate: r.checkOutDate,
        adults: r.adults,
        children: r.children,
        totalRooms: r.totalRooms,
        totalAmount: r.totalAmount,
        advancePaidAmount: r.advancePaidAmount,
        status: r.status,
        source: r.source,
        createdAt: r.createdAt,
        primaryGuest: r.primaryGuest,
        rooms: r.reservedRooms.map((rr) => ({
          id: rr.id,
          roomsCount: rr.roomsCount,
          ratePerNight: rr.ratePerNight,
          lineTotal: rr.lineTotal,
          roomType: rr.roomType,
        })),
        stayInfo: activeStay
          ? {
              hasActiveStay: activeStay.status === StayStatus.ACTIVE,
              stayNumber: activeStay.stayNumber,
              stayStatus: activeStay.status,
              assignedRooms,
            }
          : null,
        financials,
      };
    })
    .filter((r) => r.financials.derivedStatus === filters.paymentStatus);

  const totalCount = filtered.length;
  const paginated = filtered.slice(skip, skip + pageSize);

  return {
    reservations: paginated,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  };
}

export interface AdminReservationKpis {
  totalReservations: number;
  confirmedCount: number;
  pendingCount: number;
  todayArrivalsCount: number;
  todayDeparturesCount: number;
  financialSummary: {
    canViewFinancials: boolean;
    bookedValue: string; // Active/Confirmed reservations total amount
    advancesReceived: string; // Successful advance payments sum
    outstandingBalance: string; // Booked value minus net advances
  };
}

/**
 * Authoritative summary KPIs for top cards.
 * Reuses front desk shared services for Arrivals and Departures.
 * Decimal-only financial aggregation.
 */
export async function getAdminReservationKpis(
  user: AuthenticatedUser
): Promise<AdminReservationKpis> {
  assertPermission(user, 'booking:read');
  const canViewFinancials =
    hasPermission(user, 'reports:financial') ||
    user.role === 'SUPER_ADMIN' ||
    user.role === 'ADMIN';

  const businessDate = getBusinessDateNow();

  const [
    totalReservations,
    confirmedCount,
    pendingCount,
    todayArrivalsCount,
    todayDeparturesCount,
    activeReservationsWithPayments,
  ] = await Promise.all([
    prisma.reservation.count(),
    prisma.reservation.count({ where: { status: ReservationStatus.CONFIRMED } }),
    prisma.reservation.count({ where: { status: ReservationStatus.PENDING } }),
    getExpectedArrivalsCount(businessDate),
    getExpectedDeparturesCount(businessDate),
    canViewFinancials
      ? prisma.reservation.findMany({
          where: {
            status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED] },
          },
          select: {
            totalAmount: true,
            payments: {
              where: {
                context: PaymentContext.RESERVATION_ADVANCE,
                status: PaymentStatus.SUCCESS,
              },
              select: {
                amount: true,
                refunds: {
                  where: { status: RefundStatus.PROCESSED },
                  select: { amount: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  let bookedValue = new Prisma.Decimal(0);
  let advancesReceived = new Prisma.Decimal(0);
  let outstandingBalance = new Prisma.Decimal(0);

  if (canViewFinancials) {
    for (const res of activeReservationsWithPayments) {
      const resTotal = roundCurrency(res.totalAmount);
      bookedValue = bookedValue.add(resTotal);

      let resNetPaid = new Prisma.Decimal(0);
      for (const p of res.payments) {
        advancesReceived = advancesReceived.add(p.amount);
        let pRefunded = new Prisma.Decimal(0);
        for (const rf of p.refunds) {
          pRefunded = pRefunded.add(rf.amount);
        }
        resNetPaid = resNetPaid.add(p.amount.sub(pRefunded));
      }

      const resBalance = Prisma.Decimal.max(0, resTotal.sub(resNetPaid));
      outstandingBalance = outstandingBalance.add(roundCurrency(resBalance));
    }
  }

  return {
    totalReservations,
    confirmedCount,
    pendingCount,
    todayArrivalsCount,
    todayDeparturesCount,
    financialSummary: {
      canViewFinancials,
      bookedValue: bookedValue.toFixed(2),
      advancesReceived: advancesReceived.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
    },
  };
}

export interface AdminReservationDetailResult {
  id: string;
  reservationNumber: string;
  bookingRequestId: string | null;
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  children: number;
  totalRooms: number;
  status: ReservationStatus;
  source: BookingSource;
  specialRequests: string | null;
  cancellationReason: string | null;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  advancePaidAmount: Prisma.Decimal;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  primaryGuest: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    vip: boolean;
    blacklisted: boolean;
    notes: string | null;
    documents: Array<{
      id: string;
      documentType: string;
      documentNumber: string;
      fileName: string;
      verificationStatus: string;
      verifiedAt: Date | null;
      createdAt: Date;
    }>;
  };
  accompanyingGuests: Array<{
    id: string;
    guest: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
    };
  }>;
  reservedRooms: Array<{
    id: string;
    roomTypeId: string;
    roomsCount: number;
    ratePerNight: Prisma.Decimal;
    totalNights: number;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    roomType: {
      id: string;
      name: string;
      code: string;
      slug: string;
      description: string;
      basePrice: Prisma.Decimal;
      maxOccupancy: number;
      maxAdults: number;
      maxChildren: number;
    };
    ratePlan: {
      id: string;
      name: string;
      code: string;
    } | null;
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    context: PaymentContext;
    amount: Prisma.Decimal;
    currency: string;
    method: PaymentMethod;
    status: PaymentStatus;
    transactionReference: string | null;
    paymentDate: Date;
    notes: string | null;
    refunds: Array<{
      id: string;
      refundNumber: string;
      amount: Prisma.Decimal;
      reason: string;
      status: RefundStatus;
      createdAt: Date;
      processedAt: Date | null;
    }>;
  }>;
  stays: Array<{
    id: string;
    stayNumber: string;
    status: StayStatus;
    actualCheckIn: Date;
    actualCheckOut: Date | null;
    expectedCheckOut: Date;
    roomAssignments: Array<{
      id: string;
      status: string;
      room: {
        id: string;
        roomNumber: string;
        status: string;
        roomType: { name: string };
      };
    }>;
  }>;
  financials: ReservationPaymentCalculation;
  audits: Array<{
    id: string;
    action: string;
    createdAt: Date;
    user: { name: string; role: string } | null;
    oldValues: unknown;
    newValues: unknown;
  }>;
}

/**
 * Retrieves full reservation detail for /admin/bookings/[reservationId].
 * Enforces server-side RBAC:
 * - 'booking:read' required.
 * - Sensitive documents omitted unless 'guest:view_sensitive' is granted.
 * - Audit logs omitted unless 'audit:read' is granted.
 */
export async function getAdminReservationDetail(
  reservationId: string,
  user: AuthenticatedUser
): Promise<AdminReservationDetailResult | null> {
  assertPermission(user, 'booking:read');
  const canViewSensitive = hasPermission(user, 'guest:view_sensitive');
  const canViewAudit = hasPermission(user, 'audit:read');

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      primaryGuest: {
        include: {
          documents: canViewSensitive
            ? {
                select: {
                  id: true,
                  documentType: true,
                  documentNumber: true,
                  fileName: true,
                  verificationStatus: true,
                  verifiedAt: true,
                  createdAt: true,
                },
              }
            : false,
        },
      },
      accompanyingGuests: {
        include: {
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
        },
      },
      reservedRooms: {
        include: {
          roomType: true,
          ratePlan: {
            select: { id: true, name: true, code: true },
          },
        },
      },
      payments: {
        include: {
          refunds: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { paymentDate: 'desc' },
      },
      stays: {
        include: {
          roomAssignments: {
            where: { status: 'ACTIVE' },
            include: {
              room: {
                select: {
                  id: true,
                  roomNumber: true,
                  status: true,
                  roomType: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reservation) {
    return null;
  }

  const audits = canViewAudit
    ? await prisma.auditLog.findMany({
        where: {
          entity: 'Reservation',
          entityId: reservation.id,
        },
        include: {
          user: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const financials = deriveReservationPaymentState(reservation.totalAmount, reservation.payments);

  return {
    ...reservation,
    primaryGuest: {
      ...reservation.primaryGuest,
      documents: (
        'documents' in reservation.primaryGuest && Array.isArray((reservation.primaryGuest as { documents?: unknown[] }).documents)
          ? ((reservation.primaryGuest as unknown as { documents: AdminReservationDetailResult['primaryGuest']['documents'] }).documents)
          : []
      ),
    },
    financials,
    audits: audits.map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.createdAt,
      user: a.user,
      oldValues: a.oldValues,
      newValues: a.newValues,
    })),
  };
}

export interface CancelReservationResult {
  reservationId: string;
  reservationNumber: string;
  status: ReservationStatus;
  cancellationReason: string;
  refund?: {
    refundNumber: string;
    amount: string;
    status: RefundStatus;
  };
}

/**
 * Authoritative transactional cancellation service.
 * Enforces:
 * - 'booking:cancel' permission
 * - State machine: only PENDING or CONFIRMED allowed
 * - Inactive stay check: rejects if reservation has an ACTIVE Stay
 * - Idempotency: repeated cancellation with same reason returns current state
 * - Automatic queueing of pending Refund if successful payment exists
 * - Audit logging
 */
export async function cancelAdminReservation(
  reservationId: string,
  reason: string,
  actorUser: AuthenticatedUser
): Promise<CancelReservationResult> {
  assertPermission(actorUser, 'booking:cancel');

  const cleanReason = reason.trim();
  if (cleanReason.length < 3) {
    throw new Error('Cancellation reason must be at least 3 characters.');
  }

  return await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: {
        stays: { select: { id: true, status: true, stayNumber: true } },
        payments: {
          where: { status: PaymentStatus.SUCCESS },
          include: { refunds: true },
        },
      },
    });

    if (!reservation) {
      throw new Error(`RESERVATION_NOT_FOUND: Reservation ${reservationId} does not exist.`);
    }

    // Check if already cancelled
    if (reservation.status === ReservationStatus.CANCELLED) {
      return {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        status: reservation.status,
        cancellationReason: reservation.cancellationReason || cleanReason,
      };
    }

    // State machine check: only PENDING or CONFIRMED can be cancelled
    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.CONFIRMED
    ) {
      throw new Error(
        `INVALID_STATE_TRANSITION: Cannot cancel reservation with status ${reservation.status}. Only PENDING or CONFIRMED reservations can be cancelled.`
      );
    }

    // Active Stay check
    const activeStay = reservation.stays.find((s) => s.status === StayStatus.ACTIVE);
    if (activeStay) {
      throw new Error(
        `CANNOT_CANCEL_ACTIVE_STAY: Reservation has an active in-house stay (${activeStay.stayNumber}). Complete checkout or void the stay at Front Desk before cancelling.`
      );
    }

    // Determine refund requirements for successful advance payments
    let generatedRefund: { refundNumber: string; amount: string; status: RefundStatus } | undefined;

    for (const payment of reservation.payments) {
      let refundedTotal = new Prisma.Decimal(0);
      for (const rf of payment.refunds) {
        if (rf.status === RefundStatus.PROCESSED || rf.status === RefundStatus.PENDING) {
          refundedTotal = refundedTotal.add(rf.amount);
        }
      }

      const refundable = payment.amount.sub(refundedTotal);
      if (refundable.gt(0)) {
        const refundNumber = generateBookingNumber('REF');
        const refundIdempotencyKey = generateRefundIdempotencyKey(
          'CANCELLED_RES',
          payment.provider || 'ADMIN',
          payment.id
        );

        const existingRefund = await tx.refund.findUnique({
          where: { idempotencyKey: refundIdempotencyKey },
        });

        let refundRecord;
        if (!existingRefund) {
          refundRecord = await tx.refund.create({
            data: {
              refundNumber,
              paymentId: payment.id,
              amount: refundable,
              reason: `Reservation cancelled by admin: ${cleanReason}`,
              reasonCode: 'ADMIN_CANCELLATION',
              status: RefundStatus.PENDING,
              idempotencyKey: refundIdempotencyKey,
            },
          });
        } else {
          refundRecord = existingRefund;
        }

        generatedRefund = {
          refundNumber: refundRecord.refundNumber,
          amount: refundRecord.amount.toFixed(2),
          status: refundRecord.status,
        };
      }
    }

    // Update reservation state
    const updated = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.CANCELLED,
        cancellationReason: cleanReason,
        expiresAt: null,
      },
    });

    const userExists = actorUser?.id
      ? await tx.user.findUnique({ where: { id: actorUser.id }, select: { id: true } })
      : null;

    // Write audit log
    await recordAuditEvent(
      {
        userId: userExists?.id || null,
        action: 'RESERVATION_CANCELLED_BY_ADMIN',
        entity: 'Reservation',
        entityId: reservation.id,
        oldValues: {
          status: reservation.status,
          expiresAt: reservation.expiresAt ? reservation.expiresAt.toISOString() : null,
        },
        newValues: {
          status: updated.status,
          cancellationReason: cleanReason,
          refund: generatedRefund,
        },
      },
      tx
    );

    return {
      reservationId: updated.id,
      reservationNumber: updated.reservationNumber,
      status: updated.status,
      cancellationReason: cleanReason,
      refund: generatedRefund,
    };
  });
}

export interface CreateAdminReservationInput {
  bookingRequestId: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  adults: number;
  children: number;
  rooms: Array<{ roomTypeId: string; roomsCount: number }>;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  source?: BookingSource;
  specialRequests?: string;
  advancePayment?: {
    received: boolean;
    amount?: number;
    method?: PaymentMethod;
    transactionReference?: string;
    notes?: string;
  };
}

export interface AdminReservationCreationResult {
  reservationId: string;
  reservationNumber: string;
  status: ReservationStatus;
  totalAmount: string;
  advancePaidAmount: string;
  paymentNumber?: string;
}

/**
 * Concurrency-safe Admin reservation creation workflow.
 * Guarantees:
 * 1. Checks bookingRequestId idempotency outside and inside transaction.
 * 2. Locks requested RoomTypes in ASCENDING order by ID (prevent deadlocks).
 * 3. Re-runs authoritative availability with the transaction client.
 * 4. Verifies inventory capacity.
 * 5. Uses authoritative 9-step pricing with DB Tax rate.
 * 6. Deduplicates/upserts guest.
 * 7. Records Payment record if advance payment received (no arbitrary advancePaidAmount manipulation).
 * 8. Never assigns physical room (remains Front Desk check-in).
 * 9. Records audit event.
 * 10. Rolls back on any inventory failure or uniqueness collision.
 */
export async function createAdminReservation(
  input: CreateAdminReservationInput,
  actorUser: AuthenticatedUser
): Promise<AdminReservationCreationResult> {
  assertPermission(actorUser, 'booking:create');

  // Outer Idempotency Check (Fast-path outside transaction)
  const existing = await prisma.reservation.findUnique({
    where: { bookingRequestId: input.bookingRequestId },
    include: {
      payments: {
        where: { status: PaymentStatus.SUCCESS },
        select: { paymentNumber: true },
      },
    },
  });

  if (existing) {
    return {
      reservationId: existing.id,
      reservationNumber: existing.reservationNumber,
      status: existing.status,
      totalAmount: existing.totalAmount.toFixed(2),
      advancePaidAmount: existing.advancePaidAmount.toFixed(2),
      paymentNumber: existing.payments[0]?.paymentNumber,
    };
  }

  // Transaction with P2002 boundary
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => executeAdminReservationCreation(tx, input, actorUser),
        {
          maxWait: 15000,
          timeout: 35000,
        }
      );
    } catch (err: unknown) {
      const isBookingRequestIdConflict =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.message.includes('bookingRequestId') ||
          (Array.isArray(err.meta?.target) &&
            (err.meta?.target as string[]).includes('bookingRequestId')));

      if (isBookingRequestIdConflict) {
        const existingConflict = await prisma.reservation.findUnique({
          where: { bookingRequestId: input.bookingRequestId },
          include: {
            payments: {
              where: { status: PaymentStatus.SUCCESS },
              select: { paymentNumber: true },
            },
          },
        });
        if (existingConflict) {
          return {
            reservationId: existingConflict.id,
            reservationNumber: existingConflict.reservationNumber,
            status: existingConflict.status,
            totalAmount: existingConflict.totalAmount.toFixed(2),
            advancePaidAmount: existingConflict.advancePaidAmount.toFixed(2),
            paymentNumber: existingConflict.payments[0]?.paymentNumber,
          };
        }
      }

      const isLockContention =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2028' || err.code === 'P2034');

      if (isLockContention && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 150 * attempt + Math.random() * 100));
        continue;
      }

      throw err;
    }
  }

  throw new Error('CONCURRENCY_ERROR: Maximum transaction attempts exceeded.');
}

async function executeAdminReservationCreation(
  tx: Prisma.TransactionClient,
  input: CreateAdminReservationInput,
  actorUser: AuthenticatedUser
): Promise<AdminReservationCreationResult> {
  // 1. Idempotency recheck under transaction
  const existingInside = await tx.reservation.findUnique({
    where: { bookingRequestId: input.bookingRequestId },
    include: {
      payments: {
        where: { status: PaymentStatus.SUCCESS },
        select: { paymentNumber: true },
      },
    },
  });

  if (existingInside) {
    return {
      reservationId: existingInside.id,
      reservationNumber: existingInside.reservationNumber,
      status: existingInside.status,
      totalAmount: existingInside.totalAmount.toFixed(2),
      advancePaidAmount: existingInside.advancePaidAmount.toFixed(2),
      paymentNumber: existingInside.payments[0]?.paymentNumber,
    };
  }

  // 2. Deterministic Row-Locking on RoomTypes (ORDER BY id ASC to avoid deadlocks)
  const requestedRoomTypeIds = Array.from(new Set(input.rooms.map((r) => r.roomTypeId))).sort();

  await tx.$queryRaw`
    SELECT id FROM "RoomType"
    WHERE id = ANY(${requestedRoomTypeIds}::text[])
    ORDER BY id ASC
    FOR UPDATE
  `;

  // 3. Fetch active RoomTypes under lock
  const roomTypes = await tx.roomType.findMany({
    where: { id: { in: requestedRoomTypeIds }, isActive: true },
  });

  if (roomTypes.length !== requestedRoomTypeIds.length) {
    throw new Error('ONE_OR_MORE_ROOM_TYPES_INVALID_OR_INACTIVE');
  }

  // 4. Occupancy Verification
  let totalRequestedRooms = 0;
  for (const item of input.rooms) {
    totalRequestedRooms += item.roomsCount;
  }
  const totalGuests = input.adults + (input.children || 0);

  for (const item of input.rooms) {
    const rt = roomTypes.find((r) => r.id === item.roomTypeId)!;
    if (rt.maxOccupancy < Math.ceil(totalGuests / totalRequestedRooms)) {
      throw new Error(
        `OCCUPANCY_EXCEEDED: Room type [${rt.name}] maximum occupancy is ${rt.maxOccupancy} persons.`
      );
    }
  }

  // 5. Authoritative Availability Recheck under active lock
  const availabilityResult = await getAvailableRoomTypes(
    {
      checkIn: input.checkInDate,
      checkOut: input.checkOutDate,
      guests: totalGuests,
      adults: input.adults,
      children: input.children || 0,
    },
    tx
  );

  for (const item of input.rooms) {
    const available = availabilityResult.availableRoomTypes.find(
      (a) => a.roomTypeId === item.roomTypeId
    );
    if (!available || available.availableRoomCount < item.roomsCount) {
      const rt = roomTypes.find((r) => r.id === item.roomTypeId)!;
      throw new Error(
        `INSUFFICIENT_INVENTORY: Requested ${item.roomsCount} room(s) of type [${rt.name}], but only ${available?.availableRoomCount ?? 0} available.`
      );
    }
  }

  // 6. Guest Deduplication (case-insensitive email / phone)
  const normalizedEmail = input.guest.email.trim().toLowerCase();
  const normalizedPhone = input.guest.phone.replace(/[^0-9+]/g, '');

  let guest = await tx.guest.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });

  if (guest) {
    guest = await tx.guest.update({
      where: { id: guest.id },
      data: {
        firstName: input.guest.firstName,
        lastName: input.guest.lastName,
        phone: normalizedPhone,
        address: input.guest.address || guest.address,
        city: input.guest.city || guest.city,
        state: input.guest.state || guest.state,
        postalCode: input.guest.postalCode || guest.postalCode,
        country: input.guest.country || guest.country,
      },
    });
  } else {
    const existingByPhone = await tx.guest.findMany({
      where: { phone: normalizedPhone },
    });

    if (existingByPhone.length === 1) {
      guest = await tx.guest.update({
        where: { id: existingByPhone[0].id },
        data: {
          email: normalizedEmail,
          firstName: input.guest.firstName,
          lastName: input.guest.lastName,
        },
      });
    } else {
      guest = await tx.guest.create({
        data: {
          firstName: input.guest.firstName,
          lastName: input.guest.lastName,
          email: normalizedEmail,
          phone: normalizedPhone,
          address: input.guest.address || null,
          city: input.guest.city || null,
          state: input.guest.state || null,
          postalCode: input.guest.postalCode || null,
          country: input.guest.country || 'India',
        },
      });
    }
  }

  // 7. Authoritative 9-Step Pricing Pipeline
  // Delegates to canonical calculateBookingPrice() which queries active Tax from DB and enforces pure Decimal Banker's Rounding
  const pricing = await calculateBookingPrice(
    {
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      rooms: input.rooms,
      depositRatio: 1.0,
    },
    tx
  );

  // 8. Determine Advance Payment & Payment Record
  const isAdvanceReceived = !!input.advancePayment?.received;
  const paymentAmount = isAdvanceReceived
    ? roundCurrency(new Prisma.Decimal(input.advancePayment?.amount || pricing.totalAmount))
    : new Prisma.Decimal(0);

  if (isAdvanceReceived && paymentAmount.gt(pricing.totalAmount)) {
    throw new Error(
      `INVALID_PAYMENT_AMOUNT: Advance payment (₹${paymentAmount}) cannot exceed total reservation amount (₹${pricing.totalAmount}).`
    );
  }

  const reservationNumber = generateBookingNumber('RES');
  const source = input.source || BookingSource.FRONT_DESK_WALKIN;
  const initialStatus = ReservationStatus.CONFIRMED;

  // 9. Atomic Insertion of Reservation & ReservationRooms
  const reservation = await tx.reservation.create({
    data: {
      reservationNumber,
      bookingRequestId: input.bookingRequestId,
      primaryGuestId: guest.id,
      checkInDate: new Date(`${input.checkInDate}T00:00:00.000Z`),
      checkOutDate: new Date(`${input.checkOutDate}T00:00:00.000Z`),
      adults: input.adults,
      children: input.children || 0,
      totalRooms: totalRequestedRooms,
      source,
      status: initialStatus,
      specialRequests: input.specialRequests || null,
      subtotal: pricing.subtotal,
      discountAmount: pricing.discountAmount,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      advancePaidAmount: paymentAmount, // matches actual Payment record created below
      expiresAt: null,
      reservedRooms: {
        create: pricing.lines.map((l) => ({
          roomTypeId: l.roomTypeId,
          roomsCount: l.roomsCount,
          ratePerNight: l.ratePerNight,
          totalNights: l.totalNights,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        })),
      },
    },
  });

  // 10. Authoritative Payment Creation (No manual advancePaidAmount without Payment record!)
  const userExists = actorUser?.id
    ? await tx.user.findUnique({ where: { id: actorUser.id }, select: { id: true } })
    : null;

  let createdPaymentNumber: string | undefined;
  if (isAdvanceReceived && paymentAmount.gt(0)) {
    const paymentNumber = generateBookingNumber('RES').replace('RES', 'PAY');
    createdPaymentNumber = paymentNumber;

    await tx.payment.create({
      data: {
        paymentNumber,
        context: PaymentContext.RESERVATION_ADVANCE,
        amount: paymentAmount,
        currency: 'INR',
        method: input.advancePayment?.method || PaymentMethod.CASH,
        status: PaymentStatus.SUCCESS,
        transactionReference: input.advancePayment?.transactionReference || null,
        reservationId: reservation.id,
        receivedById: userExists?.id || null,
        notes: input.advancePayment?.notes || 'Advance payment collected during admin booking',
        idempotencyKey: `ADMIN_PAY_${input.bookingRequestId}`,
      },
    });
  }

  // 11. Audit Logging
  await recordAuditEvent(
    {
      userId: userExists?.id || null,
      action: 'ADMIN_RESERVATION_CREATED',
      entity: 'Reservation',
      entityId: reservation.id,
      newValues: {
        reservationNumber: reservation.reservationNumber,
        bookingRequestId: reservation.bookingRequestId,
        totalAmount: Number(reservation.totalAmount),
        advancePaidAmount: Number(paymentAmount),
        paymentNumber: createdPaymentNumber,
        source: reservation.source,
        status: reservation.status,
      },
    },
    tx
  );

  return {
    reservationId: reservation.id,
    reservationNumber: reservation.reservationNumber,
    status: reservation.status,
    totalAmount: reservation.totalAmount.toFixed(2),
    advancePaidAmount: reservation.advancePaidAmount.toFixed(2),
    paymentNumber: createdPaymentNumber,
  };
}
