import { prisma } from '@/lib/db/prisma';
import { Prisma, StayStatus, PaymentStatus } from '@prisma/client';
import { getBusinessDateUtcRange } from '@/lib/dashboard/date';

export interface StayInvestigationResult {
  guestId: string;
  guestName: string;
  phone: string;
  email: string | null;
  stayId: string;
  stayNumber: string;
  reservationNumber: string | null;
  roomNumber: string;
  roomTypeName: string;
  actualCheckIn: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  status: string;
  folioBalance: string;
  totalPaid: string;
  matchedActivity: string;
}

export interface InvestigationSummary {
  checkIns: number;
  checkOuts: number;
  staying: number;
  totalRecords: number;
  totalRevenue: string;
  totalOutstanding: string;
  averageStayDuration: number;
}

export interface InvestigationDateSearchResult {
  results: StayInvestigationResult[];
  summary: InvestigationSummary;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  dateRange: {
    from: string;
    to: string;
  };
}

function buildInvestigationWhere(
  dateFromStr: string,
  dateToStr?: string,
  filters?: { roomNumber?: string; floor?: string; building?: string; status?: string }
): Prisma.StayWhereInput {
  const { start: fromStart, end: fromEnd } = getBusinessDateUtcRange(dateFromStr);

  let dateWhere: Prisma.StayWhereInput;

  if (dateToStr) {
    const { end: toEnd } = getBusinessDateUtcRange(dateToStr);
    dateWhere = {
      AND: [
        { actualCheckIn: { lt: toEnd } },
        { OR: [{ actualCheckOut: { gt: fromStart } }, { actualCheckOut: null }] },
      ],
    };
  } else {
    dateWhere = {
      AND: [
        { actualCheckIn: { lt: fromEnd } },
        { OR: [{ actualCheckOut: { gt: fromStart } }, { actualCheckOut: null }] },
      ],
    };
  }

  const filtersWhere: Prisma.StayWhereInput = {};

  if (filters?.roomNumber && filters.roomNumber.trim()) {
    filtersWhere.roomAssignments = {
      some: {
        room: { roomNumber: { contains: filters.roomNumber.trim(), mode: 'insensitive' } },
      },
    };
  }

  if (filters?.status && filters.status !== 'all') {
    switch (filters.status) {
      case 'active':
        filtersWhere.status = StayStatus.ACTIVE;
        break;
      case 'checked_out':
        filtersWhere.status = { in: [StayStatus.CHECKED_OUT, StayStatus.EARLY_CHECKOUT] };
        break;
      case 'cancelled':
        filtersWhere.status = StayStatus.CANCELLED;
        break;
    }
  }

  return { AND: [dateWhere, filtersWhere] };
}

function resolveMatchedActivity(
  stay: { actualCheckIn: Date; actualCheckOut: Date | null; status: string },
  dateFromStr: string,
  dateToStr?: string
): string {
  const { start: fromStart, end: fromEnd } = getBusinessDateUtcRange(dateFromStr);

  if (!dateToStr) {
    const checkInDay = stay.actualCheckIn >= fromStart && stay.actualCheckIn < fromEnd;
    const checkOutDay = stay.actualCheckOut
      ? stay.actualCheckOut >= fromStart && stay.actualCheckOut < fromEnd
      : false;

    if (checkInDay && stay.status !== StayStatus.CHECKED_OUT) return 'Checked In';
    if (checkOutDay) return 'Checked Out';
    if (stay.actualCheckIn < fromStart && (!stay.actualCheckOut || stay.actualCheckOut > fromStart)) {
      return 'Staying';
    }
  } else {
    const { end: toEnd } = getBusinessDateUtcRange(dateToStr);
    const checkedInDuringRange = stay.actualCheckIn >= fromStart && stay.actualCheckIn < toEnd;
    const checkedOutDuringRange = stay.actualCheckOut
      ? stay.actualCheckOut >= fromStart && stay.actualCheckOut < toEnd
      : false;

    if (checkedInDuringRange && checkedOutDuringRange) return 'Arrived & Departed';
    if (checkedInDuringRange) return 'Checked In';
    if (checkedOutDuringRange) return 'Checked Out';
    if (stay.actualCheckIn < fromStart && (!stay.actualCheckOut || stay.actualCheckOut > fromStart)) {
      return 'In-House';
    }
  }

  return stay.status;
}

export async function getStayInvestigationPage(
  dateFromStr: string,
  dateToStr?: string,
  filters?: { roomNumber?: string; floor?: string; building?: string; status?: string },
  page: number = 1,
  pageSize: number = 50
): Promise<InvestigationDateSearchResult> {
  const where = buildInvestigationWhere(dateFromStr, dateToStr, filters);
  const skip = (page - 1) * pageSize;

  const [stays, total] = await Promise.all([
    prisma.stay.findMany({
      where,
      include: {
        primaryGuest: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        reservation: { select: { reservationNumber: true } },
        roomAssignments: {
          include: { room: { include: { roomType: { select: { name: true } } } } },
        },
        folio: {
          include: {
            items: { where: { isVoided: false }, select: { amount: true } },
            payments: { where: { status: PaymentStatus.SUCCESS }, select: { amount: true } },
          },
        },
      },
      orderBy: { actualCheckIn: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.stay.count({ where }),
  ]);

  const { start: fromStart, end: fromEnd } = getBusinessDateUtcRange(dateFromStr);
  let toEnd = fromEnd;
  if (dateToStr) {
    toEnd = getBusinessDateUtcRange(dateToStr).end;
  }

  const dateRangeWhere: Prisma.StayWhereInput = {
    AND: [
      { actualCheckIn: { lt: toEnd } },
      { OR: [{ actualCheckOut: { gt: fromStart } }, { actualCheckOut: null }] },
    ],
  };

  const [checkIns, checkOuts, stayingCount, financialAgg] = await Promise.all([
    prisma.stay.count({
      where: {
        actualCheckIn: dateToStr
          ? { gte: fromStart, lt: toEnd }
          : { gte: fromStart, lt: fromEnd },
      },
    }),
    prisma.stay.count({
      where: {
        actualCheckOut: dateToStr
          ? { gte: fromStart, lt: toEnd }
          : { gte: fromStart, lt: fromEnd },
      },
    }),
    prisma.stay.count({ where: dateRangeWhere }),
    prisma.folio.aggregate({
      where: { stay: dateRangeWhere },
      _sum: { totalCharges: true, totalCredits: true },
    }),
  ]);

  const totalRevenue = (financialAgg._sum.totalCharges ?? new Prisma.Decimal(0)).toFixed(2);
  const totalOutstanding = (
    (financialAgg._sum.totalCharges ?? new Prisma.Decimal(0)).minus(
      financialAgg._sum.totalCredits ?? new Prisma.Decimal(0)
    )
  ).toFixed(2);

  // Calculate average stay duration from stays in the result
  let averageStayDuration = 0;
  if (stays.length > 0) {
    let totalNights = 0;
    for (const stay of stays) {
      const checkIn = new Date(stay.actualCheckIn);
      const checkOut = stay.actualCheckOut ? new Date(stay.actualCheckOut) : new Date();
      totalNights += Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    }
    averageStayDuration = Math.round(totalNights / stays.length);
  }

  const results: StayInvestigationResult[] = stays.map((stay) => {
    const assignment = stay.roomAssignments[0];
    const room = assignment?.room;
    const folio = stay.folio;

    let totalPaid = new Prisma.Decimal(0);
    if (folio) {
      for (const p of folio.payments) {
        totalPaid = totalPaid.plus(p.amount);
      }
    }

    return {
      guestId: stay.primaryGuest.id,
      guestName: `${stay.primaryGuest.firstName} ${stay.primaryGuest.lastName}`,
      phone: stay.primaryGuest.phone,
      email: stay.primaryGuest.email,
      stayId: stay.id,
      stayNumber: stay.stayNumber,
      reservationNumber: stay.reservation?.reservationNumber ?? null,
      roomNumber: room?.roomNumber ?? 'Unassigned',
      roomTypeName: room?.roomType?.name ?? '',
      actualCheckIn: stay.actualCheckIn.toISOString(),
      expectedCheckOut: stay.expectedCheckOut.toISOString(),
      actualCheckOut: stay.actualCheckOut?.toISOString() ?? null,
      status: stay.status,
      folioBalance: (folio?.totalBalance ?? new Prisma.Decimal(0)).toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      matchedActivity: resolveMatchedActivity(stay, dateFromStr, dateToStr),
    };
  });

  return {
    results,
    summary: {
      checkIns,
      checkOuts,
      staying: stayingCount,
      totalRecords: total,
      totalRevenue,
      totalOutstanding,
      averageStayDuration,
    },
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    dateRange: {
      from: dateFromStr,
      to: dateToStr ?? dateFromStr,
    },
  };
}
