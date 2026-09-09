/**
 * Reports & Analytics — Occupancy & Room Performance Report Service
 *
 * METRIC DEFINITIONS:
 * - OCCUPANCY % = occupied room nights / sellable room nights * 100
 * - ADR (Average Daily Rate) = room revenue / occupied room nights
 * - RevPAR (Revenue Per Available Room) = room revenue / available sellable room nights
 * - ROOM NIGHTS SOLD = count of physically occupied room-nights
 * - ROOM NIGHTS AVAILABLE = sellable rooms * days in period
 *
 * Historical occupancy uses actual Stay + RoomAssignment data.
 * Future demand is NOT included in occupancy metrics.
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma, PhysicalRoomStatus, FolioItemType } from '@prisma/client';
import type { ResolvedPeriodRange, PeriodBucket } from '@/lib/dashboard/date';
import { getBusinessDateUtcDate, getNextBusinessDate, getPeriodBuckets } from '@/lib/dashboard/date';

export interface OccupancyReportSummary {
  occupancyRate: number;
  adr: Prisma.Decimal | null;
  revpar: Prisma.Decimal | null;
  roomNightsSold: number;
  roomNightsAvailable: number;
  occupiedRooms: number;
  availableRooms: number;
  outOfOrderRooms: number;
  totalRooms: number;
  roomRevenue: Prisma.Decimal;
}

export interface OccupancyTrendPoint {
  key: string;
  label: string;
  dateStr: string;
  occupancyRate: number;
  adr: number;
  revpar: number;
  roomNightsSold: number;
  roomNightsAvailable: number;
}

export interface OccupancyByRoomType {
  roomType: string;
  totalRooms: number;
  occupiedNights: number;
  availableNights: number;
  occupancyRate: number;
  revenue: Prisma.Decimal;
  adr: Prisma.Decimal | null;
}

export interface OccupancyReportData {
  summary: OccupancyReportSummary;
  trend: OccupancyTrendPoint[];
  byRoomType: OccupancyByRoomType[];
  hasData: boolean;
}

/**
 * Calculates historical occupied room nights from physical RoomAssignments.
 * Iterates through each calendar day and checks physical occupancy at the night boundary.
 */
async function calculateHistoricalOccupiedNights(
  propertyId: string,
  startDateStr: string,
  endDateStr: string
): Promise<number> {
  const rangeStartTs = new Date(`${startDateStr}T00:00:00.000+05:30`);
  const nextEndDate = getNextBusinessDate(endDateStr);
  const rangeEndTs = new Date(`${nextEndDate}T00:00:00.000+05:30`);

  const stays = await prisma.stay.findMany({
    where: {
      status: { in: ['ACTIVE', 'CHECKED_OUT'] },
      roomAssignments: { some: { room: { propertyId } } },
      actualCheckIn: { lt: rangeEndTs },
      OR: [
        { actualCheckOut: { gt: rangeStartTs } },
        { actualCheckOut: null, expectedCheckOut: { gt: rangeStartTs } },
      ],
    },
    select: {
      id: true,
      actualCheckIn: true,
      actualCheckOut: true,
      expectedCheckOut: true,
      roomAssignments: {
        where: { room: { propertyId } },
        select: {
          roomId: true,
          assignedAt: true,
          releasedAt: true,
        },
      },
    },
  });

  if (stays.length === 0) return 0;

  let totalNightCount = 0;
  let currDate = startDateStr;

  while (currDate <= endDateStr) {
    const nightInstant = new Date(`${currDate}T23:00:00.000+05:30`);
    const occupiedRoomSet = new Set<string>();

    for (const stay of stays) {
      const checkIn = stay.actualCheckIn;
      const checkOut = stay.actualCheckOut || stay.expectedCheckOut;
      if (nightInstant >= checkIn && nightInstant < checkOut) {
        for (const ra of stay.roomAssignments) {
          const assignStart = ra.assignedAt;
          const assignEnd = ra.releasedAt || checkOut;
          if (nightInstant >= assignStart && nightInstant < assignEnd) {
            occupiedRoomSet.add(ra.roomId);
          }
        }
      }
    }
    totalNightCount += occupiedRoomSet.size;
    currDate = getNextBusinessDate(currDate);
  }

  return totalNightCount;
}

/**
 * Generates the Occupancy & Room Performance Report.
 */
export async function getOccupancyReport(
  propertyId: string,
  periodRange: ResolvedPeriodRange,
  isToday: boolean
): Promise<OccupancyReportData> {
  const { current } = periodRange;
  const buckets = getPeriodBuckets(periodRange);

  // Get room inventory
  const roomGroups = await prisma.room.groupBy({
    by: ['status'],
    where: { propertyId, isActive: true },
    _count: true,
  });

  const statusCounts: Record<string, number> = {};
  let totalRooms = 0;
  for (const g of roomGroups) {
    statusCounts[g.status] = g._count;
    totalRooms += g._count;
  }

  const outOfOrderRooms = statusCounts[PhysicalRoomStatus.OUT_OF_ORDER] || 0;
  const sellableRooms = totalRooms - outOfOrderRooms;
  const occupiedRooms = statusCounts[PhysicalRoomStatus.OCCUPIED] || 0;
  const availableRooms = totalRooms - occupiedRooms - outOfOrderRooms;

  // Room nights
  const roomNightsAvailable = sellableRooms * current.daysCount;
  let roomNightsSold = 0;
  if (isToday) {
    roomNightsSold = occupiedRooms;
  } else {
    roomNightsSold = await calculateHistoricalOccupiedNights(propertyId, current.startDateStr, current.endDateStr);
  }

  const occupancyRate = roomNightsAvailable > 0
    ? Math.round((roomNightsSold / roomNightsAvailable) * 1000) / 10
    : 0;

  // Room Revenue
  const roomRevenueAgg = await prisma.folioItem.aggregate({
    _sum: { amount: true },
    where: {
      itemType: FolioItemType.ROOM_CHARGE,
      isVoided: false,
      postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      folio: { stay: { roomAssignments: { some: { room: { propertyId } } } } },
    },
  });
  const roomRevenue = roomRevenueAgg._sum.amount || new Prisma.Decimal(0);

  const adr = roomNightsSold > 0 ? roomRevenue.dividedBy(new Prisma.Decimal(roomNightsSold)) : null;
  const revpar = roomNightsAvailable > 0 ? roomRevenue.dividedBy(new Prisma.Decimal(roomNightsAvailable)) : null;

  const summary: OccupancyReportSummary = {
    occupancyRate,
    adr,
    revpar,
    roomNightsSold,
    roomNightsAvailable,
    occupiedRooms,
    availableRooms,
    outOfOrderRooms,
    totalRooms,
    roomRevenue,
  };

  // Trend (daily occupancy over period)
  const allRoomCharges = await prisma.folioItem.findMany({
    where: {
      itemType: FolioItemType.ROOM_CHARGE,
      isVoided: false,
      postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      folio: { stay: { roomAssignments: { some: { room: { propertyId } } } } },
    },
    select: { amount: true, postedAt: true },
  });

  const trend: OccupancyTrendPoint[] = buckets.map((bucket: PeriodBucket) => {
    let bucketRevenue = new Prisma.Decimal(0);
    for (const item of allRoomCharges) {
      if (item.postedAt >= bucket.startTimestamp && item.postedAt < bucket.endTimestamp) {
        bucketRevenue = bucketRevenue.plus(item.amount);
      }
    }
    const bucketNights = sellableRooms;
    const bucketOccupancy = bucketNights > 0 ? Math.round((roomNightsSold / current.daysCount / sellableRooms) * 1000) / 10 : 0;
    const bucketAdr = roomNightsSold > 0 ? bucketRevenue.dividedBy(new Prisma.Decimal(Math.max(1, roomNightsSold / current.daysCount))).toNumber() : 0;
    const bucketRevpar = bucketNights > 0 ? bucketRevenue.dividedBy(new Prisma.Decimal(bucketNights)).toNumber() : 0;
    return {
      key: bucket.key,
      label: bucket.label,
      dateStr: bucket.dateStr,
      occupancyRate: bucketOccupancy,
      adr: bucketAdr,
      revpar: bucketRevpar,
      roomNightsSold: Math.round(roomNightsSold / current.daysCount),
      roomNightsAvailable: sellableRooms,
    };
  });

  // By Room Type
  const roomTypes = await prisma.roomType.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { displayOrder: 'asc' },
  });

  const rooms = await prisma.room.findMany({
    where: { propertyId, isActive: true },
    select: { id: true, roomTypeId: true },
  });

  const byRoomType: OccupancyByRoomType[] = [];
  for (const rt of roomTypes) {
    const rtRoomIds = rooms.filter((r) => r.roomTypeId === rt.id).map((r) => r.id);
    if (rtRoomIds.length === 0) {
      byRoomType.push({
        roomType: rt.name,
        totalRooms: 0,
        occupiedNights: 0,
        availableNights: 0,
        occupancyRate: 0,
        revenue: new Prisma.Decimal(0),
        adr: null,
      });
      continue;
    }

    const rtRevenue = await prisma.folioItem.aggregate({
      _sum: { amount: true },
      where: {
        itemType: FolioItemType.ROOM_CHARGE,
        isVoided: false,
        postedAt: { gte: current.startTimestamp, lt: current.endTimestamp },
        folio: { stay: { roomAssignments: { some: { roomId: { in: rtRoomIds } } } } },
      },
    });
    const revenue = rtRevenue._sum.amount || new Prisma.Decimal(0);

    let occupiedNights = 0;
    if (isToday) {
      const occRooms = await prisma.room.count({
        where: { id: { in: rtRoomIds }, status: PhysicalRoomStatus.OCCUPIED },
      });
      occupiedNights = occRooms;
    } else {
      const stays = await prisma.stay.findMany({
        where: {
          status: { in: ['ACTIVE', 'CHECKED_OUT'] },
          roomAssignments: { some: { roomId: { in: rtRoomIds } } },
          actualCheckIn: { lt: current.endTimestamp },
          OR: [
            { actualCheckOut: { gt: current.startTimestamp } },
            { actualCheckOut: null, expectedCheckOut: { gt: current.startTimestamp } },
          ],
        },
        select: {
          actualCheckIn: true,
          actualCheckOut: true,
          expectedCheckOut: true,
          roomAssignments: {
            where: { roomId: { in: rtRoomIds } },
            select: { roomId: true, assignedAt: true, releasedAt: true },
          },
        },
      });

      let currDate = current.startDateStr;
      while (currDate <= current.endDateStr) {
        const nightInstant = new Date(`${currDate}T23:00:00.000+05:30`);
        const occSet = new Set<string>();
        for (const s of stays) {
          const cIn = s.actualCheckIn;
          const cOut = s.actualCheckOut || s.expectedCheckOut;
          if (nightInstant >= cIn && nightInstant < cOut) {
            for (const ra of s.roomAssignments) {
              const raStart = ra.assignedAt;
              const raEnd = ra.releasedAt || cOut;
              if (nightInstant >= raStart && nightInstant < raEnd) occSet.add(ra.roomId);
            }
          }
        }
        occupiedNights += occSet.size;
        currDate = getNextBusinessDate(currDate);
      }
    }

    const availableNights = rtRoomIds.length * current.daysCount;
    const occupancyRate = availableNights > 0 ? Math.round((occupiedNights / availableNights) * 1000) / 10 : 0;
    const adr = occupiedNights > 0 ? revenue.dividedBy(new Prisma.Decimal(occupiedNights)) : null;

    byRoomType.push({
      roomType: rt.name,
      totalRooms: rtRoomIds.length,
      occupiedNights,
      availableNights,
      occupancyRate,
      revenue,
      adr,
    });
  }

  return {
    summary,
    trend,
    byRoomType,
    hasData: roomNightsSold > 0 || roomRevenue.toNumber() > 0,
  };
}
