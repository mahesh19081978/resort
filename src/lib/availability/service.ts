import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { type AvailabilitySearchParams } from './schema';
import type { RoomType, Room, RoomTypeAmenity, Amenity, Media } from '@prisma/client';

type RoomTypeWithRelations = RoomType & {
  amenities: (RoomTypeAmenity & { amenity: Amenity })[];
  media: Media[];
  rooms: Pick<Room, 'id'>[];
};

export interface AvailableRoomType {
  roomTypeId: string;
  slug: string;
  name: string;
  description: string;
  maxOccupancy: number;
  basePrice: number;
  availableRoomCount: number;
  amenities: { name: string; code: string; icon: string | null }[];
  media: { id: string; fileUrl: string; title: string | null; isFeatured: boolean }[];
}

export interface AvailabilityResult {
  availableRoomTypes: AvailableRoomType[];
  totalAvailable: number;
}

/**
 * Server-side availability calculation.
 *
 * Physical room availability is determined by:
 * 1. Total active physical Rooms belonging to the RoomType.
 * 2. Subtract rooms blocked by active stays (authoritative after check-in).
 * 3. Subtract rooms blocked by overlapping reservations (pre-check-in inventory).
 *
 * KEY RULE — Stay is authoritative for physical room occupancy:
 *   Once a guest checks in, the RoomAssignment → Stay link determines
 *   which physical room is occupied. The occupancy window is:
 *     [actualCheckIn, COALESCE(actualCheckOut, GREATEST(expectedCheckOut, CURRENT_DATE)))
 *
 *   - actualCheckOut is set at checkout (may be earlier or later than expected).
 *   - expectedCheckOut is the planned checkout set at check-in.
 *   - If actualCheckOut is null (guest hasn't checked out):
 *     - Normal case: use expectedCheckOut.
 *     - Overstay (expectedCheckOut < today): use CURRENT_DATE.
 *       A physically occupied room must never be released solely because
 *       its planned checkout date has passed.
 *   - If actualCheckOut is set (early/normal checkout): use that.
 *
 * KEY RULE — No double-counting (ReservationRoom is RoomType-level, NOT physical-room-level):
 *   ReservationRoom stores (roomTypeId, roomsCount) — it represents a
 *   RoomType-level inventory allocation, NOT a specific physical Room.
 *   RoomAssignment links a Stay to a specific physical Room (roomId).
 *
 *   A checked-in reservation has BOTH:
 *     - A ReservationRoom record (blocking N rooms at the RoomType level)
 *     - An active RoomAssignment → Stay (blocking 1 physical Room)
 *
 *   The same physical room is represented in both counts. We must not
 *   subtract it twice.
 *
 *   Invariant: stays are the primary physical-room blocker. Reservation
 *   blocking is reduced by rooms already covered by active stays:
 *     netReservationBlocked = max(0, reservationRaw - stayBlockedCount)
 *     totalBlocked = stayBlockedCount + netReservationBlocked
 *
 *   This is safe because ReservationRoom is intentionally a RoomType-level
 *   allocation (no physical Room ID). When a reservation links to a Stay
 *   via Stay.reservationId, the Stay's RoomAssignment already accounts for
 *   that physical room. The reservation's roomsCount is fully absorbed by
 *   the stay's physical room block.
 *
 * Overlap rule (standard hotel):
 *   existingCheckIn < requestedCheckOut AND existingCheckOut > requestedCheckIn
 *
 * Blocked statuses:
 * - Reservations: PENDING or CONFIRMED
 * - Stays: ACTIVE
 */
export async function getAvailableRoomTypes(
  params: AvailabilitySearchParams
): Promise<AvailabilityResult> {
  const requestedCheckIn = new Date(`${params.checkIn}T00:00:00Z`);
  const requestedCheckOut = new Date(`${params.checkOut}T00:00:00Z`);

  // 1. Fetch all active RoomTypes with their amenities, media, and rooms
  const roomTypes = (await prisma.roomType.findMany({
    where: { isActive: true },
    include: {
      amenities: { include: { amenity: true } },
      media: { orderBy: [{ isFeatured: 'desc' }, { createdAt: 'asc' }] },
      rooms: { where: { isActive: true }, select: { id: true } },
    },
    orderBy: { displayOrder: 'asc' },
  })) as RoomTypeWithRelations[];

  if (roomTypes.length === 0) {
    return { availableRoomTypes: [], totalAvailable: 0 };
  }

  const roomTypeIds = roomTypes.map((rt) => rt.id);

  // ── STEP A: Active stays — the authoritative physical-room blocker ──
  //
  // Occupancy window: [actualCheckIn, effectiveEnd)
  //   where effectiveEnd = COALESCE(actualCheckOut, GREATEST(expectedCheckOut, CURRENT_DATE))
  //
  // Overstay policy:
  //   An ACTIVE stay whose expectedCheckOut has passed but actualCheckOut is
  //   still null represents a guest who has NOT checked out. The physical room
  //   is still occupied. We must NOT release it solely because the planned
  //   checkout date has passed. GREATEST(expectedCheckOut, CURRENT_DATE)
  //   ensures the room remains blocked through at least today.
  //
  // A stay blocks its assigned physical room if:
  //   actualCheckIn < requestedCheckOut  (guest arrived before requested end)
  //   AND effectiveEnd > requestedCheckIn  (guest hasn't left before requested start)
  //
  // This correctly handles:
  //   - Normal checkout:   room blocked until actualCheckOut
  //   - Early checkout:    room blocked until actualCheckOut (not expectedCheckOut)
  //   - No checkout yet:   room blocked until expectedCheckOut (or today if overstay)
  //   - Overstay:          room blocked until actualCheckOut (which is after expected)
  //   - Closed/completed:  room NOT blocked (actualCheckOut is set)

  const blockedStays = await prisma.$queryRaw<{ roomId: string }[]>`
    SELECT ra."roomId"
    FROM "RoomAssignment" ra
    JOIN "Stay" s ON s.id = ra."stayId"
    WHERE ra.status = 'ACTIVE'
      AND s.status = 'ACTIVE'
      AND s."actualCheckIn" < ${requestedCheckOut}
      AND COALESCE(s."actualCheckOut", GREATEST(s."expectedCheckOut", CURRENT_DATE)) > ${requestedCheckIn}
  `;

  // Map blocked room IDs to their room types
  const stayBlockedRoomIds = new Set(blockedStays.map((s) => s.roomId));
  const stayBlockedByType = new Map<string, Set<string>>();

  if (stayBlockedRoomIds.size > 0) {
    const stayBlockedRooms = await prisma.room.findMany({
      where: { id: { in: Array.from(stayBlockedRoomIds) } },
      select: { id: true, roomTypeId: true },
    });
    for (const room of stayBlockedRooms) {
      if (!stayBlockedByType.has(room.roomTypeId)) {
        stayBlockedByType.set(room.roomTypeId, new Set());
      }
      stayBlockedByType.get(room.roomTypeId)!.add(room.id);
    }
  }

  // ── STEP B: Reservations — RoomType-level inventory blocker ──
  //
  // ReservationRoom is a RoomType-level allocation: it stores (roomTypeId,
  // roomsCount) with NO physical Room ID. It represents pre-check-in
  // inventory reserved at the type level.
  //
  // A checked-in reservation has BOTH a ReservationRoom AND an active
  // RoomAssignment → Stay. The Stay's physical room is already counted in
  // stayBlockedCount. We must NOT subtract the same physical room twice.
  //
  // Net reservation blocking per RoomType =
  //   sum(ReservationRoom.roomsCount) - rooms already blocked by active stays
  //
  // Invariant: this subtraction is safe because ReservationRoom has no
  // physical Room ID — it is intentionally a type-level allocation.
  // When Stay.reservationId links a Stay to a Reservation, the Stay's
  // RoomAssignment already accounts for that physical room.

  const blockedByReservation = await prisma.reservationRoom.groupBy({
    by: ['roomTypeId'],
    where: {
      roomTypeId: { in: roomTypeIds },
      reservation: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        checkInDate: { lt: requestedCheckOut },
        checkOutDate: { gt: requestedCheckIn },
      },
    },
    _sum: { roomsCount: true },
  });

  // ── STEP C: Calculate availability per RoomType ──

  const availableRoomTypes: AvailableRoomType[] = [];

  for (const rt of roomTypes) {
    if (rt.maxOccupancy < params.guests) continue;

    const totalActiveRooms = rt.rooms.length;
    if (totalActiveRooms === 0) continue;

    // Physical rooms blocked by active stays
    const stayBlockedCount = stayBlockedByType.get(rt.id)?.size ?? 0;

    // Reservation blocking (raw sum of reserved rooms)
    const reservationBlockedRaw =
      blockedByReservation.find((br) => br.roomTypeId === rt.id)?._sum.roomsCount ?? 0;
    const reservationBlocked = Number(reservationBlockedRaw);

    // Net reservation blocking = raw - rooms already covered by active stays
    // (prevents double-counting the same physical room)
    const netReservationBlocked = Math.max(0, reservationBlocked - stayBlockedCount);

    const totalBlocked = stayBlockedCount + netReservationBlocked;
    const available = totalActiveRooms - totalBlocked;

    if (available <= 0) continue;

    availableRoomTypes.push({
      roomTypeId: rt.id,
      slug: rt.slug,
      name: rt.name,
      description: rt.description,
      maxOccupancy: rt.maxOccupancy,
      basePrice: Number(rt.basePrice),
      availableRoomCount: available,
      amenities: rt.amenities.map((ra) => ({
        name: ra.amenity.name,
        code: ra.amenity.code,
        icon: ra.amenity.icon,
      })),
      media: rt.media.map((m) => ({
        id: m.id,
        fileUrl: m.fileUrl,
        title: m.title,
        isFeatured: m.isFeatured,
      })),
    });
  }

  return {
    availableRoomTypes,
    totalAvailable: availableRoomTypes.length,
  };
}
