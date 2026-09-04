import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { PhysicalRoomStatus } from '@prisma/client';

export interface RoomGenerationPlan {
  prefix: string;
  startingNumber: number;
  count: number;
  roomNumbers: string[];
}

/**
 * Deterministically generates an array of room number strings based on prefix, start, and count.
 * Never uses count()+1 or non-deterministic sequences.
 */
export function generateDeterministicRoomNumbers(
  prefix: string,
  startingNumber: number,
  count: number
): string[] {
  if (count <= 0) return [];
  const cleanPrefix = prefix.trim();
  const roomNumbers: string[] = [];

  for (let i = 0; i < count; i++) {
    const num = startingNumber + i;
    roomNumbers.push(`${cleanPrefix}${num}`);
  }

  return roomNumbers;
}

export interface PreviewCollisionResult {
  roomNumbers: string[];
  existingCollisions: string[];
  hasCollisions: boolean;
}

/**
 * Checks for existing room number collisions within the target property.
 */
export async function previewRoomGenerationCollisions(
  propertyId: string,
  prefix: string,
  startingNumber: number,
  count: number,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<PreviewCollisionResult> {
  const roomNumbers = generateDeterministicRoomNumbers(prefix, startingNumber, count);

  const existing = await db.room.findMany({
    where: {
      propertyId,
      roomNumber: { in: roomNumbers },
    },
    select: { roomNumber: true },
  });

  const existingCollisions = existing.map((r) => r.roomNumber);

  return {
    roomNumbers,
    existingCollisions,
    hasCollisions: existingCollisions.length > 0,
  };
}

export interface BatchGenerationParams {
  propertyId: string;
  floorId: string;
  roomTypeId: string;
  prefix: string;
  startingNumber: number;
  count: number;
  notes?: string;
}

/**
 * Transactional batch physical room generator with strict cross-property integrity validation.
 * If any room exists or relationship is invalid, rolls back everything atomically.
 */
export async function executeBatchRoomGeneration(
  params: BatchGenerationParams,
  db: typeof prisma = prisma
): Promise<{ createdCount: number; roomNumbers: string[] }> {
  return await db.$transaction(async (tx) => {
    // 1. Cross-Property Integrity Verification:
    // Floor must exist and belong to a Building in this Property
    const floor = await tx.floor.findUnique({
      where: { id: params.floorId },
      include: { building: true },
    });

    if (!floor) {
      throw new Error('FLOOR_NOT_FOUND: The specified floor does not exist.');
    }

    if (floor.building.propertyId !== params.propertyId) {
      throw new Error('CROSS_PROPERTY_VIOLATION: The specified floor does not belong to the target property.');
    }

    // RoomType must exist
    const roomType = await tx.roomType.findUnique({
      where: { id: params.roomTypeId },
    });

    if (!roomType) {
      throw new Error('ROOM_TYPE_NOT_FOUND: The specified room type does not exist.');
    }

    // 2. Collision Detection
    const collisionCheck = await previewRoomGenerationCollisions(
      params.propertyId,
      params.prefix,
      params.startingNumber,
      params.count,
      tx
    );

    if (collisionCheck.hasCollisions) {
      throw new Error(
        `ROOM_NUMBER_ALREADY_EXISTS: Cannot generate batch. Collisions detected for room numbers: [${collisionCheck.existingCollisions.join(', ')}]. Entire batch rolled back.`
      );
    }

    // 3. Deterministic Batch Creation
    for (const roomNumber of collisionCheck.roomNumbers) {
      await tx.room.create({
        data: {
          propertyId: params.propertyId,
          floorId: params.floorId,
          roomTypeId: params.roomTypeId,
          roomNumber,
          status: PhysicalRoomStatus.AVAILABLE,
          notes: params.notes || null,
        },
      });
    }

    return {
      createdCount: collisionCheck.roomNumbers.length,
      roomNumbers: collisionCheck.roomNumbers,
    };
  });
}
