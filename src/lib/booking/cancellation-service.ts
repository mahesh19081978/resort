import { prisma } from '@/lib/db/prisma';
import { Prisma, PrismaClient, CancellationFeeType, CancellationPolicy } from '@prisma/client';

export type CancellationClient = PrismaClient | Prisma.TransactionClient;

/**
 * Deterministically resolves applicable CancellationPolicy for a given rate plan.
 * 
 * Rules:
 * 1. Rate-plan-specific policy:
 *    - 1 match -> use
 *    - >1 match -> throw CANCELLATION_POLICY_AMBIGUOUS
 *    - 0 match -> check default
 * 2. Default policy (ratePlanId is null, isDefault is true):
 *    - 1 match -> use
 *    - >1 match -> throw CANCELLATION_DEFAULT_POLICY_AMBIGUOUS
 *    - 0 match -> return null (no fee applies)
 */
export async function resolveCancellationPolicy(
  ratePlanId: string | null = null,
  atTime: Date = new Date(),
  client: CancellationClient = prisma
): Promise<CancellationPolicy | null> {
  // Step 1: Rate-plan specific policy
  if (ratePlanId) {
    const planMatches = await client.cancellationPolicy.findMany({
      where: {
        ratePlanId,
        isActive: true,
        AND: [
          {
            OR: [
              { effectiveFrom: null },
              { effectiveFrom: { lte: atTime } },
            ],
          },
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: atTime } },
            ],
          },
        ],
      },
    });

    if (planMatches.length === 1) {
      return planMatches[0];
    }
    if (planMatches.length > 1) {
      const codes = planMatches.map((p) => p.code).join(', ');
      throw new Error(
        `CANCELLATION_POLICY_AMBIGUOUS: Multiple active cancellation policies [${codes}] found for rate plan '${ratePlanId}'. Resolve ambiguity in settings.`
      );
    }
  }

  // Step 2: Global default policy
  const defaultMatches = await client.cancellationPolicy.findMany({
    where: {
      ratePlanId: null,
      isDefault: true,
      isActive: true,
      AND: [
        {
          OR: [
            { effectiveFrom: null },
            { effectiveFrom: { lte: atTime } },
          ],
        },
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: atTime } },
          ],
        },
      ],
    },
  });

  if (defaultMatches.length === 1) {
    return defaultMatches[0];
  }
  if (defaultMatches.length > 1) {
    const codes = defaultMatches.map((p) => p.code).join(', ');
    throw new Error(
      `CANCELLATION_DEFAULT_POLICY_AMBIGUOUS: Multiple active default cancellation policies [${codes}] found. Exactly one active default is permitted.`
    );
  }

  return null;
}

/**
 * Snapshots the applicable cancellation policy to all ReservationRoom rows
 * when a Reservation transitions to CONFIRMED.
 * 
 * Must be called inside the confirmation transaction.
 */
export async function snapshotCancellationPolicyForReservation(
  reservationId: string,
  tx: Prisma.TransactionClient,
  atTime: Date = new Date()
): Promise<void> {
  const rooms = await tx.reservationRoom.findMany({
    where: { reservationId },
  });

  for (const room of rooms) {
    const policy = await resolveCancellationPolicy(room.ratePlanId, atTime, tx);
    if (policy) {
      await tx.reservationRoom.update({
        where: { id: room.id },
        data: {
          cancellationPolicyId: policy.id,
          cancellationPolicyCode: policy.code,
          cancellationFeeType: policy.feeType,
          cancellationFeeValue: policy.feeValue,
          cancellationMaxFeeAmount: policy.maxFeeAmount,
          cancellationMinFeeAmount: policy.minFeeAmount,
          cancellationHoursBeforeCheckIn: policy.hoursBeforeCheckIn,
          cancellationPolicySnapshotAt: atTime,
        },
      });
    } else {
      await tx.reservationRoom.update({
        where: { id: room.id },
        data: {
          cancellationPolicyId: null,
          cancellationPolicyCode: null,
          cancellationFeeType: null,
          cancellationFeeValue: null,
          cancellationMaxFeeAmount: null,
          cancellationMinFeeAmount: null,
          cancellationHoursBeforeCheckIn: null,
          cancellationPolicySnapshotAt: atTime,
        },
      });
    }
  }
}

export interface RoomSnapshotForFeeCalculation {
  cancellationFeeType: CancellationFeeType | null;
  cancellationFeeValue: Prisma.Decimal | null;
  cancellationMaxFeeAmount?: Prisma.Decimal | null;
  cancellationMinFeeAmount?: Prisma.Decimal | null;
  cancellationHoursBeforeCheckIn?: number | null;
  lineTotal: Prisma.Decimal;
  ratePerNight: Prisma.Decimal;
}

/**
 * Calculates cancellation fee strictly from stored snapshot columns.
 * Never queries live CancellationPolicy table.
 */
export function calculateRoomCancellationFee(
  snapshot: RoomSnapshotForFeeCalculation,
  checkInDate: Date,
  cancellationTime: Date = new Date()
): Prisma.Decimal {
  if (!snapshot.cancellationFeeType || !snapshot.cancellationFeeValue) {
    return new Prisma.Decimal(0);
  }

  // Check window if hoursBeforeCheckIn is set
  if (snapshot.cancellationHoursBeforeCheckIn != null && snapshot.cancellationHoursBeforeCheckIn > 0) {
    const checkInMs = checkInDate.getTime();
    const cancelMs = cancellationTime.getTime();
    const diffHours = (checkInMs - cancelMs) / (1000 * 60 * 60);

    // If cancelled before the window, fee is 0 (e.g. cancelled 48h before with a 24h window)
    if (diffHours > snapshot.cancellationHoursBeforeCheckIn) {
      return new Prisma.Decimal(0);
    }
  }

  let calculatedFee = new Prisma.Decimal(0);

  switch (snapshot.cancellationFeeType) {
    case CancellationFeeType.PERCENTAGE:
      calculatedFee = snapshot.lineTotal
        .mul(snapshot.cancellationFeeValue)
        .div(new Prisma.Decimal(100));
      break;
    case CancellationFeeType.FIXED_AMOUNT:
      calculatedFee = snapshot.cancellationFeeValue;
      break;
    case CancellationFeeType.FIRST_NIGHT:
      calculatedFee = snapshot.ratePerNight;
      break;
    case CancellationFeeType.FULL_BOOKING:
      calculatedFee = snapshot.lineTotal;
      break;
  }

  // Apply optional floor
  if (snapshot.cancellationMinFeeAmount && calculatedFee.lt(snapshot.cancellationMinFeeAmount)) {
    calculatedFee = snapshot.cancellationMinFeeAmount;
  }

  // Apply optional cap
  if (snapshot.cancellationMaxFeeAmount && calculatedFee.gt(snapshot.cancellationMaxFeeAmount)) {
    calculatedFee = snapshot.cancellationMaxFeeAmount;
  }

  // Fee cannot exceed line total
  if (calculatedFee.gt(snapshot.lineTotal)) {
    calculatedFee = snapshot.lineTotal;
  }

  return calculatedFee.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
}
