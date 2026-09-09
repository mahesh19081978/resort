import { prisma } from '@/lib/db/prisma';
import { StayStatus } from '@prisma/client';
import { getExpectedArrivalsCount } from '@/lib/frontdesk/arrivals';
import { getExpectedDeparturesCount } from '@/lib/frontdesk/departures';
import { getBusinessDateNow, getBusinessDayTimestampRange } from './date';

export interface FrontDeskMetrics {
  businessDate: string;
  expectedArrivalsToday: number;
  inHouseStays: number;
  expectedDeparturesToday: number;
  todayCheckInsCount: number;
}

/**
 * Authoritative Front Desk operations metrics.
 * Reuses identical domain logic from arrivals and departures services.
 */
export async function getFrontDeskMetrics(
  businessDate: string = getBusinessDateNow(),
  propertyId?: string
): Promise<FrontDeskMetrics> {
  const { start, end } = getBusinessDayTimestampRange(businessDate);

  const [
    expectedArrivalsToday,
    expectedDeparturesToday,
    inHouseStays,
    todayCheckInsCount,
  ] = await Promise.all([
    getExpectedArrivalsCount(businessDate),
    getExpectedDeparturesCount(businessDate, propertyId),
    prisma.stay.count({
      where: {
        status: StayStatus.ACTIVE,
        ...(propertyId
          ? {
              roomAssignments: {
                some: {
                  status: 'ACTIVE',
                  room: { propertyId },
                },
              },
            }
          : {}),
      },
    }),
    prisma.stay.count({
      where: {
        actualCheckIn: {
          gte: start,
          lt: end,
        },
        ...(propertyId
          ? {
              roomAssignments: {
                some: { room: { propertyId } },
              },
            }
          : {}),
      },
    }),
  ]);

  return {
    businessDate,
    expectedArrivalsToday,
    inHouseStays,
    expectedDeparturesToday,
    todayCheckInsCount,
  };
}
