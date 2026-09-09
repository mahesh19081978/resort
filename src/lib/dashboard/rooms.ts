import { prisma } from '@/lib/db/prisma';
import { PhysicalRoomStatus } from '@prisma/client';

export interface RoomInventorySummary {
  total: number;
  available: number;
  reserved: number;
  occupied: number;
  dirty: number;
  cleaning: number;
  maintenance: number;
  outOfOrder: number;
  occupancyRate: number; // percentage, e.g. 75.5
  occupancyRateFormatted: string; // e.g. "75.5%"
}

/**
 * Authoritative single-query Room Inventory Summary.
 * Uses a single database-side groupBy query over active physical Room records.
 *
 * Denominator for occupancy is sellable active inventory:
 * Occupancy Rate = (Occupied Rooms) / (Total Active Rooms - Out of Order Rooms) * 100
 */
export async function getRoomInventorySummary(
  propertyId?: string
): Promise<RoomInventorySummary> {
  const groups = await prisma.room.groupBy({
    by: ['status'],
    where: {
      isActive: true,
      ...(propertyId ? { propertyId } : {}),
    },
    _count: true,
  });

  const counts: Record<PhysicalRoomStatus, number> = {
    [PhysicalRoomStatus.AVAILABLE]: 0,
    [PhysicalRoomStatus.RESERVED]: 0,
    [PhysicalRoomStatus.OCCUPIED]: 0,
    [PhysicalRoomStatus.DIRTY]: 0,
    [PhysicalRoomStatus.CLEANING]: 0,
    [PhysicalRoomStatus.MAINTENANCE]: 0,
    [PhysicalRoomStatus.OUT_OF_ORDER]: 0,
  };

  let total = 0;
  for (const group of groups) {
    if (group.status in counts) {
      counts[group.status] = group._count;
      total += group._count;
    }
  }

  const available = counts[PhysicalRoomStatus.AVAILABLE];
  const reserved = counts[PhysicalRoomStatus.RESERVED];
  const occupied = counts[PhysicalRoomStatus.OCCUPIED];
  const dirty = counts[PhysicalRoomStatus.DIRTY];
  const cleaning = counts[PhysicalRoomStatus.CLEANING];
  const maintenance = counts[PhysicalRoomStatus.MAINTENANCE];
  const outOfOrder = counts[PhysicalRoomStatus.OUT_OF_ORDER];

  // Sellable physical rooms = total active rooms excluding OUT_OF_ORDER
  const sellableRooms = Math.max(0, total - outOfOrder);
  let occupancyRate = 0;
  if (sellableRooms > 0) {
    occupancyRate = Math.round((occupied / sellableRooms) * 1000) / 10; // 1 decimal place
  }

  return {
    total,
    available,
    reserved,
    occupied,
    dirty,
    cleaning,
    maintenance,
    outOfOrder,
    occupancyRate,
    occupancyRateFormatted: `${occupancyRate.toFixed(1)}%`,
  };
}
