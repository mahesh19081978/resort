import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  StayStatus,
  RoomAssignmentStatus,
  PaymentStatus,
  FolioItemType,
} from '@prisma/client';
import { getBusinessDateNow } from '@/lib/dashboard/date';

export type InHouseFilter = 'all' | 'checkout_today' | 'overdue' | 'paid' | 'balance_due';

export interface InHouseRoomCard {
  stayId: string;
  stayNumber: string;
  reservationNumber: string | null;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  buildingName: string | null;
  floorName: string | null;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestCount: number;
  actualCheckIn: string;
  expectedCheckOut: string;
  nightsElapsed: number;
  isCheckoutToday: boolean;
  isOverdue: boolean;
  roomCharges: string;
  roomBaseCharges: string;
  roomTax: string;
  additionalCharges: string;
  restaurantCharges: string;
  taxCharges: string;
  discountCredits: string;
  totalFolioCharges: string;
  paymentsReceived: string;
  processedRefunds: string;
  outstandingBalance: string;
  isPaid: boolean;
  folioStatus: string;
  folioId: string | null;
  folioNumber: string | null;
}

function calculateNightsElapsed(checkIn: Date, now: Date): number {
  const diffMs = now.getTime() - checkIn.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

export async function getInHouseRooms(
  filter: InHouseFilter = 'all',
  searchQuery?: string
): Promise<InHouseRoomCard[]> {
  const todayStr = getBusinessDateNow();
  const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);
  const now = new Date();

  const where: Prisma.StayWhereInput = {
    status: StayStatus.ACTIVE,
    roomAssignments: {
      some: { status: RoomAssignmentStatus.ACTIVE },
    },
  };

  if (filter === 'checkout_today') {
    where.expectedCheckOut = todayUtc;
  } else if (filter === 'overdue') {
    where.expectedCheckOut = { lt: todayUtc };
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim();
    where.OR = [
      { stayNumber: { contains: q, mode: 'insensitive' } },
      { primaryGuest: { firstName: { contains: q, mode: 'insensitive' } } },
      { primaryGuest: { lastName: { contains: q, mode: 'insensitive' } } },
      { primaryGuest: { phone: { contains: q, mode: 'insensitive' } } },
      { reservation: { reservationNumber: { contains: q, mode: 'insensitive' } } },
      {
        roomAssignments: {
          some: { room: { roomNumber: { contains: q, mode: 'insensitive' } } },
        },
      },
    ];
  }

  const stays = await prisma.stay.findMany({
    where,
    include: {
      primaryGuest: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
      reservation: {
        select: {
          reservationNumber: true,
        },
      },
      roomAssignments: {
        where: { status: RoomAssignmentStatus.ACTIVE },
        include: {
          room: {
            include: {
              roomType: { select: { name: true } },
              floor: {
                include: {
                  building: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      stayGuests: {
        select: { id: true },
      },
      folio: {
        include: {
          items: {
            where: { isVoided: false },
            select: {
              itemType: true,
              amount: true,
              taxAmount: true,
            },
          },
          payments: {
            where: { status: PaymentStatus.SUCCESS },
            select: {
              amount: true,
            },
          },
        },
      },
    },
    orderBy: { actualCheckIn: 'desc' },
  });

  const result: InHouseRoomCard[] = stays.map((stay) => {
    const assignment = stay.roomAssignments[0];
    const room = assignment?.room;
    const folio = stay.folio;

    let roomCharges = new Prisma.Decimal(0);
    let roomBaseCharges = new Prisma.Decimal(0);
    let roomTax = new Prisma.Decimal(0);
    let additionalCharges = new Prisma.Decimal(0);
    let restaurantCharges = new Prisma.Decimal(0);
    let taxCharges = new Prisma.Decimal(0);
    let discountCredits = new Prisma.Decimal(0);

    if (folio) {
      for (const item of folio.items) {
        const amt = item.amount;
        const tax = item.taxAmount;
        switch (item.itemType) {
          case FolioItemType.ROOM_CHARGE:
            roomCharges = roomCharges.plus(amt);
            roomBaseCharges = roomBaseCharges.plus(amt.minus(tax));
            roomTax = roomTax.plus(tax);
            break;
          case FolioItemType.RESTAURANT_CHARGE:
          case FolioItemType.ROOM_SERVICE_CHARGE:
            restaurantCharges = restaurantCharges.plus(amt);
            break;
          case FolioItemType.DISCOUNT_CREDIT:
            discountCredits = discountCredits.plus(amt);
            break;
          case FolioItemType.TAX_CHARGE:
            taxCharges = taxCharges.plus(amt);
            break;
          default:
            additionalCharges = additionalCharges.plus(amt);
            break;
        }
      }
    }

    // amount is always the authoritative gross (tax-inclusive) FolioItem total.
    // Do not add taxAmount on top — it is already embedded in amount.
    // taxCharges only accumulates standalone TAX_CHARGE items.
    const totalFolioCharges = roomCharges
      .plus(additionalCharges)
      .plus(restaurantCharges)
      .plus(taxCharges)
      .minus(discountCredits);

    let paymentsReceived = new Prisma.Decimal(0);
    if (folio) {
      for (const p of folio.payments) {
        paymentsReceived = paymentsReceived.plus(p.amount);
      }
    }

    const outstandingBalance = totalFolioCharges.minus(paymentsReceived);
    const isPaid = outstandingBalance.lessThanOrEqualTo(0);
    const isCheckoutToday = isSameDay(new Date(stay.expectedCheckOut), todayUtc);
    const isOverdue = new Date(stay.expectedCheckOut) < todayUtc;
    const nightsElapsed = calculateNightsElapsed(stay.actualCheckIn, now);

    return {
      stayId: stay.id,
      stayNumber: stay.stayNumber,
      reservationNumber: stay.reservation?.reservationNumber ?? null,
      roomId: room?.id ?? '',
      roomNumber: room?.roomNumber ?? 'Unassigned',
      roomTypeName: room?.roomType?.name ?? '',
      buildingName: room?.floor?.building?.name ?? null,
      floorName: room?.floor?.name ?? null,
      guestId: stay.primaryGuestId,
      guestName: `${stay.primaryGuest.firstName} ${stay.primaryGuest.lastName}`,
      guestPhone: stay.primaryGuest.phone,
      guestCount: stay.stayGuests.length + 1,
      actualCheckIn: stay.actualCheckIn.toISOString(),
      expectedCheckOut: stay.expectedCheckOut.toISOString(),
      nightsElapsed,
      isCheckoutToday,
      isOverdue,
      roomCharges: roomCharges.toFixed(2),
      roomBaseCharges: roomBaseCharges.toFixed(2),
      roomTax: roomTax.toFixed(2),
      additionalCharges: additionalCharges.toFixed(2),
      restaurantCharges: restaurantCharges.toFixed(2),
      taxCharges: taxCharges.toFixed(2),
      discountCredits: discountCredits.toFixed(2),
      totalFolioCharges: totalFolioCharges.toFixed(2),
      paymentsReceived: paymentsReceived.toFixed(2),
      processedRefunds: '0.00',
      outstandingBalance: outstandingBalance.toFixed(2),
      isPaid,
      folioStatus: folio?.status ?? 'NONE',
      folioId: folio?.id ?? null,
      folioNumber: folio?.folioNumber ?? null,
    };
  });

  if (filter === 'paid') {
    return result.filter((r) => r.isPaid);
  }
  if (filter === 'balance_due') {
    return result.filter((r) => !r.isPaid);
  }

  return result;
}
