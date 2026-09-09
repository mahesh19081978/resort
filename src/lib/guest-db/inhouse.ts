import { prisma } from '@/lib/db/prisma';
import { Prisma, StayStatus, RoomAssignmentStatus, PaymentStatus } from '@prisma/client';
import { getBusinessDateNow } from '@/lib/dashboard/date';

export interface CurrentlyStayingCard {
  stayId: string;
  stayNumber: string;
  guestName: string;
  guestId: string;
  phone: string;
  email: string | null;
  roomNumber: string;
  roomTypeName: string;
  roomFloor: string | null;
  building: string | null;
  actualCheckIn: string;
  expectedCheckOut: string;
  nights: number;
  nightsRemaining: number;
  folioBalance: string;
  totalPaid: string;
  outstandingBalance: string;
  reservationNumber: string | null;
  bookingSource: string | null;
  isOverdue: boolean;
  isLongStay: boolean;
  hasOutstandingBalance: boolean;
  lastPaymentDate: string | null;
  lastPaymentMethod: string | null;
}

export interface CurrentlyStayingFilters {
  roomNumber?: string;
  floor?: string;
  building?: string;
  status?: 'all' | 'arrivals_today' | 'departures_today' | 'in_house' | 'long_stay';
}

export interface CurrentlyStayingResult {
  rooms: CurrentlyStayingCard[];
  total: number;
  summary: {
    totalInHouse: number;
    arrivalsToday: number;
    departuresToday: number;
    overdueCheckouts: number;
    totalFolioBalance: string;
    totalOutstanding: string;
  };
}

export async function getCurrentlyStayingPage(
  filters: CurrentlyStayingFilters = {}
): Promise<CurrentlyStayingResult> {
  const todayStr = getBusinessDateNow();
  const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);
  const tomorrowUtc = new Date(`${todayStr}T00:00:00.000Z`);
  tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);

  const where: Prisma.StayWhereInput = {
    status: StayStatus.ACTIVE,
    roomAssignments: {
      some: { status: RoomAssignmentStatus.ACTIVE },
    },
  };

  switch (filters.status) {
    case 'arrivals_today':
      where.actualCheckIn = { gte: todayUtc, lt: tomorrowUtc };
      break;
    case 'departures_today':
      where.expectedCheckOut = { gte: todayUtc, lt: tomorrowUtc };
      break;
    case 'long_stay':
      where.actualCheckIn = { lt: new Date(todayUtc.getTime() - 7 * 24 * 60 * 60 * 1000) };
      break;
    case 'in_house':
    default:
      break;
  }

  if (filters.roomNumber && filters.roomNumber.trim()) {
    where.roomAssignments = {
      some: {
        status: RoomAssignmentStatus.ACTIVE,
        room: { roomNumber: { contains: filters.roomNumber.trim(), mode: 'insensitive' } },
      },
    };
  }

  const stays = await prisma.stay.findMany({
    where,
    include: {
      primaryGuest: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
      reservation: {
        select: {
          reservationNumber: true,
          source: true,
        },
      },
      roomAssignments: {
        where: { status: RoomAssignmentStatus.ACTIVE },
        include: {
          room: {
            include: {
              roomType: { select: { name: true } },
              floor: { include: { building: { select: { name: true } } } },
            },
          },
        },
      },
      folio: {
        include: {
          items: { where: { isVoided: false }, select: { amount: true } },
          payments: {
            where: { status: PaymentStatus.SUCCESS },
            orderBy: { paymentDate: 'desc' },
            take: 1,
            select: { amount: true, method: true, paymentDate: true },
          },
        },
      },
    },
    orderBy: [
      { expectedCheckOut: 'asc' },
      { actualCheckIn: 'asc' },
    ],
  });

  const [totalInHouse, arrivalsToday, departuresToday, overdueCheckouts] = await Promise.all([
    prisma.stay.count({
      where: {
        status: StayStatus.ACTIVE,
        roomAssignments: { some: { status: RoomAssignmentStatus.ACTIVE } },
      },
    }),
    prisma.stay.count({
      where: {
        status: StayStatus.ACTIVE,
        actualCheckIn: { gte: todayUtc, lt: tomorrowUtc },
      },
    }),
    prisma.stay.count({
      where: {
        status: StayStatus.ACTIVE,
        expectedCheckOut: { gte: todayUtc, lt: tomorrowUtc },
      },
    }),
    prisma.stay.count({
      where: {
        status: StayStatus.ACTIVE,
        expectedCheckOut: { lt: todayUtc },
      },
    }),
  ]);

  const now = new Date();

  const rooms: CurrentlyStayingCard[] = stays.map((stay) => {
    const assignment = stay.roomAssignments[0];
    const room = assignment?.room;
    const folio = stay.folio;

    let totalPaid = new Prisma.Decimal(0);
    let lastPaymentDate: string | null = null;
    let lastPaymentMethod: string | null = null;

    if (folio) {
      for (const payment of folio.payments) {
        totalPaid = totalPaid.plus(payment.amount);
      }
      if (folio.payments.length > 0) {
        lastPaymentDate = folio.payments[0].paymentDate.toISOString();
        lastPaymentMethod = folio.payments[0].method;
      }
    }

    const totalCharged = folio?.items.reduce(
      (sum, item) => sum.plus(item.amount),
      new Prisma.Decimal(0)
    ) ?? new Prisma.Decimal(0);

    const outstandingBalance = totalCharged.minus(totalPaid);
    const folioBalance = folio?.totalBalance ?? new Prisma.Decimal(0);

    const checkInDate = new Date(stay.actualCheckIn);
    const expectedCheckout = new Date(stay.expectedCheckOut);
    const nights = Math.ceil((expectedCheckout.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    const nightsRemaining = Math.max(0, Math.ceil((expectedCheckout.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const isOverdue = now > expectedCheckout;
    const isLongStay = nights >= 7;

    return {
      stayId: stay.id,
      stayNumber: stay.stayNumber,
      guestName: `${stay.primaryGuest.firstName} ${stay.primaryGuest.lastName}`,
      guestId: stay.primaryGuest.id,
      phone: stay.primaryGuest.phone,
      email: stay.primaryGuest.email,
      roomNumber: room?.roomNumber ?? 'Unassigned',
      roomTypeName: room?.roomType?.name ?? '',
      roomFloor: room?.floor?.floorNumber?.toString() ?? null,
      building: room?.floor?.building?.name ?? null,
      actualCheckIn: stay.actualCheckIn.toISOString(),
      expectedCheckOut: stay.expectedCheckOut.toISOString(),
      nights,
      nightsRemaining,
      folioBalance: folioBalance.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
      reservationNumber: stay.reservation?.reservationNumber ?? null,
      bookingSource: stay.reservation?.source ?? null,
      isOverdue,
      isLongStay,
      hasOutstandingBalance: outstandingBalance.gt(0),
      lastPaymentDate,
      lastPaymentMethod,
    };
  });

  const financialAgg = await prisma.folio.aggregate({
    where: {
      stay: { status: StayStatus.ACTIVE },
    },
    _sum: { totalCharges: true, totalCredits: true },
  });

  const totalFolioBalance = (financialAgg._sum.totalCharges ?? new Prisma.Decimal(0)).toFixed(2);
  const totalOutstanding = (
    (financialAgg._sum.totalCharges ?? new Prisma.Decimal(0)).minus(
      financialAgg._sum.totalCredits ?? new Prisma.Decimal(0)
    )
  ).toFixed(2);

  return {
    rooms,
    total: rooms.length,
    summary: {
      totalInHouse,
      arrivalsToday,
      departuresToday,
      overdueCheckouts,
      totalFolioBalance,
      totalOutstanding,
    },
  };
}
