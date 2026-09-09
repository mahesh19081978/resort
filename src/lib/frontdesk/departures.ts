import { prisma } from '@/lib/db/prisma';
import { Prisma, StayStatus } from '@prisma/client';
import { getBusinessDateUtcRange } from '@/lib/dashboard/date';

/**
 * Builds the authoritative Prisma WHERE clause for Expected Departures for a given business date.
 *
 * A Stay qualifies as an Expected Departure when:
 * 1. status = ACTIVE (in-house guests pending checkout)
 * 2. expectedCheckOut falls within the target business date
 * 3. optionally scoped to property
 */
export function buildExpectedDeparturesWhere(
  businessDate: string,
  propertyId?: string
): Prisma.StayWhereInput {
  const { start, end } = getBusinessDateUtcRange(businessDate);

  return {
    status: StayStatus.ACTIVE,
    expectedCheckOut: {
      gte: start,
      lt: end,
    },
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
  };
}

/**
 * Returns the count of expected departures for the given business date.
 * Authoritative single source of truth used by the dashboard and front desk console.
 */
export async function getExpectedDeparturesCount(
  businessDate: string,
  propertyId?: string
): Promise<number> {
  const where = buildExpectedDeparturesWhere(businessDate, propertyId);
  return prisma.stay.count({ where });
}

/**
 * Returns the full Stay records for expected departures today.
 * Used by the Departures page when filtered for today's departures.
 */
export async function getExpectedDepartures(
  businessDate: string,
  propertyId?: string
) {
  const where = buildExpectedDeparturesWhere(businessDate, propertyId);

  return prisma.stay.findMany({
    where,
    include: {
      primaryGuest: true,
      roomAssignments: {
        where: { status: 'ACTIVE' },
        include: {
          room: {
            include: {
              roomType: true,
              floor: { include: { building: true } },
            },
          },
        },
      },
      folio: {
        include: {
          items: true,
          payments: true,
        },
      },
    },
    orderBy: { expectedCheckOut: 'asc' },
  });
}
