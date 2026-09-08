'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';
import {
  checkInSchema,
  checkOutSchema,
  guestDocumentUploadSchema,
  guestPhotoUploadSchema,
  folioChargeSchema,
  guestDocumentVerifySchema,
} from '@/validations/frontdesk';
import { executeCheckIn, CheckInResult } from '@/lib/frontdesk/checkin';
import { executeCheckOut, CheckOutResult } from '@/lib/frontdesk/checkout';
import { getEligibleRoomsForCheckIn } from '@/lib/frontdesk/eligibility';
import { FolioItemType, Prisma } from '@prisma/client';
import crypto from 'crypto';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ----------------------------------------------------
// 1. ELIGIBLE ROOMS QUERY
// Permission: 'checkin:perform'
// ----------------------------------------------------
export async function getEligibleRoomsAction(
  propertyId: string,
  roomTypeId: string
): Promise<ActionResponse> {
  try {
    await requirePermission('checkin:perform');
    const rooms = await getEligibleRoomsForCheckIn(propertyId, roomTypeId, undefined, prisma);
    return { success: true, data: rooms };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch eligible rooms',
    };
  }
}

// ----------------------------------------------------
// 2. CHECK-IN ACTION
// Permission: 'checkin:perform'
// ----------------------------------------------------
export async function checkInAction(
  prevState: ActionResponse<CheckInResult> | null,
  formData: FormData
): Promise<ActionResponse<CheckInResult>> {
  try {
    const user = await requirePermission('checkin:perform');

    const raw = {
      reservationId: formData.get('reservationId')?.toString() || '',
      roomId: formData.get('roomId')?.toString() || '',
      expectedCheckOut: formData.get('expectedCheckOut')?.toString() || '',
      idDocumentType: formData.get('idDocumentType')?.toString() || '',
      idDocumentNumber: formData.get('idDocumentNumber')?.toString() || '',
      documentStorageRef: formData.get('documentStorageRef')?.toString() || undefined,
      documentDataBase64: formData.get('documentDataBase64')?.toString() || undefined,
      documentFileName: formData.get('documentFileName')?.toString() || undefined,
      documentMimeType: formData.get('documentMimeType')?.toString() || undefined,
      documentFileSize: formData.get('documentFileSize') ? Number(formData.get('documentFileSize')) : undefined,
      photoStorageRef: formData.get('photoStorageRef')?.toString() || undefined,
      photoDataBase64: formData.get('photoDataBase64')?.toString() || undefined,
      photoMimeType: formData.get('photoMimeType')?.toString() || undefined,
      notes: formData.get('notes')?.toString() || undefined,
      advanceDepositAmount: formData.get('advanceDepositAmount')
        ? Number(formData.get('advanceDepositAmount'))
        : undefined,
      advanceDepositMethod: formData.get('advanceDepositMethod')?.toString() || undefined,
      advanceDepositReference: formData.get('advanceDepositReference')?.toString() || undefined,
    };

    const parsed = checkInSchema.safeParse({
      reservationId: raw.reservationId,
      roomId: raw.roomId,
      expectedCheckOut: raw.expectedCheckOut,
      idDocumentType: raw.idDocumentType,
      idDocumentNumber: raw.idDocumentNumber,
      documentStorageRef: raw.documentStorageRef,
      documentFileName: raw.documentFileName,
      documentMimeType: raw.documentMimeType,
      documentFileSize: raw.documentFileSize,
      photoStorageRef: raw.photoStorageRef,
      notes: raw.notes,
      advanceDepositAmount: raw.advanceDepositAmount,
      advanceDepositMethod: raw.advanceDepositMethod,
      advanceDepositReference: raw.advanceDepositReference,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await executeCheckIn(
      {
        ...parsed.data,
        documentDataBase64: raw.documentDataBase64,
        photoDataBase64: raw.photoDataBase64,
        photoMimeType: raw.photoMimeType,
      },
      {
        id: user.id,
        name: user.name,
        role: user.role,
      }
    );

    revalidatePath('/admin/frontdesk');
    revalidatePath('/admin/frontdesk/arrivals');
    revalidatePath('/admin/frontdesk/inhouse');
    revalidatePath('/admin/pms/rooms');

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Check-in operation failed',
    };
  }
}

// ----------------------------------------------------
// 3. CHECK-OUT ACTION
// Permission: 'checkout:perform'
// ----------------------------------------------------
export async function checkOutAction(
  prevState: ActionResponse<CheckOutResult> | null,
  formData: FormData
): Promise<ActionResponse<CheckOutResult>> {
  try {
    const user = await requirePermission('checkout:perform');

    const raw = {
      stayId: formData.get('stayId')?.toString() || '',
      notes: formData.get('notes')?.toString() || undefined,
      settlementPaymentMethod: formData.get('settlementPaymentMethod')?.toString() || undefined,
      settlementPaymentAmount: formData.get('settlementPaymentAmount')
        ? Number(formData.get('settlementPaymentAmount'))
        : undefined,
      transactionReference: formData.get('transactionReference')?.toString() || undefined,
    };

    const parsed = checkOutSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await executeCheckOut(parsed.data as any, {
      id: user.id,
      name: user.name,
      role: user.role,
    });

    revalidatePath('/admin/frontdesk');
    revalidatePath('/admin/frontdesk/departures');
    revalidatePath('/admin/frontdesk/inhouse');
    revalidatePath('/admin/pms/rooms');

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Check-out operation failed',
    };
  }
}

// ----------------------------------------------------
// 4. DOCUMENT UPLOAD WITH SERVER-SIDE REFERENCE
// Permission: 'guest:manage'
// ----------------------------------------------------
export async function uploadGuestDocumentAction(
  prevState: ActionResponse<{ documentId: string; storageRef: string; isReplacement: boolean }> | null,
  formData: FormData
): Promise<ActionResponse<{ documentId: string; storageRef: string; isReplacement: boolean }>> {
  try {
    const user = await requirePermission('guest:manage');

    const raw = {
      guestId: formData.get('guestId')?.toString() || '',
      documentType: formData.get('documentType')?.toString() || '',
      documentNumber: formData.get('documentNumber')?.toString() || '',
      fileBase64: formData.get('fileBase64')?.toString() || '',
      fileName: formData.get('fileName')?.toString() || '',
      mimeType: formData.get('mimeType')?.toString() || '',
      existingDocumentId: formData.get('existingDocumentId')?.toString() || undefined,
    };

    const parsed = guestDocumentUploadSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const buffer = Buffer.from(parsed.data.fileBase64, 'base64');
    const maxBytes = 15 * 1024 * 1024; // 15MB
    if (buffer.length > maxBytes) {
      return { success: false, error: 'Document file size exceeds 15MB limit' };
    }

    const storageHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const storageRef = 'vault://docs/' + parsed.data.guestId + '/' + Date.now() + '-' + storageHash;

    let isReplacement = false;
    let docId: string;

    if (parsed.data.existingDocumentId) {
      const existing = await prisma.guestDocument.findUnique({
        where: { id: parsed.data.existingDocumentId },
      });

      if (existing && existing.guestId === parsed.data.guestId) {
        isReplacement = true;
        const updated = await prisma.guestDocument.update({
          where: { id: parsed.data.existingDocumentId },
          data: {
            documentType: parsed.data.documentType,
            documentNumber: parsed.data.documentNumber,
            fileUrl: storageRef,
            fileDataBase64: parsed.data.fileBase64,
            fileName: parsed.data.fileName,
            mimeType: parsed.data.mimeType,
            fileSize: buffer.length,
            verificationStatus: 'PENDING',
            verifiedById: null,
            verifiedAt: null,
            uploadedById: user.id,
          },
        });
        docId = updated.id;

        await recordAuditEvent({
          userId: user.id,
          action: 'GUEST_DOCUMENT_REPLACED',
          entity: 'GuestDocument',
          entityId: docId,
          newValues: {
            guestId: parsed.data.guestId,
            documentType: parsed.data.documentType,
            fileSize: buffer.length,
            previousFileUrl: existing.fileUrl,
          },
        });
      } else {
        const created = await prisma.guestDocument.create({
          data: {
            guestId: parsed.data.guestId,
            documentType: parsed.data.documentType,
            documentNumber: parsed.data.documentNumber,
            fileUrl: storageRef,
            fileDataBase64: parsed.data.fileBase64,
            fileName: parsed.data.fileName,
            mimeType: parsed.data.mimeType,
            fileSize: buffer.length,
            verificationStatus: 'PENDING',
            uploadedById: user.id,
          },
        });
        docId = created.id;

        await recordAuditEvent({
          userId: user.id,
          action: 'GUEST_DOCUMENT_UPLOADED',
          entity: 'GuestDocument',
          entityId: docId,
          newValues: {
            guestId: parsed.data.guestId,
            documentType: parsed.data.documentType,
            fileSize: buffer.length,
          },
        });
      }
    } else {
      const created = await prisma.guestDocument.create({
        data: {
          guestId: parsed.data.guestId,
          documentType: parsed.data.documentType,
          documentNumber: parsed.data.documentNumber,
          fileUrl: storageRef,
          fileDataBase64: parsed.data.fileBase64,
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          fileSize: buffer.length,
          verificationStatus: 'PENDING',
          uploadedById: user.id,
        },
      });
      docId = created.id;

      await recordAuditEvent({
        userId: user.id,
        action: 'GUEST_DOCUMENT_UPLOADED',
        entity: 'GuestDocument',
        entityId: docId,
        newValues: {
          guestId: parsed.data.guestId,
          documentType: parsed.data.documentType,
          fileSize: buffer.length,
        },
      });
    }

    return {
      success: true,
      data: { documentId: docId, storageRef, isReplacement },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload document',
    };
  }
}

// ----------------------------------------------------
// 5. GUEST PHOTO CAPTURE ACTION
// Permission: 'guest:manage'
// ----------------------------------------------------
export async function captureGuestPhotoAction(
  prevState: ActionResponse<{ photoId: string; storageRef: string }> | null,
  formData: FormData
): Promise<ActionResponse<{ photoId: string; storageRef: string }>> {
  try {
    const user = await requirePermission('guest:manage');

    const raw = {
      guestId: formData.get('guestId')?.toString() || '',
      photoBase64: formData.get('photoBase64')?.toString() || '',
      mimeType: formData.get('mimeType')?.toString() || 'image/jpeg',
    };

    const parsed = guestPhotoUploadSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const buffer = Buffer.from(parsed.data.photoBase64, 'base64');
    const maxBytes = 5 * 1024 * 1024; // 5MB
    if (buffer.length > maxBytes) {
      return { success: false, error: 'Photo file size exceeds 5MB limit' };
    }

    const photoHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const storageRef = 'vault://photos/' + parsed.data.guestId + '/' + Date.now() + '-' + photoHash;

    const photo = await prisma.guestPhoto.create({
      data: {
        guestId: parsed.data.guestId,
        fileUrl: storageRef,
        fileDataBase64: parsed.data.photoBase64,
        mimeType: parsed.data.mimeType,
        capturedById: user.id,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'GUEST_PHOTO_CAPTURED',
      entity: 'GuestPhoto',
      entityId: photo.id,
      newValues: {
        guestId: parsed.data.guestId,
        storageRef,
      },
    });

    return {
      success: true,
      data: { photoId: photo.id, storageRef },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to capture photo',
    };
  }
}

// ----------------------------------------------------
// 5b. GET RESERVATION PAYMENT SUMMARY
// Permission: 'checkin:perform'
// ----------------------------------------------------
export interface ReservationPaymentSummary {
  reservationId: string;
  reservationNumber: string;
  roomRentTotal: number;
  totalNights: number;
  roomsCount: number;
  paidDuringBooking: number;
  balanceDue: number;
  isPaidInFull: boolean;
  successfulPayments: Array<{
    id: string;
    paymentNumber: string;
    amount: number;
    method: string;
    paymentDate: string;
    transactionReference?: string | null;
  }>;
}

export async function getReservationPaymentSummaryAction(
  reservationId: string
): Promise<ActionResponse<ReservationPaymentSummary>> {
  try {
    await requirePermission('checkin:perform');

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        reservedRooms: true,
        payments: {
          where: { context: 'RESERVATION_ADVANCE' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const roomRentTotal = Number(reservation.totalAmount);

    const successfulPayments = reservation.payments
      .filter((p) => p.status === 'SUCCESS')
      .map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        amount: Number(p.amount),
        method: p.method,
        paymentDate: p.paymentDate.toISOString(),
        transactionReference: p.transactionReference,
      }));

    const paidDuringBooking = successfulPayments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = Math.max(0, roomRentTotal - paidDuringBooking);
    const isPaidInFull = balanceDue <= 0;

    const reservedRoom = reservation.reservedRooms[0];
    const totalNights = reservedRoom?.totalNights || 1;
    const roomsCount = reservation.totalRooms || 1;

    return {
      success: true,
      data: {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        roomRentTotal,
        totalNights,
        roomsCount,
        paidDuringBooking,
        balanceDue,
        isPaidInFull,
        successfulPayments,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payment summary',
    };
  }
}

// ----------------------------------------------------
// 5c. GET EXISTING GUEST DOCUMENTS
// Permission: 'checkin:perform'
// ----------------------------------------------------
export interface ExistingGuestDocument {
  id: string;
  documentType: string;
  documentNumber: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  verificationStatus: string;
  verifiedAt: string | null;
  createdAt: string;
}

export async function getGuestDocumentsAction(
  guestId: string
): Promise<ActionResponse<ExistingGuestDocument[]>> {
  try {
    await requirePermission('checkin:perform');

    const documents = await prisma.guestDocument.findMany({
      where: { guestId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        documentNumber: doc.documentNumber,
        fileUrl: doc.fileUrl,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        verificationStatus: doc.verificationStatus,
        verifiedAt: doc.verifiedAt?.toISOString() || null,
        createdAt: doc.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch guest documents',
    };
  }
}

// ----------------------------------------------------
// 5d. GET EXISTING GUEST PHOTO
// Permission: 'checkin:perform'
// ----------------------------------------------------
export interface ExistingGuestPhoto {
  id: string;
  fileUrl: string;
  mimeType: string | null;
  hasData: boolean;
  capturedAt: string;
}

export async function getGuestPhotoAction(
  guestId: string
): Promise<ActionResponse<ExistingGuestPhoto | null>> {
  try {
    await requirePermission('checkin:perform');

    const photo = await prisma.guestPhoto.findFirst({
      where: { guestId },
      orderBy: { capturedAt: 'desc' },
    });

    if (!photo) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: photo.id,
        fileUrl: photo.fileUrl,
        mimeType: photo.mimeType || 'image/jpeg',
        hasData: !!photo.fileDataBase64,
        capturedAt: photo.capturedAt.toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch guest photo',
    };
  }
}

// ----------------------------------------------------
// 5e. VERIFY GUEST DOCUMENT
// Permission: 'guest:manage'
// ----------------------------------------------------
export async function verifyGuestDocumentAction(
  prevState: ActionResponse<{ documentId: string; status: string }> | null,
  formData: FormData
): Promise<ActionResponse<{ documentId: string; status: string }>> {
  try {
    const user = await requirePermission('guest:manage');

    const raw = {
      documentId: formData.get('documentId')?.toString() || '',
      verificationStatus: formData.get('verificationStatus')?.toString() || '',
    };

    const parsed = guestDocumentVerifySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const doc = await prisma.guestDocument.findUnique({
      where: { id: parsed.data.documentId },
    });

    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    if (doc.verificationStatus === 'VERIFIED' && parsed.data.verificationStatus === 'VERIFIED') {
      return { success: true, data: { documentId: doc.id, status: 'VERIFIED' } };
    }

    const updated = await prisma.guestDocument.update({
      where: { id: parsed.data.documentId },
      data: {
        verificationStatus: parsed.data.verificationStatus as any,
        verifiedById: parsed.data.verificationStatus === 'VERIFIED' ? user.id : doc.verifiedById,
        verifiedAt: parsed.data.verificationStatus === 'VERIFIED' ? new Date() : doc.verifiedAt,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'GUEST_DOCUMENT_VERIFIED',
      entity: 'GuestDocument',
      entityId: doc.id,
      newValues: {
        previousStatus: doc.verificationStatus,
        newStatus: parsed.data.verificationStatus,
        documentType: doc.documentType,
      },
    });

    return {
      success: true,
      data: { documentId: updated.id, status: updated.verificationStatus },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify document',
    };
  }
}

// ----------------------------------------------------
// 6. VIEW SENSITIVE GUEST IDENTITY DOCUMENT
// Permission: 'guest:view_sensitive'
// ----------------------------------------------------
export async function viewSensitiveGuestDocumentAction(
  documentId: string
): Promise<ActionResponse<{ id: string; documentType: string; documentNumber: string; fileUrl: string }>> {
  try {
    const user = await requirePermission('guest:view_sensitive');

    const doc = await prisma.guestDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    await recordAuditEvent({
      userId: user.id,
      action: 'GUEST_SENSITIVE_DOC_VIEWED',
      entity: 'GuestDocument',
      entityId: doc.id,
    });

    return {
      success: true,
      data: {
        id: doc.id,
        documentType: doc.documentType,
        documentNumber: doc.documentNumber,
        fileUrl: doc.fileUrl,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unauthorized or failed to view document',
    };
  }
}

// ----------------------------------------------------
// 7. POST MANUAL FOLIO CHARGE
// Permission: 'folio:update'
// ----------------------------------------------------
export async function postFolioChargeAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('folio:update');

    const raw = {
      folioId: formData.get('folioId')?.toString() || '',
      description: formData.get('description')?.toString() || '',
      amount: formData.get('amount') ? Number(formData.get('amount')) : 0,
      taxAmount: formData.get('taxAmount') ? Number(formData.get('taxAmount')) : 0,
    };

    const parsed = folioChargeSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const folio = await tx.folio.findUnique({
        where: { id: parsed.data.folioId },
      });

      if (!folio) {
        throw new Error('Folio not found');
      }

      if (folio.status !== 'OPEN') {
        throw new Error('Cannot post charge to a ' + folio.status + ' folio');
      }

      const item = await tx.folioItem.create({
        data: {
          folioId: folio.id,
          itemType: FolioItemType.EXTRA_SERVICE_CHARGE,
          description: parsed.data.description,
          quantity: 1,
          unitPrice: parsed.data.amount,
          taxAmount: parsed.data.taxAmount,
          amount: parsed.data.amount,
        },
      });

      const newCharges = folio.totalCharges.plus(parsed.data.amount);
      const newBalance = folio.totalBalance.plus(parsed.data.amount);

      await tx.folio.update({
        where: { id: folio.id },
        data: {
          totalCharges: newCharges,
          totalBalance: newBalance,
        },
      });

      return item;
    });

    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post charge',
    };
  }
}
