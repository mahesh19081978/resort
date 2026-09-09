/**
 * Reports & Analytics — Guest Reports Service
 *
 * Non-sensitive operational data only.
 * Sensitive documents/photos must NOT be exposed.
 * Respects guest:view_sensitive permission.
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';

export interface GuestReportSummary {
  totalGuests: number;
  newGuests: number;
  repeatGuests: number;
  totalStays: number;
  totalRoomNights: number;
  averageStayDuration: number | null;
}

export interface GuestStaySummary {
  guestId: string;
  guestName: string;
  stayCount: number;
  roomNights: number;
  lastStayDate: Date | null;
}

export interface GuestReportData {
  summary: GuestReportSummary;
  topGuests: GuestStaySummary[];
  hasData: boolean;
}

export async function getGuestReport(
  periodRange: ResolvedPeriodRange
): Promise<GuestReportData> {
  const { current } = periodRange;

  // All stays in period
  const stays = await prisma.stay.findMany({
    where: {
      actualCheckIn: { gte: current.startTimestamp, lt: current.endTimestamp },
    },
    select: {
      id: true,
      primaryGuestId: true,
      actualCheckIn: true,
      actualCheckOut: true,
      expectedCheckOut: true,
    },
  });

  // Unique guest IDs
  const guestIds = [...new Set(stays.map((s) => s.primaryGuestId).filter(Boolean))] as string[];

  // Get guest details
  const guests = await prisma.guest.findMany({
    where: { id: { in: guestIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  const guestMap = new Map(guests.map((g) => [g.id, `${g.firstName} ${g.lastName}`]));

  // Count all historical stays per guest
  const guestStayCounts = await prisma.stay.groupBy({
    by: ['primaryGuestId'],
    where: {
      primaryGuestId: { in: guestIds },
    },
    _count: true,
  });

  const stayCountMap = new Map(guestStayCounts.map((s) => [s.primaryGuestId, s._count]));

  // Aggregate by guest
  const guestStats: Record<string, { name: string; stays: number; roomNights: number; lastStay: Date | null }> = {};

  for (const stay of stays) {
    const gid = stay.primaryGuestId;
    if (!gid) continue;
    if (!guestStats[gid]) {
      guestStats[gid] = {
        name: guestMap.get(gid) || 'Unknown',
        stays: 0,
        roomNights: 0,
        lastStay: null,
      };
    }
    guestStats[gid].stays++;
    const checkIn = stay.actualCheckIn;
    const checkOut = stay.actualCheckOut || stay.expectedCheckOut;
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
    guestStats[gid].roomNights += nights;
    if (!guestStats[gid].lastStay || checkIn > guestStats[gid].lastStay!) {
      guestStats[gid].lastStay = checkIn;
    }
  }

  const uniqueGuestCount = Object.keys(guestStats).length;
  const newGuests = Object.entries(stayCountMap).filter(([, count]) => count === 1).length;
  const repeatGuests = uniqueGuestCount - newGuests;

  const totalRoomNights = Object.values(guestStats).reduce((sum, g) => sum + g.roomNights, 0);
  const averageStayDuration = uniqueGuestCount > 0 ? Math.round((totalRoomNights / stays.length) * 10) / 10 : null;

  const summary: GuestReportSummary = {
    totalGuests: uniqueGuestCount,
    newGuests,
    repeatGuests,
    totalStays: stays.length,
    totalRoomNights,
    averageStayDuration,
  };

  const topGuests: GuestStaySummary[] = Object.entries(guestStats)
    .map(([guestId, data]) => ({
      guestId,
      guestName: data.name,
      stayCount: data.stays,
      roomNights: data.roomNights,
      lastStayDate: data.lastStay,
    }))
    .sort((a, b) => b.stayCount - a.stayCount)
    .slice(0, 20);

  return {
    summary,
    topGuests,
    hasData: stays.length > 0,
  };
}
