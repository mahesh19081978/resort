import { prisma } from '@/lib/db/prisma';
import { Prisma, PrismaClient, IdDocumentType, RoomAssignmentStatus, StayStatus } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export type OccupantDatabaseClient = PrismaClient | Prisma.TransactionClient;

function hasTransaction(client: OccupantDatabaseClient): client is PrismaClient {
  return '$transaction' in client && typeof (client as PrismaClient).$transaction === 'function';
}

export interface OccupantData {
  firstName: string;
  lastName: string;
  gender: string;
  phone?: string;
  email?: string;
  idDocumentType: IdDocumentType | string;
  idDocumentNumber: string;
  documentStorageRef?: string;
  documentFileName?: string;
  documentMimeType?: string;
  documentFileSize?: number;
  isPrimary?: boolean;
}

export interface AddOccupantParams {
  stayId: string;
  occupant: OccupantData;
}

export interface RemoveOccupantParams {
  stayId: string;
  stayGuestId: string;
  reason: string;
}

export interface TransferPrimaryParams {
  stayId: string;
  newPrimaryGuestId?: string;
  newPrimaryStayGuestId?: string;
  reason?: string;
}

/**
 * Validates mandatory occupant identity fields:
 * - Non-empty first and last names
 * - Mandatory gender (must not be empty)
 * - Mandatory ID document type and number (at least 3 chars)
 */
export function validateOccupantIdentity(occupant: OccupantData, indexLabel?: string): void {
  const prefix = indexLabel ? `Occupant (${indexLabel}): ` : '';

  if (!occupant.firstName || occupant.firstName.trim().length === 0) {
    throw new Error(`${prefix}First name is mandatory.`);
  }

  if (!occupant.lastName || occupant.lastName.trim().length === 0) {
    throw new Error(`${prefix}Last name is mandatory.`);
  }

  if (!occupant.gender || occupant.gender.trim().length === 0) {
    throw new Error(`${prefix}Gender is mandatory.`);
  }

  if (!occupant.idDocumentType) {
    throw new Error(`${prefix}ID document type is mandatory.`);
  }

  if (!occupant.idDocumentNumber || occupant.idDocumentNumber.trim().length < 3) {
    throw new Error(`${prefix}Valid ID document number is mandatory (min 3 characters).`);
  }
}

/**
 * Atomically adds an additional occupant to an active Stay:
 * - Locks Stay and Room.
 * - Counts active StayGuests (isActive = true).
 * - Enforces roomType.maxOccupancy.
 * - Validates mandatory identity data (name, gender, ID).
 * - Creates/finds Guest, records GuestDocument, creates StayGuest(isPrimary = false, isActive = true).
 * - Generates audit log.
 */
export async function addOccupantToStay(
  params: AddOccupantParams,
  actor: { id: string; name?: string; role: string },
  db: OccupantDatabaseClient = prisma
) {
  const runner = async (tx: Prisma.TransactionClient) => {
    // 1. Lock Stay
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
        stayGuests: {
          where: { isActive: true },
        },
      },
    });

    if (!stay) {
      throw new Error('STAY_NOT_FOUND: Stay does not exist.');
    }

    if (stay.status !== StayStatus.ACTIVE) {
      throw new Error('STAY_NOT_ACTIVE: Can only add occupants to an ACTIVE stay.');
    }

    if (!stay.roomAssignments || stay.roomAssignments.length === 0) {
      throw new Error('NO_ACTIVE_ROOM_ASSIGNMENT: No active room assignment found for this stay.');
    }

    const room = stay.roomAssignments[0].room;
    const roomType = room.roomType;

    // 2. Enforce RoomType.maxOccupancy against active occupants
    const currentOccupantsCount = stay.stayGuests.length;
    if (currentOccupantsCount + 1 > roomType.maxOccupancy) {
      throw new Error(
        `MAX_OCCUPANCY_EXCEEDED: Room category [${roomType.name}] permits a maximum of ${roomType.maxOccupancy} occupant(s). Current active occupants: ${currentOccupantsCount}.`
      );
    }

    // 3. Validate mandatory identity
    validateOccupantIdentity(params.occupant);

    // 4. Create or reuse Guest
    let guest;
    if (params.occupant.phone && params.occupant.phone.trim().length > 0) {
      guest = await tx.guest.findFirst({
        where: { phone: params.occupant.phone.trim() },
      });
    }

    if (!guest) {
      guest = await tx.guest.create({
        data: {
          firstName: params.occupant.firstName.trim(),
          lastName: params.occupant.lastName.trim(),
          gender: params.occupant.gender.trim(),
          phone: params.occupant.phone?.trim() || '0000000000',
          email: params.occupant.email?.trim() || null,
        },
      });
    } else {
      // Update gender if not set
      if (!guest.gender && params.occupant.gender) {
        await tx.guest.update({
          where: { id: guest.id },
          data: { gender: params.occupant.gender.trim() },
        });
      }
    }

    // Check if guest is already an active occupant in this stay
    const existingStayGuest = await tx.stayGuest.findUnique({
      where: {
        stayId_guestId: {
          stayId: stay.id,
          guestId: guest.id,
        },
      },
    });

    if (existingStayGuest && existingStayGuest.isActive) {
      throw new Error('GUEST_ALREADY_OCCUPANT: This guest is already registered as an active occupant in this stay.');
    }

    // 5. Create GuestDocument
    if (params.occupant.documentStorageRef) {
      const existingDoc = await tx.guestDocument.findFirst({
        where: {
          guestId: guest.id,
          fileUrl: params.occupant.documentStorageRef,
        },
      });
      if (!existingDoc) {
        await tx.guestDocument.create({
          data: {
            guestId: guest.id,
            documentType: params.occupant.idDocumentType as IdDocumentType,
            documentNumber: params.occupant.idDocumentNumber.trim(),
            fileUrl: params.occupant.documentStorageRef,
            fileName: params.occupant.documentFileName || `${params.occupant.idDocumentType}_doc.pdf`,
            mimeType: params.occupant.documentMimeType || 'application/pdf',
            fileSize: params.occupant.documentFileSize || null,
            verificationStatus: 'VERIFIED',
            verifiedById: actor.id,
            verifiedAt: new Date(),
            uploadedById: actor.id,
          },
        });
      }
    } else if (params.occupant.idDocumentNumber) {
      await tx.guestDocument.create({
        data: {
          guestId: guest.id,
          documentType: params.occupant.idDocumentType as IdDocumentType,
          documentNumber: params.occupant.idDocumentNumber.trim(),
          fileUrl: 'ref:internal-doc:' + Date.now(),
          fileName: params.occupant.documentFileName || `${params.occupant.idDocumentType}_doc.pdf`,
          mimeType: params.occupant.documentMimeType || 'application/pdf',
          fileSize: params.occupant.documentFileSize || null,
          verificationStatus: 'VERIFIED',
          verifiedById: actor.id,
          verifiedAt: new Date(),
          uploadedById: actor.id,
        },
      });
    }

    // 6. Create or reactivate StayGuest (non-primary)
    let stayGuest;
    if (existingStayGuest) {
      stayGuest = await tx.stayGuest.update({
        where: { id: existingStayGuest.id },
        data: {
          isActive: true,
          isPrimary: false,
          leftAt: null,
          removedReason: null,
        },
      });
    } else {
      stayGuest = await tx.stayGuest.create({
        data: {
          stayId: stay.id,
          guestId: guest.id,
          isPrimary: false,
          isActive: true,
        },
      });
    }

    // 7. Audit Log
    await recordAuditEvent(
      {
        userId: actor.id,
        action: 'GUEST_ADDED_TO_STAY',
        entity: 'StayGuest',
        entityId: stayGuest.id,
        newValues: {
          stayId: stay.id,
          stayNumber: stay.stayNumber,
          guestId: guest.id,
          guestName: `${guest.firstName} ${guest.lastName}`,
          gender: params.occupant.gender,
          idDocumentType: params.occupant.idDocumentType,
          roomNumber: room.roomNumber,
        },
      },
      tx
    );

    return {
      stayGuestId: stayGuest.id,
      stayId: stay.id,
      guestId: guest.id,
      guestName: `${guest.firstName} ${guest.lastName}`,
      gender: params.occupant.gender,
      isPrimary: false,
      isActive: true,
      totalActiveOccupants: currentOccupantsCount + 1,
    };
  };

  if (hasTransaction(db)) {
    return await db.$transaction(runner, { timeout: 30000, maxWait: 10000 });
  }
  return await runner(db);
}

/**
 * Removes an occupant from a stay without hard-deleting the historical record:
 * - Uses stayGuestId to identify the stay-occupant relationship.
 * - Forbids deactivating the primary guest (must transfer primary first).
 * - Sets isActive = false, leftAt = now(), removedReason = reason.
 * - Audits GUEST_REMOVED_FROM_STAY.
 */
export async function removeOccupantFromStay(
  params: RemoveOccupantParams,
  actor: { id: string; name?: string; role: string },
  db: OccupantDatabaseClient = prisma
) {
  const runner = async (tx: Prisma.TransactionClient) => {
    // 1. Lock Stay
    if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "Stay" WHERE id = ${params.stayId} FOR UPDATE`;
    }

    const stayGuest = await tx.stayGuest.findUnique({
      where: { id: params.stayGuestId },
      include: {
        guest: true,
        stay: true,
      },
    });

    if (!stayGuest || stayGuest.stayId !== params.stayId) {
      throw new Error('STAY_GUEST_NOT_FOUND: Occupant record not found for this stay.');
    }

    if (!stayGuest.isActive) {
      throw new Error('OCCUPANT_ALREADY_INACTIVE: This occupant is already inactive.');
    }

    if (stayGuest.isPrimary) {
      throw new Error(
        'CANNOT_REMOVE_PRIMARY_GUEST: Cannot remove the primary guest while active. You must transfer the primary role to another active occupant before deactivating this guest.'
      );
    }

    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error('REMOVAL_REASON_REQUIRED: A valid reason is required to remove an occupant.');
    }

    const now = new Date();
    const updated = await tx.stayGuest.update({
      where: { id: stayGuest.id },
      data: {
        isActive: false,
        leftAt: now,
        removedReason: params.reason.trim(),
      },
    });

    await recordAuditEvent(
      {
        userId: actor.id,
        action: 'GUEST_REMOVED_FROM_STAY',
        entity: 'StayGuest',
        entityId: stayGuest.id,
        newValues: {
          stayId: stayGuest.stayId,
          stayNumber: stayGuest.stay.stayNumber,
          guestId: stayGuest.guestId,
          guestName: `${stayGuest.guest.firstName} ${stayGuest.guest.lastName}`,
          reason: params.reason.trim(),
          leftAt: now.toISOString(),
        },
      },
      tx
    );

    return {
      stayGuestId: updated.id,
      stayId: updated.stayId,
      guestId: updated.guestId,
      isActive: false,
      leftAt: updated.leftAt,
    };
  };

  if (hasTransaction(db)) {
    return await db.$transaction(runner, { timeout: 30000, maxWait: 10000 });
  }
  return await runner(db);
}

/**
 * Transfers the PRIMARY role to another active occupant:
 * - Demotes existing primary: isPrimary = false.
 * - Promotes new primary: isPrimary = true.
 * - Updates Stay.primaryGuestId = newPrimaryGuestId.
 * - Preserves exactly one primary invariant.
 * - Audits STAY_PRIMARY_GUEST_TRANSFERRED.
 */
export async function transferPrimaryGuest(
  params: TransferPrimaryParams,
  actor: { id: string; name?: string; role: string },
  db: OccupantDatabaseClient = prisma
) {
  const runner = async (tx: Prisma.TransactionClient) => {
    // 1. Lock Stay
    if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "Stay" WHERE id = ${params.stayId} FOR UPDATE`;
    }

    const stay = await tx.stay.findUnique({
      where: { id: params.stayId },
      include: {
        stayGuests: {
          where: { isActive: true },
          include: { guest: true },
        },
      },
    });

    if (!stay) {
      throw new Error('STAY_NOT_FOUND: Stay does not exist.');
    }

    if (stay.status !== StayStatus.ACTIVE) {
      throw new Error('STAY_NOT_ACTIVE: Can only transfer primary on an ACTIVE stay.');
    }

    const currentPrimary = stay.stayGuests.find((sg) => sg.isPrimary);
    const targetOccupant = stay.stayGuests.find(
      (sg) =>
        (params.newPrimaryStayGuestId && sg.id === params.newPrimaryStayGuestId) ||
        (params.newPrimaryGuestId && sg.guestId === params.newPrimaryGuestId)
    );

    if (!targetOccupant) {
      throw new Error(
        'TARGET_OCCUPANT_NOT_FOUND: The target guest is not an active occupant of this stay.'
      );
    }

    if (targetOccupant.isPrimary) {
      // Already primary, no change needed
      return { stayId: stay.id, primaryGuestId: targetOccupant.guestId };
    }

    // Demote current primary if exists
    if (currentPrimary) {
      await tx.stayGuest.update({
        where: { id: currentPrimary.id },
        data: { isPrimary: false },
      });
    }

    // Promote new primary
    await tx.stayGuest.update({
      where: { id: targetOccupant.id },
      data: { isPrimary: true },
    });

    // Update Stay.primaryGuestId
    await tx.stay.update({
      where: { id: stay.id },
      data: { primaryGuestId: targetOccupant.guestId },
    });

    await recordAuditEvent(
      {
        userId: actor.id,
        action: 'STAY_PRIMARY_GUEST_TRANSFERRED',
        entity: 'Stay',
        entityId: stay.id,
        newValues: {
          stayId: stay.id,
          stayNumber: stay.stayNumber,
          oldPrimaryGuestId: currentPrimary?.guestId,
          newPrimaryGuestId: targetOccupant.guestId,
          newPrimaryGuestName: `${targetOccupant.guest.firstName} ${targetOccupant.guest.lastName}`,
        },
      },
      tx
    );

    return {
      stayId: stay.id,
      primaryGuestId: targetOccupant.guestId,
      primaryGuestName: `${targetOccupant.guest.firstName} ${targetOccupant.guest.lastName}`,
    };
  };

  if (hasTransaction(db)) {
    return await db.$transaction(runner, { timeout: 30000, maxWait: 10000 });
  }
  return await runner(db);
}
