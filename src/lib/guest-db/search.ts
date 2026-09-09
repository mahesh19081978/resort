import { prisma } from '@/lib/db/prisma';
import { Prisma, StayStatus, ReservationStatus, RoomAssignmentStatus, PaymentStatus } from '@prisma/client';

export interface GuestDatabaseRow {
  guestId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  city: string | null;
  country: string | null;
  vip: boolean;
  blacklisted: boolean;
  createdAt: string;
  totalStays: number;
  totalReservations: number;
  totalBilled: string;
  totalPaid: string;
  outstandingBalance: string;
  latestStay: {
    stayId: string;
    stayNumber: string;
    roomNumber: string;
    roomTypeName: string;
    actualCheckIn: string;
    expectedCheckOut: string;
    actualCheckOut: string | null;
    status: string;
    folioBalance: string;
  } | null;
  currentStay: {
    stayId: string;
    stayNumber: string;
    roomNumber: string;
    roomTypeName: string;
    actualCheckIn: string;
    expectedCheckOut: string;
    folioBalance: string;
    outstandingBalance: string;
  } | null;
  upcomingReservation: {
    reservationId: string;
    reservationNumber: string;
    checkInDate: string;
    checkOutDate: string;
    roomTypeName: string;
    status: string;
    totalAmount: string;
    advancePaid: string;
  } | null;
  currentStatus: 'CURRENTLY_STAYING' | 'UPCOMING_BOOKING' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'NEVER_STAYED';
  hasPhoto: boolean;
  hasDocuments: boolean;
}

export interface GuestDatabaseFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  dateSemantic?: string;
  roomNumber?: string;
  roomType?: string;
  building?: string;
  floor?: string;
  reservationStatus?: string;
  bookingSource?: string;
  paymentStatus?: string;
  city?: string;
  hasPhoto?: boolean;
  hasDocuments?: boolean;
}

export interface GuestDatabasePagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GuestDatabaseSummary {
  totalGuests: number;
  currentlyStaying: number;
  upcomingBookings: number;
  completedStays: number;
  totalBilled: string;
  totalPaid: string;
}

function resolveCurrentStatus(stays: Array<{ status: string; actualCheckIn: Date; actualCheckOut: Date | null; expectedCheckOut: Date }>, reservations: Array<{ status: string; checkInDate: Date }>): GuestDatabaseRow['currentStatus'] {
  const hasActiveStay = stays.some((s) => s.status === StayStatus.ACTIVE);
  if (hasActiveStay) return 'CURRENTLY_STAYING';

  const hasUpcoming = reservations.some(
    (r) => r.status === ReservationStatus.CONFIRMED || r.status === ReservationStatus.PENDING
  );
  if (hasUpcoming) return 'UPCOMING_BOOKING';

  const hasCompleted = stays.some(
    (s) => s.status === StayStatus.CHECKED_OUT || s.status === StayStatus.EARLY_CHECKOUT
  );
  if (hasCompleted) return 'COMPLETED';

  const hasCancelled = reservations.some((r) => r.status === ReservationStatus.CANCELLED);
  if (hasCancelled) return 'CANCELLED';

  const hasNoShow = reservations.some((r) => r.status === ReservationStatus.NO_SHOW);
  if (hasNoShow) return 'NO_SHOW';

  return 'NEVER_STAYED';
}

function buildGuestWhere(filters: GuestDatabaseFilters, searchQuery?: string): Prisma.GuestWhereInput {
  const where: Prisma.GuestWhereInput = {};

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim();
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' as const } },
      { lastName: { contains: q, mode: 'insensitive' as const } },
      { phone: { contains: q, mode: 'insensitive' as const } },
      { email: { contains: q, mode: 'insensitive' as const } },
      { city: { contains: q, mode: 'insensitive' as const } },
      { stays: { some: { stayNumber: { contains: q, mode: 'insensitive' as const } } } },
      { reservations: { some: { reservationNumber: { contains: q, mode: 'insensitive' as const } } } },
      { stays: { some: { roomAssignments: { some: { room: { roomNumber: { contains: q, mode: 'insensitive' as const } } } } } } },
    ];
  }

  // Status filter
  if (filters.status && filters.status !== 'all') {
    switch (filters.status) {
      case 'currently_staying':
        where.stays = { some: { status: StayStatus.ACTIVE } };
        break;
      case 'upcoming':
        where.reservations = {
          some: {
            status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING] },
            checkInDate: { gte: new Date() },
          },
        };
        break;
      case 'completed':
        where.stays = {
          some: { status: { in: [StayStatus.CHECKED_OUT, StayStatus.EARLY_CHECKOUT] } },
        };
        break;
      case 'cancelled':
        where.reservations = { some: { status: ReservationStatus.CANCELLED } };
        break;
      case 'no_show':
        where.reservations = { some: { status: ReservationStatus.NO_SHOW } };
        break;
    }
  }

  // City filter
  if (filters.city && filters.city.trim()) {
    where.city = { contains: filters.city.trim(), mode: 'insensitive' as const };
  }

  // Room number filter
  if (filters.roomNumber && filters.roomNumber.trim()) {
    where.stays = {
      ...where.stays as Prisma.StayListRelationFilter,
      some: {
        ...(where.stays as Prisma.StayListRelationFilter)?.some as Prisma.StayWhereInput || {},
        roomAssignments: {
          some: { room: { roomNumber: { contains: filters.roomNumber.trim(), mode: 'insensitive' as const } } },
        },
      },
    };
  }

  // Room type filter
  if (filters.roomType && filters.roomType.trim()) {
    where.stays = {
      ...where.stays as Prisma.StayListRelationFilter,
      some: {
        ...(where.stays as Prisma.StayListRelationFilter)?.some as Prisma.StayWhereInput || {},
        roomAssignments: {
          some: { room: { roomType: { name: { contains: filters.roomType.trim(), mode: 'insensitive' as const } } } },
        },
      },
    };
  }

  // Booking source filter
  if (filters.bookingSource && filters.bookingSource !== 'all') {
    where.reservations = {
      ...where.reservations as Prisma.ReservationListRelationFilter,
      some: {
        ...(where.reservations as Prisma.ReservationListRelationFilter)?.some as Prisma.ReservationWhereInput || {},
        source: filters.bookingSource as any,
      },
    };
  }

  // Reservation status filter
  if (filters.reservationStatus && filters.reservationStatus !== 'all') {
    where.reservations = {
      ...where.reservations as Prisma.ReservationListRelationFilter,
      some: {
        ...(where.reservations as Prisma.ReservationListRelationFilter)?.some as Prisma.ReservationWhereInput || {},
        status: filters.reservationStatus as any,
      },
    };
  }

  // Has photo filter
  if (filters.hasPhoto) {
    where.photos = { some: {} };
  }

  // Has documents filter
  if (filters.hasDocuments) {
    where.documents = { some: {} };
  }

  // Date filters - applied to stays
  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setUTCDate(to.getUTCDate() + 1);
      dateFilter.lt = to;
    }

    if (filters.dateSemantic === 'checkin') {
      where.stays = { ...where.stays as any, some: { actualCheckIn: dateFilter } };
    } else if (filters.dateSemantic === 'checkout') {
      where.stays = { ...where.stays as any, some: { actualCheckOut: dateFilter } };
    } else if (filters.dateSemantic === 'booking') {
      where.reservations = { ...where.reservations as any, some: { createdAt: dateFilter } };
    } else {
      // 'stay' or 'activity' - guest was staying during this period
      const dateStart = filters.dateFrom ? new Date(filters.dateFrom) : new Date('2000-01-01');
      const dateEnd = filters.dateTo ? (() => { const d = new Date(filters.dateTo); d.setUTCDate(d.getUTCDate() + 1); return d; })() : new Date('2099-12-31');
      where.stays = {
        ...where.stays as any,
        some: {
          AND: [
            { actualCheckIn: { lt: dateEnd } },
            { OR: [{ actualCheckOut: { gt: dateStart } }, { actualCheckOut: null }] },
          ],
        },
      };
    }
  }

  return where;
}

export async function getGuestDatabasePage(
  page: number = 1,
  pageSize: number = 25,
  filters: GuestDatabaseFilters = {},
  searchQuery?: string
): Promise<{ guests: GuestDatabaseRow[]; pagination: GuestDatabasePagination; summary: GuestDatabaseSummary }> {
  const where = buildGuestWhere(filters, searchQuery);
  const skip = (page - 1) * pageSize;

  const [guestRecords, total] = await Promise.all([
    prisma.guest.findMany({
      where,
      include: {
        stays: {
          orderBy: { actualCheckIn: 'desc' },
          include: {
            roomAssignments: {
              include: {
                room: { include: { roomType: { select: { name: true } } } },
              },
            },
            folio: {
              include: {
                items: { where: { isVoided: false }, select: { amount: true } },
                payments: { where: { status: PaymentStatus.SUCCESS }, select: { amount: true } },
              },
            },
          },
        },
        reservations: {
          orderBy: { checkInDate: 'desc' },
          select: {
            id: true,
            reservationNumber: true,
            checkInDate: true,
            checkOutDate: true,
            status: true,
            totalAmount: true,
            advancePaidAmount: true,
            reservedRooms: { select: { roomType: { select: { name: true } } } },
          },
        },
        photos: { select: { id: true }, take: 1 },
        documents: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.guest.count({ where }),
  ]);

  const guests: GuestDatabaseRow[] = guestRecords.map((guest) => {
    const sortedStays = guest.stays;
    const activeStay = sortedStays.find((s) => s.status === StayStatus.ACTIVE);
    const completedStays = sortedStays.filter(
      (s) => s.status === StayStatus.CHECKED_OUT || s.status === StayStatus.EARLY_CHECKOUT
    );
    const latestStay = sortedStays[0] ?? null;

    const upcomingRes = guest.reservations.find(
      (r) => (r.status === ReservationStatus.CONFIRMED || r.status === ReservationStatus.PENDING)
        && new Date(r.checkInDate) >= new Date()
    );

    const currentStatus = resolveCurrentStatus(
      sortedStays.map((s) => ({ status: s.status, actualCheckIn: s.actualCheckIn, actualCheckOut: s.actualCheckOut, expectedCheckOut: s.expectedCheckOut })),
      guest.reservations.map((r) => ({ status: r.status, checkInDate: r.checkInDate }))
    );

    let totalBilled = new Prisma.Decimal(0);
    let totalPaid = new Prisma.Decimal(0);
    for (const stay of sortedStays) {
      if (stay.folio) {
        for (const item of stay.folio.items) {
          totalBilled = totalBilled.plus(item.amount);
        }
        for (const payment of stay.folio.payments) {
          totalPaid = totalPaid.plus(payment.amount);
        }
      }
    }
    const outstandingBalance = totalBilled.minus(totalPaid);

    const currentStayRoom = activeStay?.roomAssignments[0]?.room;
    const latestStayRoom = latestStay?.roomAssignments[0]?.room;

    return {
      guestId: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      phone: guest.phone,
      email: guest.email,
      city: guest.city,
      country: guest.country,
      vip: guest.vip,
      blacklisted: guest.blacklisted,
      createdAt: guest.createdAt.toISOString(),
      totalStays: sortedStays.length,
      totalReservations: guest.reservations.length,
      totalBilled: totalBilled.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
      latestStay: latestStay
        ? {
            stayId: latestStay.id,
            stayNumber: latestStay.stayNumber,
            roomNumber: latestStayRoom?.roomNumber ?? 'Unassigned',
            roomTypeName: latestStayRoom?.roomType?.name ?? '',
            actualCheckIn: latestStay.actualCheckIn.toISOString(),
            expectedCheckOut: latestStay.expectedCheckOut.toISOString(),
            actualCheckOut: latestStay.actualCheckOut?.toISOString() ?? null,
            status: latestStay.status,
            folioBalance: (latestStay.folio?.totalBalance ?? new Prisma.Decimal(0)).toFixed(2),
          }
        : null,
      currentStay: activeStay
        ? {
            stayId: activeStay.id,
            stayNumber: activeStay.stayNumber,
            roomNumber: currentStayRoom?.roomNumber ?? 'Unassigned',
            roomTypeName: currentStayRoom?.roomType?.name ?? '',
            actualCheckIn: activeStay.actualCheckIn.toISOString(),
            expectedCheckOut: activeStay.expectedCheckOut.toISOString(),
            folioBalance: (activeStay.folio?.totalBalance ?? new Prisma.Decimal(0)).toFixed(2),
            outstandingBalance: (activeStay.folio?.totalBalance ?? new Prisma.Decimal(0)).toFixed(2),
          }
        : null,
      upcomingReservation: upcomingRes
        ? {
            reservationId: upcomingRes.id,
            reservationNumber: upcomingRes.reservationNumber,
            checkInDate: upcomingRes.checkInDate.toISOString(),
            checkOutDate: upcomingRes.checkOutDate.toISOString(),
            roomTypeName: upcomingRes.reservedRooms[0]?.roomType?.name ?? '',
            status: upcomingRes.status,
            totalAmount: upcomingRes.totalAmount.toFixed(2),
            advancePaid: upcomingRes.advancePaidAmount.toFixed(2),
          }
        : null,
      currentStatus,
      hasPhoto: guest.photos.length > 0,
      hasDocuments: guest.documents.length > 0,
    };
  });

  // Summary counts
  const [totalGuests, currentlyStaying, upcomingBookings, completedStays] = await Promise.all([
    prisma.guest.count(),
    prisma.guest.count({ where: { stays: { some: { status: StayStatus.ACTIVE } } } }),
    prisma.guest.count({
      where: {
        reservations: {
          some: {
            status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING] },
            checkInDate: { gte: new Date() },
          },
        },
      },
    }),
    prisma.guest.count({
      where: { stays: { some: { status: { in: [StayStatus.CHECKED_OUT, StayStatus.EARLY_CHECKOUT] } } } },
    }),
  ]);

  // Financial aggregates
  const financialAgg = await prisma.folio.aggregate({
    _sum: { totalCharges: true, totalCredits: true },
  });

  const totalBilledAll = (financialAgg._sum.totalCharges ?? new Prisma.Decimal(0)).toFixed(2);
  const totalPaidAll = (financialAgg._sum.totalCredits ?? new Prisma.Decimal(0)).toFixed(2);

  return {
    guests,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    summary: {
      totalGuests,
      currentlyStaying,
      upcomingBookings,
      completedStays,
      totalBilled: totalBilledAll,
      totalPaid: totalPaidAll,
    },
  };
}
