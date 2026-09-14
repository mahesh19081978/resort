import { prisma } from '@/lib/db/prisma';
import { Prisma, PrismaClient, PhysicalRoomStatus, StayStatus, RoomAssignmentStatus, FolioItemType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';
import { resolveTaxForRoom } from '@/lib/db/tax';
import { calculateNights, roundCurrency } from '@/lib/booking/pricing-calculator';

export type ExtendStayDatabaseClient = PrismaClient | Prisma.TransactionClient;

function hasTransaction(client: ExtendStayDatabaseClient): client is PrismaClient {
  return '$transaction' in client && typeof (client as PrismaClient).$transaction === 'function';
}

export interface PreviewStayExtensionParams {
  stayId: string;
  newCheckoutDate: string; // YYYY-MM-DD or ISO string
}

export interface CandidateRoomOption {
  id: string;
  roomNumber: string;
  floorName: string;
  buildingName: string;
  status: PhysicalRoomStatus;
}

export interface StayExtensionPreview {
  stayId: string;
  stayNumber: string;
  currentExpectedCheckout: string;
  newExpectedCheckout: string;
  additionalNights: number;
  currentRoomId: string;
  currentRoomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  nightlyRate: string;
  additionalRoomCharge: string;
  taxRatePercent: string;
  taxCode: string;
  additionalTaxAmount: string;
  additionalGrossTotal: string;
  isSameRoomAvailable: boolean;
  availableSameTypeRooms: CandidateRoomOption[];
}

export interface ExecuteStayExtensionParams {
  stayId: string;
  newCheckoutDate: string;
  targetRoomId?: string;
  transferReason?: string;
  idempotencyKey: string;
}

export interface StayExtensionResult {
  stayId: string;
  stayNumber: string;
  oldExpectedCheckout: string;
  newExpectedCheckout: string;
  roomNumber: string;
  roomTransferred: boolean;
  oldRoomNumber?: string;
  additionalNights: number;
  additionalGrossCharge: string;
  additionalTaxAmount: string;
  folioItemId: string;
  folioId: string;
  totalFolioCharges: string;
  totalFolioBalance: string;
}

/**
 * Reuses the authoritative occupancy/availability rules from src/lib/availability/service.ts:
 * 1. Checks active stay overlaps:
 *    actualCheckIn < requestedCheckOut AND COALESCE(actualCheckOut, GREATEST(expectedCheckOut, CURRENT_DATE)) > requestedCheckIn
 *    EXCLUDING the current stay being extended.
 * 2. Checks active RoomAssignments on other stays.
 * 3. Checks physical room status (must NOT be DIRTY, CLEANING, MAINTENANCE, OUT_OF_ORDER, or INACTIVE).
 */
export async function checkPhysicalRoomAvailabilityForRange(
  roomId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeStayId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<boolean> {
  const room = await client.room.findUnique({
    where: { id: roomId },
    select: { id: true, status: true, isActive: true },
  });

  if (!room || !room.isActive) {
    return false;
  }

  // If the room is in maintenance or out of order, it is unavailable
  if (
    room.status === PhysicalRoomStatus.MAINTENANCE ||
    room.status === PhysicalRoomStatus.OUT_OF_ORDER
  ) {
    return false;
  }

  // Active stays blocking this physical room during the additional dates
  const conflictingStays = await client.$queryRaw<Array<{ id: string }>>`
    SELECT s.id
    FROM "RoomAssignment" ra
    JOIN "Stay" s ON s.id = ra."stayId"
    WHERE ra."roomId" = ${roomId}
      AND ra.status = 'ACTIVE'
      AND s.status = 'ACTIVE'
      AND s.id != ${excludeStayId}
      AND s."actualCheckIn" < ${rangeEnd}
      AND COALESCE(s."actualCheckOut", GREATEST(s."expectedCheckOut", CURRENT_DATE)) > ${rangeStart}
    LIMIT 1
  `;

  if (conflictingStays.length > 0) {
    return false;
  }

  // Also check if there's any active RoomAssignment not ended
  const conflictingAssignment = await client.roomAssignment.findFirst({
    where: {
      roomId,
      status: RoomAssignmentStatus.ACTIVE,
      stayId: { not: excludeStayId },
    },
  });

  if (conflictingAssignment) {
    return false;
  }

  return true;
}

/**
 * Finds all eligible physical rooms of the same RoomType that are unblocked across [rangeStart, rangeEnd).
 */
export async function findEligibleSameTypeRooms(
  roomTypeId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeStayId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CandidateRoomOption[]> {
  const candidateRooms = await client.room.findMany({
    where: {
      roomTypeId,
      isActive: true,
      status: {
        in: [PhysicalRoomStatus.AVAILABLE, PhysicalRoomStatus.RESERVED],
      },
      assignments: {
        none: {
          status: RoomAssignmentStatus.ACTIVE,
          stayId: { not: excludeStayId },
        },
      },
    },
    include: {
      floor: {
        include: { building: true },
      },
    },
    orderBy: [{ floor: { floorNumber: 'asc' } }, { roomNumber: 'asc' }],
  });

  const availableRooms: CandidateRoomOption[] = [];

  for (const rm of candidateRooms) {
    const isAvail = await checkPhysicalRoomAvailabilityForRange(
      rm.id,
      rangeStart,
      rangeEnd,
      excludeStayId,
      client
    );
    if (isAvail) {
      availableRooms.push({
        id: rm.id,
        roomNumber: rm.roomNumber,
        floorName: rm.floor.name,
        buildingName: rm.floor.building.name,
        status: rm.status,
      });
    }
  }

  return availableRooms;
}

/**
 * Previews stay extension: validates dates, checks physical room availability,
 * calculates additional nights, resolves tax and rate.
 */
export async function previewStayExtension(
  params: PreviewStayExtensionParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<StayExtensionPreview> {
  const stay = await client.stay.findUnique({
    where: { id: params.stayId },
    include: {
      roomAssignments: {
        where: { status: RoomAssignmentStatus.ACTIVE },
        include: {
          room: {
            include: {
              roomType: true,
            },
          },
        },
      },
      reservation: {
        include: {
          reservedRooms: {
            include: { roomType: true },
          },
        },
      },
    },
  });

  if (!stay) {
    throw new Error('STAY_NOT_FOUND: The stay record does not exist.');
  }

  if (stay.status !== StayStatus.ACTIVE) {
    throw new Error('STAY_NOT_ACTIVE: Only ACTIVE stays can be extended.');
  }

  if (!stay.roomAssignments || stay.roomAssignments.length === 0) {
    throw new Error('NO_ACTIVE_ROOM_ASSIGNMENT: No active room assignment found for this stay.');
  }

  const currentAssignment = stay.roomAssignments[0];
  const currentRoom = currentAssignment.room;
  const roomType = currentRoom.roomType;

  // Date validation:
  const currentExpectedDate = stay.expectedCheckOut;
  const currentExpectedDateStr = currentExpectedDate.toISOString().slice(0, 10);
  const newCheckoutDateObj = new Date(params.newCheckoutDate);
  const newCheckoutDateStr = newCheckoutDateObj.toISOString().slice(0, 10);

  if (isNaN(newCheckoutDateObj.getTime())) {
    throw new Error('INVALID_DATE: The requested checkout date is invalid.');
  }

  if (newCheckoutDateStr <= currentExpectedDateStr) {
    throw new Error(
      'INVALID_CHECKOUT_DATE: Extension checkout date (' +
        newCheckoutDateStr +
        ') must be strictly later than current checkout date (' +
        currentExpectedDateStr +
        ').'
    );
  }

  const additionalNights = calculateNights(currentExpectedDateStr, newCheckoutDateStr);

  // Authoritative Rate Source:
  // Use authoritative RoomType.basePrice or original reservation's rate per night if matched
  let nightlyRate = roomType.basePrice;
  if (stay.reservation?.reservedRooms && stay.reservation.reservedRooms.length > 0) {
    const resRoom = stay.reservation.reservedRooms.find((rr) => rr.roomTypeId === roomType.id);
    if (resRoom) {
      nightlyRate = resRoom.ratePerNight;
    }
  }

  const now = new Date();
  const resolvedTax = await resolveTaxForRoom(now, client);

  const additionalNetCharge = roundCurrency(nightlyRate.mul(additionalNights));
  const taxMultiplier = resolvedTax.taxRate.div(new Prisma.Decimal(100));
  const additionalTaxAmount = roundCurrency(additionalNetCharge.mul(taxMultiplier));
  const additionalGrossTotal = roundCurrency(additionalNetCharge.plus(additionalTaxAmount));

  // Check physical room availability across [currentExpectedDate, newCheckoutDateObj)
  const isSameRoomAvailable = await checkPhysicalRoomAvailabilityForRange(
    currentRoom.id,
    currentExpectedDate,
    newCheckoutDateObj,
    stay.id,
    client
  );

  let availableSameTypeRooms: CandidateRoomOption[] = [];
  if (!isSameRoomAvailable) {
    availableSameTypeRooms = await findEligibleSameTypeRooms(
      roomType.id,
      currentExpectedDate,
      newCheckoutDateObj,
      stay.id,
      client
    );
  }

  return {
    stayId: stay.id,
    stayNumber: stay.stayNumber,
    currentExpectedCheckout: currentExpectedDate.toISOString(),
    newExpectedCheckout: newCheckoutDateObj.toISOString(),
    additionalNights,
    currentRoomId: currentRoom.id,
    currentRoomNumber: currentRoom.roomNumber,
    roomTypeId: roomType.id,
    roomTypeName: roomType.name,
    nightlyRate: nightlyRate.toFixed(2),
    additionalRoomCharge: additionalNetCharge.toFixed(2),
    taxRatePercent: resolvedTax.taxRate.toFixed(2),
    taxCode: resolvedTax.taxCode,
    additionalTaxAmount: additionalTaxAmount.toFixed(2),
    additionalGrossTotal: additionalGrossTotal.toFixed(2),
    isSameRoomAvailable,
    availableSameTypeRooms,
  };
}

/**
 * Executes stay extension transactionally:
 * - Deterministic row locks: Stay -> Target Room -> Current Room -> Folio.
 * - Rechecks availability inside transaction.
 * - If transfer needed, ends old assignment, sets old room to DIRTY, assigns new room as OCCUPIED.
 * - Updates Stay.expectedCheckOut.
 * - Appends FolioItem with idempotencyKey and updates Folio totals.
 * - Generates audit logs.
 */
export async function executeStayExtension(
  params: ExecuteStayExtensionParams,
  actor: { id: string; name?: string; role: string },
  db: ExtendStayDatabaseClient = prisma
): Promise<StayExtensionResult> {
  const runner = async (tx: Prisma.TransactionClient): Promise<StayExtensionResult> => {
    // ----------------------------------------------------
    // 1. DETERMINISTIC LOCKING: Lock Stay first
    // ----------------------------------------------------
    if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "Stay" WHERE id = ${params.stayId} FOR UPDATE`;
    }

    const stay = await tx.stay.findUnique({
      where: { id: params.stayId },
      include: {
        roomAssignments: {
          where: { status: RoomAssignmentStatus.ACTIVE },
          include: {
            room: {
              include: { roomType: true },
            },
          },
        },
        reservation: {
          include: {
            reservedRooms: true,
          },
        },
        folio: true,
      },
    });

    if (!stay) {
      throw new Error('STAY_NOT_FOUND: Stay does not exist.');
    }

    if (stay.status !== StayStatus.ACTIVE) {
      throw new Error('STAY_NOT_ACTIVE: Only ACTIVE stays can be extended.');
    }

    if (!stay.roomAssignments || stay.roomAssignments.length === 0) {
      throw new Error('NO_ACTIVE_ROOM_ASSIGNMENT: No active room assignment found for this stay.');
    }

    if (!stay.folio) {
      throw new Error('FOLIO_NOT_FOUND: No primary folio exists for this stay.');
    }

    const currentAssignment = stay.roomAssignments[0];
    const currentRoom = currentAssignment.room;
    const roomType = currentRoom.roomType;

    // Date validation
    const currentExpectedDate = stay.expectedCheckOut;
    const currentExpectedDateStr = currentExpectedDate.toISOString().slice(0, 10);
    const newCheckoutDateObj = new Date(params.newCheckoutDate);
    const newCheckoutDateStr = newCheckoutDateObj.toISOString().slice(0, 10);

    if (isNaN(newCheckoutDateObj.getTime())) {
      throw new Error('INVALID_DATE: The requested checkout date is invalid.');
    }

    if (newCheckoutDateStr <= currentExpectedDateStr) {
      throw new Error(
        'INVALID_CHECKOUT_DATE: Extension checkout date (' +
          newCheckoutDateStr +
          ') must be strictly later than current checkout date (' +
          currentExpectedDateStr +
          ').'
      );
    }

    const additionalNights = calculateNights(currentExpectedDateStr, newCheckoutDateStr);

    // ----------------------------------------------------
    // 2. DETERMINISTIC LOCKING: Target Room and Current Room
    // ----------------------------------------------------
    const targetRoomId = params.targetRoomId || currentRoom.id;
    const isTransferRequested = targetRoomId !== currentRoom.id;

    if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
      if (isTransferRequested) {
        // Deterministic order by ID to prevent deadlocks
        const [firstLock, secondLock] = [targetRoomId, currentRoom.id].sort();
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${firstLock} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${secondLock} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${currentRoom.id} FOR UPDATE`;
      }
    }

    // Check same-room availability
    const isSameRoomAvailable = await checkPhysicalRoomAvailabilityForRange(
      currentRoom.id,
      currentExpectedDate,
      newCheckoutDateObj,
      stay.id,
      tx
    );

    let finalRoomId = currentRoom.id;
    let finalRoomNumber = currentRoom.roomNumber;
    let roomTransferred = false;

    if (isSameRoomAvailable) {
      if (isTransferRequested) {
        // Staff explicitly asked for transfer even though same room is free, or target room passed
        finalRoomId = targetRoomId;
      } else {
        finalRoomId = currentRoom.id;
      }
    } else {
      // Same room is NOT available. Room transfer is MANDATORY.
      if (!params.targetRoomId || params.targetRoomId === currentRoom.id) {
        // Auto-find an eligible room of the same RoomType
        const eligible = await findEligibleSameTypeRooms(
          roomType.id,
          currentExpectedDate,
          newCheckoutDateObj,
          stay.id,
          tx
        );
        if (eligible.length === 0) {
          throw new Error('No room of the same type is available for the requested extension.');
        }
        finalRoomId = eligible[0].id;
      } else {
        finalRoomId = params.targetRoomId;
      }
    }

    // Revalidate target room inside transaction
    if (finalRoomId !== currentRoom.id) {
      roomTransferred = true;
      const targetRoom = await tx.room.findUnique({
        where: { id: finalRoomId },
        include: { roomType: true },
      });

      if (!targetRoom || !targetRoom.isActive) {
        throw new Error('TARGET_ROOM_NOT_ELIGIBLE: Selected replacement room is not active or does not exist.');
      }

      if (targetRoom.roomTypeId !== roomType.id) {
        throw new Error('ROOM_TYPE_MISMATCH: Replacement room must belong to the same room type.');
      }

      const isTargetAvailable = await checkPhysicalRoomAvailabilityForRange(
        finalRoomId,
        currentExpectedDate,
        newCheckoutDateObj,
        stay.id,
        tx
      );

      if (!isTargetAvailable) {
        throw new Error('No room of the same type is available for the requested extension.');
      }

      finalRoomNumber = targetRoom.roomNumber;
    }

    // ----------------------------------------------------
    // 3. AUTHORITATIVE FINANCIALS
    // ----------------------------------------------------
    let nightlyRate = roomType.basePrice;
    if (stay.reservation?.reservedRooms && stay.reservation.reservedRooms.length > 0) {
      const resRoom = stay.reservation.reservedRooms.find((rr) => rr.roomTypeId === roomType.id);
      if (resRoom) {
        nightlyRate = resRoom.ratePerNight;
      }
    }

    const now = new Date();
    const resolvedTax = await resolveTaxForRoom(now, tx);

    const additionalNetCharge = roundCurrency(nightlyRate.mul(additionalNights));
    const taxMultiplier = resolvedTax.taxRate.div(new Prisma.Decimal(100));
    const additionalTaxAmount = roundCurrency(additionalNetCharge.mul(taxMultiplier));
    const additionalGrossTotal = roundCurrency(additionalNetCharge.plus(additionalTaxAmount));

    // ----------------------------------------------------
    // 4. IDEMPOTENCY CHECK ON FOLIO ITEM
    // ----------------------------------------------------
    const existingFolioItem = await tx.folioItem.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });

    if (existingFolioItem) {
      if (
        existingFolioItem.folioId !== stay.folio.id ||
        !existingFolioItem.amount.equals(additionalGrossTotal)
      ) {
        throw new Error(
          `IDEMPOTENCY_KEY_REUSE_CONFLICT: Idempotency key '${params.idempotencyKey}' was previously used for a materially different charge.`
        );
      }
      // Replay existing result
      return {
        stayId: stay.id,
        stayNumber: stay.stayNumber,
        oldExpectedCheckout: currentExpectedDate.toISOString(),
        newExpectedCheckout: stay.expectedCheckOut.toISOString(),
        roomNumber: currentRoom.roomNumber,
        roomTransferred: false,
        additionalNights,
        additionalGrossCharge: existingFolioItem.amount.toFixed(2),
        additionalTaxAmount: existingFolioItem.taxAmount.toFixed(2),
        folioItemId: existingFolioItem.id,
        folioId: stay.folio.id,
        totalFolioCharges: stay.folio.totalCharges.toFixed(2),
        totalFolioBalance: stay.folio.totalBalance.toFixed(2),
      };
    }

    // ----------------------------------------------------
    // 5. UPDATE STAY EXPECTED CHECKOUT
    // ----------------------------------------------------
    await tx.stay.update({
      where: { id: stay.id },
      data: {
        expectedCheckOut: newCheckoutDateObj,
      },
    });

    // Also synchronize reservation checkOutDate if linked, preserving commercial history
    if (stay.reservationId) {
      await tx.reservation.update({
        where: { id: stay.reservationId },
        data: { checkOutDate: newCheckoutDateObj },
      });
    }

    // ----------------------------------------------------
    // 6. ROOM OCCUPANCY / TRANSFER TRANSITIONS
    // ----------------------------------------------------
    if (roomTransferred) {
      // Close old RoomAssignment
      await tx.roomAssignment.update({
        where: { id: currentAssignment.id },
        data: {
          status: RoomAssignmentStatus.TRANSFERRED,
          releasedAt: now,
          notes: params.transferReason || 'Room transferred due to stay extension',
        },
      });

      // Transition old room to DIRTY according to existing room-operation workflow
      await tx.room.update({
        where: { id: currentRoom.id },
        data: { status: PhysicalRoomStatus.DIRTY },
      });

      // Create new RoomAssignment
      await tx.roomAssignment.create({
        data: {
          stayId: stay.id,
          roomId: finalRoomId,
          status: RoomAssignmentStatus.ACTIVE,
          assignedAt: now,
          notes: params.transferReason || 'Transferred assignment for stay extension',
        },
      });

      // Transition new room to OCCUPIED
      await tx.room.update({
        where: { id: finalRoomId },
        data: { status: PhysicalRoomStatus.OCCUPIED },
      });
    }

    // ----------------------------------------------------
    // 7. POST ADDITIONAL CHARGE TO FOLIO (WITH FOLIO ROW LOCK)
    // ----------------------------------------------------
    const folio = stay.folio;

    const lockedRows = await tx.$queryRaw<
      { id: string; totalCharges: unknown; totalBalance: unknown }[]
    >`SELECT "id", "totalCharges", "totalBalance" FROM "Folio" WHERE "id" = ${folio.id} FOR UPDATE`;

    if (!lockedRows || lockedRows.length === 0) {
      throw new Error('FOLIO_NOT_FOUND: Folio disappeared during lock acquisition.');
    }

    const lockedFolio = lockedRows[0];
    const currentTotalCharges = new Prisma.Decimal(String(lockedFolio.totalCharges));
    const currentTotalBalance = new Prisma.Decimal(String(lockedFolio.totalBalance));

    const newCharges = currentTotalCharges.plus(additionalGrossTotal);
    const newBalance = currentTotalBalance.plus(additionalGrossTotal);

    const folioItem = await tx.folioItem.create({
      data: {
        folioId: folio.id,
        itemType: FolioItemType.ROOM_CHARGE,
        description: `Stay Extension: ${additionalNights} additional night(s) in ${roomType.name} (Stay ${stay.stayNumber})`,
        quantity: additionalNights,
        unitPrice: nightlyRate,
        taxAmount: additionalTaxAmount,
        amount: additionalGrossTotal,
        idempotencyKey: params.idempotencyKey,
        postedAt: now,
      },
    });

    await tx.folio.update({
      where: { id: folio.id },
      data: {
        totalCharges: newCharges,
        totalBalance: newBalance,
      },
    });

    // ----------------------------------------------------
    // 8. AUDIT LOGGING
    // ----------------------------------------------------
    await recordAuditEvent(
      {
        userId: actor.id,
        action: 'STAY_EXTENDED',
        entity: 'Stay',
        entityId: stay.id,
        newValues: {
          stayNumber: stay.stayNumber,
          oldCheckout: currentExpectedDate.toISOString(),
          newCheckout: newCheckoutDateObj.toISOString(),
          additionalNights,
          additionalGrossCharge: additionalGrossTotal.toString(),
          additionalTaxAmount: additionalTaxAmount.toString(),
          roomTransferred,
          currentRoom: currentRoom.roomNumber,
          finalRoom: finalRoomNumber,
          reason: params.transferReason || 'Guest requested extension',
        },
      },
      tx
    );

    if (roomTransferred) {
      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'ROOM_TRANSFERRED_FOR_STAY_EXTENSION',
          entity: 'RoomAssignment',
          entityId: currentAssignment.id,
          newValues: {
            stayId: stay.id,
            oldRoomId: currentRoom.id,
            oldRoomNumber: currentRoom.roomNumber,
            newRoomId: finalRoomId,
            newRoomNumber: finalRoomNumber,
            reason: params.transferReason || 'Current room unavailable for requested extension',
          },
        },
        tx
      );
    }

    return {
      stayId: stay.id,
      stayNumber: stay.stayNumber,
      oldExpectedCheckout: currentExpectedDate.toISOString(),
      newExpectedCheckout: newCheckoutDateObj.toISOString(),
      roomNumber: finalRoomNumber,
      roomTransferred,
      oldRoomNumber: roomTransferred ? currentRoom.roomNumber : undefined,
      additionalNights,
      additionalGrossCharge: additionalGrossTotal.toFixed(2),
      additionalTaxAmount: additionalTaxAmount.toFixed(2),
      folioItemId: folioItem.id,
      folioId: folio.id,
      totalFolioCharges: newCharges.toFixed(2),
      totalFolioBalance: newBalance.toFixed(2),
    };
  };

  if (hasTransaction(db)) {
    return await db.$transaction(runner, {
      timeout: 30000,
      maxWait: 10000,
    });
  }
  return await runner(db);
}
