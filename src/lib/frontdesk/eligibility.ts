import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { PhysicalRoomStatus } from '@prisma/client';

export interface EligibleRoomResult {
  id: string;
  roomNumber: string;
  status: PhysicalRoomStatus;
  floor: {
    id: string;
    name: string;
    floorNumber: number;
    building: {
      id: string;
      name: string;
      code: string;
    };
  };
  roomType: {
    id: string;
    name: string;
    code: string;
    basePrice: Prisma.Decimal;
  };
}

/**
 * Server-side query for rooms genuinely eligible for guest check-in.
 * Criteria:
 * 1. Physical room status MUST be AVAILABLE (or RESERVED for this specific reservation).
 * 2. Room must belong to target property and match the reserved RoomType.
 * 3. Room must NOT be DIRTY, CLEANING, MAINTENANCE, or OUT_OF_ORDER.
 * 4. Room must have NO active RoomAssignment (status: ACTIVE).
 * 5. Room must be active (isActive = true).
 */
export async function getEligibleRoomsForCheckIn(
  propertyId: string | undefined | null,
  roomTypeId: string,
  reservationId?: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<EligibleRoomResult[]> {
  const rooms = await db.room.findMany({
    where: {
      ...(propertyId ? { propertyId } : {}),
      roomTypeId,
      isActive: true,
      status: {
        in: [PhysicalRoomStatus.AVAILABLE, PhysicalRoomStatus.RESERVED],
      },
      assignments: {
        none: {
          status: 'ACTIVE',
        },
      },
    },
    include: {
      assignments: {
        where: {
          stay: {
            reservationId: reservationId || 'non-existent',
          },
        },
        select: {
          id: true,
          stayId: true,
          status: true,
        },
      },
      floor: {
        include: {
          building: {
            select: { id: true, name: true, code: true },
          },
        },
      },
      roomType: {
        select: { id: true, name: true, code: true, basePrice: true },
      },
    },
    orderBy: [{ floor: { floorNumber: 'asc' } }, { roomNumber: 'asc' }],
  });

  // Filter out any RESERVED room that doesn't have an association to this reservation
  const filtered = rooms.filter((r: any) => {
    if (r.status === PhysicalRoomStatus.AVAILABLE) {
      return true;
    }
    if (r.status === PhysicalRoomStatus.RESERVED) {
      // Must have an assignment or reservation linkage for this specific reservationId
      if (!reservationId) return false;
      return Array.isArray(r.assignments) && r.assignments.length > 0;
    }
    return false;
  });

  return filtered as unknown as EligibleRoomResult[];
}
