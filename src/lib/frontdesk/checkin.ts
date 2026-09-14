import { prisma } from '@/lib/db/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { PhysicalRoomStatus, StayStatus, RoomAssignmentStatus, FolioStatus, FolioItemType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface CheckInOccupantInput {
  firstName: string;
  lastName: string;
  gender: string;
  phone?: string;
  email?: string;
  idDocumentType: string;
  idDocumentNumber: string;
  documentStorageRef?: string;
  documentFileName?: string;
  documentMimeType?: string;
  documentFileSize?: number;
  isPrimary?: boolean;
}

export interface ExecuteCheckInParams {
  reservationId: string;
  roomId: string;
  expectedCheckOut: string;
  idDocumentType?: string;
  idDocumentNumber?: string;
  gender?: string;
  documentStorageRef?: string;
  documentDataBase64?: string;
  documentFileName?: string;
  documentMimeType?: string;
  documentFileSize?: number;
  photoStorageRef?: string;
  photoDataBase64?: string;
  photoMimeType?: string;
  notes?: string;
  advanceDepositAmount?: number;
  advanceDepositMethod?: string;
  advanceDepositReference?: string;
  occupants?: CheckInOccupantInput[];
}

export interface CheckInResult {
  stayId: string;
  stayNumber: string;
  roomNumber: string;
  folioId: string;
  folioNumber: string;
  guestName: string;
}

export type CheckInDatabaseClient = PrismaClient | Prisma.TransactionClient;

function hasTransaction(client: CheckInDatabaseClient): client is PrismaClient {
  return '$transaction' in client && typeof (client as PrismaClient).$transaction === 'function';
}

export async function executeCheckIn(
  params: ExecuteCheckInParams,
  actor: { id: string; name?: string; role: string },
  db: CheckInDatabaseClient = prisma
): Promise<CheckInResult> {
  const runner = async (tx: Prisma.TransactionClient): Promise<CheckInResult> => {
    // ----------------------------------------------------
    // 1. DETERMINISTIC ROW LOCKING
    // Lock Order: 1. Reservation -> 2. Physical Room
    // Both resources are locked using SELECT ... FOR UPDATE to eliminate concurrency races and deadlocks.
    // ----------------------------------------------------
    if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${params.reservationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${params.roomId} FOR UPDATE`;
    }

    // ----------------------------------------------------
    // 2. AUTHORITATIVE RESERVATION REVALIDATION
    // ----------------------------------------------------
    const reservation = await tx.reservation.findUnique({
      where: { id: params.reservationId },
      include: {
        primaryGuest: true,
        reservedRooms: {
          include: { roomType: true },
        },
        stays: {
          where: {
            status: { in: [StayStatus.ACTIVE] },
          },
        },
      },
    });

    if (!reservation) {
      throw new Error('RESERVATION_NOT_FOUND: The reservation does not exist.');
    }

    if (reservation.status === 'CANCELLED') {
      throw new Error('RESERVATION_NOT_ELIGIBLE: Cannot check in a cancelled reservation.');
    }

    if (reservation.status === 'COMPLETED') {
      throw new Error('RESERVATION_NOT_ELIGIBLE: This reservation has already been completed.');
    }

    if (reservation.status === 'EXPIRED') {
      throw new Error('RESERVATION_NOT_ELIGIBLE: Cannot check in an expired reservation.');
    }

    if (reservation.status === 'NO_SHOW') {
      throw new Error('RESERVATION_NOT_ELIGIBLE: Cannot check in a no-show reservation.');
    }

    if (reservation.stays.length > 0) {
      throw new Error('RESERVATION_ALREADY_CHECKED_IN: An active stay already exists for this reservation.');
    }

    if (!reservation.reservedRooms || reservation.reservedRooms.length === 0) {
      throw new Error('RESERVATION_HAS_NO_ROOMS: No reserved room categories found for this reservation.');
    }

    const reservedRoomType = reservation.reservedRooms[0].roomType;

    // Server-side: Derive expectedCheckOut from the authoritative reservation checkout date
    // The client-provided expectedCheckOut is IGNORED — the reservation is the source of truth
    const expectedCheckoutDate = reservation.checkOutDate;

    // ----------------------------------------------------
    // 3. PHYSICAL ROOM REVALIDATION & AVAILABILITY CHECK
    // ----------------------------------------------------
    const room = await tx.room.findUnique({
      where: { id: params.roomId },
      include: {
        assignments: {
          where: { status: RoomAssignmentStatus.ACTIVE },
          include: {
            stay: true,
          },
        },
      },
    });

    if (!room) {
      throw new Error('ROOM_NOT_FOUND: The selected physical room does not exist.');
    }

    if (!room.isActive) {
      throw new Error('ROOM_INACTIVE: The selected room is not active.');
    }

    if (room.roomTypeId !== reservedRoomType.id) {
      throw new Error(
        'ROOM_TYPE_MISMATCH: Selected room belongs to room type [' + room.roomTypeId + '], but reservation is for [' + reservedRoomType.id + '].'
      );
    }

    if (
      room.status === PhysicalRoomStatus.DIRTY ||
      room.status === PhysicalRoomStatus.CLEANING ||
      room.status === PhysicalRoomStatus.MAINTENANCE ||
      room.status === PhysicalRoomStatus.OUT_OF_ORDER
    ) {
      throw new Error(
        'ROOM_NOT_ELIGIBLE: Room [' + room.roomNumber + '] is currently ' + room.status + ' and cannot be assigned for check-in.'
      );
    }

    if (room.status === PhysicalRoomStatus.OCCUPIED || room.assignments.length > 0) {
      throw new Error(
        'ROOM_ALREADY_OCCUPIED: Room [' + room.roomNumber + '] is already occupied or has an active stay assignment.'
      );
    }

    // Scenario B: Physical room has RESERVED status
    // A RESERVED room must NOT be selectable merely because it is RESERVED.
    // It is ONLY valid if preassigned/reserved for this reservation.
    if (room.status === PhysicalRoomStatus.RESERVED) {
      const isAssignedToThisRes = await tx.roomAssignment.findFirst({
        where: {
          roomId: room.id,
          stay: { reservationId: reservation.id },
        },
      });

      const belongsToThisReservation = !!isAssignedToThisRes || (room.notes && room.notes.includes(reservation.id));

      if (!belongsToThisReservation) {
        throw new Error(
          'ROOM_RESERVED_FOR_OTHER: Room [' + room.roomNumber + '] is reserved for another guest or reservation and cannot be checked in.'
        );
      }
    }

    // ----------------------------------------------------
    // 4. OCCUPANT NORMALIZATION, VALIDATION & CAPACITY CHECK
    // ----------------------------------------------------
    let occupantsList: CheckInOccupantInput[] = [];
    if (params.occupants && params.occupants.length > 0) {
      occupantsList = params.occupants;
    } else {
      // Fallback: construct primary occupant from top-level params
      occupantsList = [
        {
          firstName: reservation.primaryGuest.firstName,
          lastName: reservation.primaryGuest.lastName,
          gender: params.gender || reservation.primaryGuest.gender || '',
          phone: reservation.primaryGuest.phone,
          email: reservation.primaryGuest.email || undefined,
          idDocumentType: params.idDocumentType || '',
          idDocumentNumber: params.idDocumentNumber || '',
          documentStorageRef: params.documentStorageRef,
          documentFileName: params.documentFileName,
          documentMimeType: params.documentMimeType,
          documentFileSize: params.documentFileSize,
          isPrimary: true,
        },
      ];
    }

    // Capacity check against RoomType.maxOccupancy
    if (occupantsList.length > reservedRoomType.maxOccupancy) {
      throw new Error(
        `MAX_OCCUPANCY_EXCEEDED: Room category [${reservedRoomType.name}] permits a maximum of ${reservedRoomType.maxOccupancy} occupant(s). Attempted check-in with ${occupantsList.length} occupant(s).`
      );
    }

    // Enforce invariant: Exactly ONE primary guest
    const primaryOccupants = occupantsList.filter((o) => o.isPrimary);
    if (primaryOccupants.length !== 1) {
      throw new Error(
        `EXACTLY_ONE_PRIMARY_REQUIRED: Exactly one occupant must be marked as PRIMARY. Found ${primaryOccupants.length}.`
      );
    }

    // Validate mandatory identity for EVERY occupant
    for (let idx = 0; idx < occupantsList.length; idx++) {
      const occ = occupantsList[idx];
      const label = occ.isPrimary ? 'Primary' : `Guest ${idx + 1}`;

      if (!occ.firstName || occ.firstName.trim().length === 0) {
        throw new Error(`OCCUPANT_VALIDATION_FAILED: ${label} first name is mandatory.`);
      }
      if (!occ.lastName || occ.lastName.trim().length === 0) {
        throw new Error(`OCCUPANT_VALIDATION_FAILED: ${label} last name is mandatory.`);
      }
      if (!occ.gender || occ.gender.trim().length === 0) {
        throw new Error(`OCCUPANT_VALIDATION_FAILED: ${label} gender is mandatory.`);
      }
      if (!occ.idDocumentType || occ.idDocumentType.trim().length === 0) {
        throw new Error(`OCCUPANT_VALIDATION_FAILED: ${label} ID document type is mandatory.`);
      }
      if (!occ.idDocumentNumber || occ.idDocumentNumber.trim().length < 3) {
        throw new Error(`OCCUPANT_VALIDATION_FAILED: ${label} valid ID document number is mandatory (min 3 characters).`);
      }
    }

    // ----------------------------------------------------
    // 5. ATOMIC STAY & ROOM ASSIGNMENT CREATION
    // ----------------------------------------------------
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const stayNumber = 'STY-' + dateStr + '-' + randSuffix;
    const folioNumber = 'FOL-' + dateStr + '-' + randSuffix;

    const stay = await tx.stay.create({
      data: {
        stayNumber,
        reservationId: reservation.id,
        primaryGuestId: reservation.primaryGuestId,
        status: StayStatus.ACTIVE,
        actualCheckIn: now,
        expectedCheckOut: expectedCheckoutDate,
        notes: params.notes || null,
      },
    });

    // Create / link Guest and StayGuest for each occupant
    for (const occ of occupantsList) {
      let guestId: string;

      if (occ.isPrimary) {
        guestId = reservation.primaryGuestId;
        // Update primary guest gender if provided
        if (occ.gender) {
          await tx.guest.update({
            where: { id: guestId },
            data: { gender: occ.gender.trim() },
          });
        }
      } else {
        // Additional occupant: find by phone if present, or create
        let foundGuest;
        if (occ.phone && occ.phone.trim().length > 0) {
          foundGuest = await tx.guest.findFirst({
            where: { phone: occ.phone.trim() },
          });
        }

        if (foundGuest) {
          guestId = foundGuest.id;
          if (occ.gender && !foundGuest.gender) {
            await tx.guest.update({
              where: { id: foundGuest.id },
              data: { gender: occ.gender.trim() },
            });
          }
        } else {
          const createdGuest = await tx.guest.create({
            data: {
              firstName: occ.firstName.trim(),
              lastName: occ.lastName.trim(),
              gender: occ.gender.trim(),
              phone: occ.phone?.trim() || '0000000000',
              email: occ.email?.trim() || null,
            },
          });
          guestId = createdGuest.id;
        }
      }

      // Record GuestDocument for occupant
      if (occ.documentStorageRef) {
        const existingDoc = await tx.guestDocument.findFirst({
          where: {
            guestId,
            fileUrl: occ.documentStorageRef,
          },
        });
        if (!existingDoc) {
          await tx.guestDocument.create({
            data: {
              guestId,
              documentType: occ.idDocumentType as any,
              documentNumber: occ.idDocumentNumber.trim(),
              fileUrl: occ.documentStorageRef,
              fileName: occ.documentFileName || `${occ.idDocumentType}_doc.pdf`,
              mimeType: occ.documentMimeType || 'application/pdf',
              fileSize: occ.documentFileSize || null,
              verificationStatus: 'VERIFIED',
              verifiedById: actor.id,
              verifiedAt: now,
              uploadedById: actor.id,
            },
          });
        }
      } else if (occ.idDocumentNumber && (tx as any).guestDocument?.create) {
        await (tx as any).guestDocument.create({
          data: {
            guestId,
            documentType: occ.idDocumentType as any,
            documentNumber: occ.idDocumentNumber.trim(),
            fileUrl: 'ref:internal-doc:' + Date.now(),
            fileName: occ.documentFileName || `${occ.idDocumentType}_doc.pdf`,
            mimeType: occ.documentMimeType || 'application/pdf',
            fileSize: occ.documentFileSize || null,
            verificationStatus: 'VERIFIED',
            verifiedById: actor.id,
            verifiedAt: now,
            uploadedById: actor.id,
          },
        });
      }

      await tx.stayGuest.create({
        data: {
          stayId: stay.id,
          guestId,
          isPrimary: !!occ.isPrimary,
          isActive: true,
        },
      });
    }

    if (params.photoStorageRef) {
      const existingPhoto = await tx.guestPhoto.findFirst({
        where: {
          guestId: reservation.primaryGuestId,
          fileUrl: params.photoStorageRef,
        },
      });

      if (!existingPhoto) {
        throw new Error(
          'INVALID_PHOTO_REFERENCE: The referenced guest photo does not exist or does not belong to the guest.'
        );
      }
    }

    await tx.roomAssignment.create({
      data: {
        stayId: stay.id,
        roomId: room.id,
        status: RoomAssignmentStatus.ACTIVE,
        assignedAt: now,
        notes: params.notes || 'Front desk check-in initial assignment',
      },
    });

    await tx.room.update({
      where: { id: room.id },
      data: {
        status: PhysicalRoomStatus.OCCUPIED,
      },
    });

    // Only transition PENDING to CONFIRMED. If already CONFIRMED, preserve state without redundant query.
    if (reservation.status === 'PENDING') {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'CONFIRMED' },
      });
    }

    // ----------------------------------------------------
    // 6. FINANCIAL MUTATIONS: ADVANCE DEPOSIT & FOLIO LINKAGE
    // Existing online advance payments remain authoritative.
    // ----------------------------------------------------
    let totalAdvancePaid = reservation.advancePaidAmount || new Prisma.Decimal(0);

    if (params.advanceDepositAmount && params.advanceDepositAmount > 0) {
      const depositAmount = new Prisma.Decimal(params.advanceDepositAmount.toFixed(2));
      const payRandSuffix = Math.floor(1000 + Math.random() * 9000);
      const paymentNumber = 'PAY-' + dateStr + '-' + payRandSuffix;
      const method = (params.advanceDepositMethod as any) || 'CASH';

      await tx.payment.create({
        data: {
          paymentNumber,
          context: 'RESERVATION_ADVANCE',
          amount: depositAmount,
          currency: 'INR',
          method,
          status: 'SUCCESS',
          transactionReference: params.advanceDepositReference || null,
          reservationId: reservation.id,
        },
      });

      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          advancePaidAmount: reservation.advancePaidAmount.plus(depositAmount),
        },
      });

      totalAdvancePaid = totalAdvancePaid.plus(depositAmount);
    }

    // ----------------------------------------------------
    // 7. PRIMARY FOLIO & OPENING ROOM CHARGE
    // ----------------------------------------------------
    const resRoom = reservation.reservedRooms[0];
    const grossCharge = resRoom.lineTotal || resRoom.ratePerNight;
    const roomTaxAmount = resRoom.taxAmount || new Prisma.Decimal(0);
    const netRoomBase = grossCharge.minus(roomTaxAmount);
    const openingBalance = grossCharge.minus(totalAdvancePaid);

    const folio = await tx.folio.create({
      data: {
        folioNumber,
        stayId: stay.id,
        status: FolioStatus.OPEN,
        totalCharges: grossCharge,
        totalCredits: totalAdvancePaid,
        totalBalance: openingBalance,
      },
    });

    // Link authoritative reservation advance payment(s) to this new primary Folio
    // This allows the checkout ledger to recognize existing advance payments without creating duplicate payments.
    if ('payment' in tx && typeof (tx as any).payment?.updateMany === 'function') {
      await (tx as any).payment.updateMany({
        where: {
          reservationId: reservation.id,
          status: 'SUCCESS',
          context: 'RESERVATION_ADVANCE',
          folioId: null,
        },
        data: {
          folioId: folio.id,
        },
      });
    }

    // FolioItem semantic: amount = unitPrice * quantity + taxAmount (always gross)
    // unitPrice stores the net per-unit base; taxAmount stores the line tax.
    await tx.folioItem.create({
      data: {
        folioId: folio.id,
        itemType: FolioItemType.ROOM_CHARGE,
        description: 'Accommodation Charge: ' + reservedRoomType.name + ' (Stay ' + stayNumber + ')',
        quantity: 1,
        unitPrice: netRoomBase,
        taxAmount: roomTaxAmount,
        amount: grossCharge,
        postedAt: now,
      },
    });

    // ----------------------------------------------------
    // 8. ATOMIC AUDIT LOGGING
    // ----------------------------------------------------
    await recordAuditEvent(
      {
        userId: actor.id,
        action: 'CHECKIN_COMPLETED',
        entity: 'Stay',
        entityId: stay.id,
        newValues: {
          stayNumber,
          reservationId: reservation.id,
          roomNumber: room.roomNumber,
          guestName: reservation.primaryGuest.firstName + ' ' + reservation.primaryGuest.lastName,
          folioNumber,
          expectedCheckOut: expectedCheckoutDate.toISOString(),
        },
      },
      tx
    );

    return {
      stayId: stay.id,
      stayNumber,
      roomNumber: room.roomNumber,
      folioId: folio.id,
      folioNumber,
      guestName: reservation.primaryGuest.firstName + ' ' + reservation.primaryGuest.lastName,
    };
  };

  // ----------------------------------------------------
  // 9. TRANSACTION EXECUTION WITH PRODUCTION TIMEOUT
  // timeout: 30000 ms, maxWait: 10000 ms
  // ----------------------------------------------------
  if (hasTransaction(db)) {
    return await db.$transaction(runner, {
      timeout: 30000,
      maxWait: 10000,
    });
  }
  return await runner(db);
}
