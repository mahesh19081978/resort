import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { PhysicalRoomStatus, StayStatus, RoomAssignmentStatus, FolioStatus, FolioItemType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface ExecuteCheckInParams {
  reservationId: string;
  roomId: string;
  expectedCheckOut: string;
  idDocumentType: string;
  idDocumentNumber: string;
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
}

export interface CheckInResult {
  stayId: string;
  stayNumber: string;
  roomNumber: string;
  folioId: string;
  folioNumber: string;
  guestName: string;
}

export async function executeCheckIn(
  params: ExecuteCheckInParams,
  actor: { id: string; name?: string; role: string },
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CheckInResult> {
  const runner = async (tx: Prisma.TransactionClient): Promise<CheckInResult> => {
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
      // Check if room is linked to this reservation via previous assignment or notes
      const reservationStays = await tx.stay.findMany({
        where: { reservationId: reservation.id },
        select: { id: true },
      });
      const reservationStayIds = reservationStays.map((s) => s.id);

      const isAssignedToThisRes = await tx.roomAssignment.findFirst({
        where: {
          roomId: room.id,
          stayId: { in: reservationStayIds },
        },
      });

      // If no assignment link found, check if notes or reference explicitly reserves it for this reservation
      const belongsToThisReservation = !!isAssignedToThisRes || (room.notes && room.notes.includes(reservation.id));

      if (!belongsToThisReservation) {
        throw new Error(
          'ROOM_RESERVED_FOR_OTHER: Room [' + room.roomNumber + '] is reserved for another guest or reservation and cannot be checked in.'
        );
      }
    }

    if (params.idDocumentNumber) {
      await tx.guestDocument.create({
        data: {
          guestId: reservation.primaryGuestId,
          documentType: params.idDocumentType as any,
          documentNumber: params.idDocumentNumber,
          fileUrl: params.documentStorageRef || ('ref:internal-doc:' + Date.now()),
          fileDataBase64: params.documentDataBase64 || null,
          fileName: params.documentFileName || (params.idDocumentType + '_doc.pdf'),
          mimeType: params.documentMimeType || 'application/pdf',
          fileSize: params.documentFileSize || null,
          verificationStatus: 'VERIFIED',
          verifiedById: actor.id,
          verifiedAt: new Date(),
          uploadedById: actor.id,
        },
      });
    }

    if (params.photoStorageRef) {
      await tx.guestPhoto.create({
        data: {
          guestId: reservation.primaryGuestId,
          fileUrl: params.photoStorageRef,
          fileDataBase64: params.photoDataBase64 || null,
          mimeType: params.photoMimeType || 'image/jpeg',
          capturedById: actor.id,
          capturedAt: new Date(),
        },
      });
    }

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

    await tx.stayGuest.create({
      data: {
        stayId: stay.id,
        guestId: reservation.primaryGuestId,
        isPrimary: true,
      },
    });

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

    if (reservation.status === 'PENDING') {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'CONFIRMED' },
      });
    }

    // Handle Advance Deposit Collection during check-in if provided
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
    }

    const resRoom = reservation.reservedRooms[0];
    const initialCharge = resRoom.lineTotal || resRoom.ratePerNight;

    const folio = await tx.folio.create({
      data: {
        folioNumber,
        stayId: stay.id,
        status: FolioStatus.OPEN,
        totalCharges: initialCharge,
        totalCredits: new Prisma.Decimal(0),
        totalBalance: initialCharge,
      },
    });

    await tx.folioItem.create({
      data: {
        folioId: folio.id,
        itemType: FolioItemType.ROOM_CHARGE,
        description: 'Accommodation Charge: ' + reservedRoomType.name + ' (Stay ' + stayNumber + ')',
        quantity: 1,
        unitPrice: initialCharge,
        taxAmount: resRoom.taxAmount || new Prisma.Decimal(0),
        amount: initialCharge,
        postedAt: now,
      },
    });

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

  if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
    return await (db as typeof prisma).$transaction(runner);
  }
  return await runner(db as Prisma.TransactionClient);
}
