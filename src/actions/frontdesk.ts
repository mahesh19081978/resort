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
  postServiceChargeSchema,
  recordFolioPaymentSchema,
  stayNoteCreateSchema,
  stayNoteUpdateSchema,
  issueInvoiceSchema,
} from '@/validations/frontdesk';
import { executeCheckIn, CheckInResult } from '@/lib/frontdesk/checkin';
import { executeCheckOut, CheckOutResult } from '@/lib/frontdesk/checkout';
import { getEligibleRoomsForCheckIn } from '@/lib/frontdesk/eligibility';
import { getInHouseRooms, InHouseFilter, InHouseRoomCard } from '@/lib/frontdesk/inhouse';
import { executePostServiceCharge, PostChargeResult } from '@/lib/frontdesk/post-charge';
import { getStayBillData, issueInvoice, BillSummary } from '@/lib/frontdesk/bill';
import { FolioItemType, PaymentStatus, PaymentMethod, Prisma } from '@prisma/client';
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

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/frontdesk');
    revalidatePath('/admin/frontdesk/arrivals');
    revalidatePath('/admin/frontdesk/inhouse');
    revalidatePath('/admin/rooms');
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

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/frontdesk');
    revalidatePath('/admin/frontdesk/departures');
    revalidatePath('/admin/frontdesk/inhouse');
    revalidatePath('/admin/rooms');
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

      const baseAmount = new Prisma.Decimal(parsed.data.amount);
      const taxAmount = new Prisma.Decimal(parsed.data.taxAmount);
      const totalAmount = baseAmount.plus(taxAmount);

      const item = await tx.folioItem.create({
        data: {
          folioId: folio.id,
          itemType: FolioItemType.EXTRA_SERVICE_CHARGE,
          description: parsed.data.description,
          quantity: 1,
          unitPrice: baseAmount,
          taxAmount,
          amount: totalAmount,
        },
      });

      const newCharges = folio.totalCharges.plus(totalAmount);
      const newBalance = folio.totalBalance.plus(totalAmount);

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

// ----------------------------------------------------
// 8. GET IN-HOUSE ROOMS
// Permission: 'booking:read'
// ----------------------------------------------------
export async function getInHouseRoomsAction(
  filter: InHouseFilter = 'all',
  searchQuery?: string
): Promise<ActionResponse<InHouseRoomCard[]>> {
  try {
    await requirePermission('booking:read');
    const rooms = await getInHouseRooms(filter, searchQuery);
    return { success: true, data: rooms };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch in-house rooms',
    };
  }
}

// ----------------------------------------------------
// 9. POST SERVICE CHARGE TO FOLIO
// Permission: 'folio:update'
// ----------------------------------------------------
export async function postServiceChargeAction(
  prevState: ActionResponse<PostChargeResult> | null,
  formData: FormData
): Promise<ActionResponse<PostChargeResult>> {
  try {
    const user = await requirePermission('folio:update');

    const raw = {
      stayId: formData.get('stayId')?.toString() || '',
      serviceId: formData.get('serviceId')?.toString() || '',
      description: formData.get('description')?.toString() || '',
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : 1,
      unitPrice: formData.get('unitPrice') ? Number(formData.get('unitPrice')) : undefined,
      notes: formData.get('notes')?.toString() || undefined,
    };

    const parsed = postServiceChargeSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await executePostServiceCharge(parsed.data, {
      id: user.id,
      name: user.name,
      role: user.role,
    });

    revalidatePath('/admin/frontdesk/inhouse');
    revalidatePath('/admin/frontdesk/inhouse/' + raw.stayId + '/bill');
    revalidatePath('/admin/frontdesk/departures');

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post service charge',
    };
  }
}

// ----------------------------------------------------
// 10. GET STAY BILL DATA
// Permission: 'folio:read'
// ----------------------------------------------------
export async function getStayBillAction(
  stayId: string
): Promise<ActionResponse<BillSummary>> {
  try {
    await requirePermission('folio:read');
    const bill = await getStayBillData(stayId);
    if (!bill) {
      return { success: false, error: 'Stay not found or no folio data available' };
    }
    return { success: true, data: bill };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch bill data',
    };
  }
}

// ----------------------------------------------------
// 11. GET ACTIVE SERVICES
// Permission: 'folio:update'
// ----------------------------------------------------
export async function getActiveServicesAction(): Promise<
  ActionResponse<Array<{ id: string; name: string; code: string; basePrice: string; description: string | null }>>
> {
  try {
    await requirePermission('folio:update');
    const services = await prisma.service.findMany({
      where: { isActive: true, isChargeable: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        basePrice: true,
        description: true,
      },
    });
    return {
      success: true,
      data: services.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        basePrice: s.basePrice.toString(),
        description: s.description,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch services',
    };
  }
}

// ----------------------------------------------------
// 12. RECORD FOLIO PAYMENT
// Permission: 'folio:payment:record'
// ----------------------------------------------------
export async function recordFolioPaymentAction(
  input: unknown
): Promise<ActionResponse<{ paymentId: string; paymentNumber: string; amount: string; newBalance: string; isDuplicate?: boolean }>> {
  try {
    const actor = await requirePermission('folio:payment:record');
    const parsed = recordFolioPaymentSchema.parse(input);
    const amountDecimal = new Prisma.Decimal(parsed.amount.toFixed(2));

    const result = await prisma.$transaction(async (tx) => {
      // 1. Locate stay and folio
      const stay = await tx.stay.findUnique({
        where: { id: parsed.stayId },
        include: { folio: true },
      });

      if (!stay || !stay.folio) {
        throw new Error('FOLIO_NOT_FOUND: No active folio found for this stay.');
      }

      const folioId = stay.folio.id;

      // 2. Concurrency-safe row lock on Folio
      await tx.$queryRaw`SELECT id FROM "Folio" WHERE id = ${folioId} FOR UPDATE`;

      // 3. Reread post-lock
      const folio = await tx.folio.findUniqueOrThrow({
        where: { id: folioId },
      });

      // 4. Verify folio status is OPEN
      if (folio.status !== 'OPEN') {
        throw new Error(`FOLIO_NOT_OPEN: Cannot post payment to a folio with status '${folio.status}'.`);
      }

      // 5. Verify authoritative ledger consistency
      const lineItems = await tx.folioItem.findMany({
        where: { folioId, isVoided: false },
      });

      let chargesSum = new Prisma.Decimal(0);
      let discountsSum = new Prisma.Decimal(0);

      for (const item of lineItems) {
        if (item.itemType === FolioItemType.DISCOUNT_CREDIT || item.itemType === FolioItemType.PAYMENT_CREDIT) {
          discountsSum = discountsSum.plus(item.amount);
        } else {
          chargesSum = chargesSum.plus(item.amount);
        }
      }

      const payments = await tx.payment.findMany({
        where: { folioId, status: PaymentStatus.SUCCESS },
      });
      const paymentsSum = payments.reduce((acc, p) => acc.plus(p.amount), new Prisma.Decimal(0));

      const expectedBalance = chargesSum.minus(discountsSum).minus(paymentsSum);

      if (folio.totalBalance.minus(expectedBalance).abs().gt(new Prisma.Decimal(0.005))) {
        throw new Error(
          `FOLIO_LEDGER_INCONSISTENT: Folio cached balance (${folio.totalBalance}) does not match authoritative ledger (${expectedBalance}). Payment rejected.`
        );
      }

      // 6. Idempotency and conflict check
      const existingPayment = await tx.payment.findUnique({
        where: { idempotencyKey: parsed.idempotencyKey },
      });

      if (existingPayment) {
        if (
          existingPayment.folioId !== folioId ||
          !existingPayment.amount.equals(amountDecimal) ||
          existingPayment.method !== parsed.method
        ) {
          throw new Error(
            `IDEMPOTENCY_KEY_REUSE_CONFLICT: Idempotency key '${parsed.idempotencyKey}' was previously used for a materially different payment request.`
          );
        }
        return {
          paymentId: existingPayment.id,
          paymentNumber: existingPayment.paymentNumber,
          amount: existingPayment.amount.toFixed(2),
          newBalance: folio.totalBalance.toFixed(2),
          isDuplicate: true,
        };
      }

      // 7. Validate amount <= outstanding balance (Decimal only; no overpayment without explicit permission)
      if (amountDecimal.lte(0)) {
        throw new Error('PAYMENT_AMOUNT_INVALID: Payment amount must be greater than zero.');
      }
      if (amountDecimal.gt(folio.totalBalance)) {
        throw new Error(
          `PAYMENT_EXCEEDS_BALANCE: Payment amount (₹${amountDecimal}) exceeds outstanding folio balance (₹${folio.totalBalance}).`
        );
      }

      // 8. Create Payment record
      const paymentNumber = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          context: 'FOLIO_SETTLEMENT',
          folioId,
          amount: amountDecimal,
          method: parsed.method,
          status: PaymentStatus.SUCCESS,
          transactionReference: parsed.transactionReference || null,
          notes: parsed.notes || null,
          idempotencyKey: parsed.idempotencyKey,
          receivedById: actor.id,
        },
      });

      // 9. Update Folio running totals atomically
      const newCredits = folio.totalCredits.plus(amountDecimal);
      const newBalance = folio.totalBalance.minus(amountDecimal);

      await tx.folio.update({
        where: { id: folioId },
        data: {
          totalCredits: newCredits,
          totalBalance: newBalance,
        },
      });

      // 10. Audit event
      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'FOLIO_PAYMENT_RECORDED',
          entity: 'Payment',
          entityId: payment.id,
          newValues: {
            folioId,
            stayId: stay.id,
            paymentNumber,
            amount: amountDecimal.toString(),
            method: parsed.method,
            newBalance: newBalance.toString(),
          },
        },
        tx
      );

      return {
        paymentId: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: payment.amount.toFixed(2),
        newBalance: newBalance.toFixed(2),
        isDuplicate: false,
      };
    });

    revalidatePath('/admin/frontdesk/inhouse');
    revalidatePath(`/admin/frontdesk/inhouse/${parsed.stayId}/bill`);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 13. GET STAY NOTES
// Permission: 'stay:note:view'
// ----------------------------------------------------
export async function getStayNotesAction(stayId: string): Promise<ActionResponse<any[]>> {
  try {
    await requirePermission('stay:note:view');
    const notes = await prisma.stayNote.findMany({
      where: { stayId },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        updatedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      data: notes.map((n) => ({
        id: n.id,
        stayId: n.stayId,
        noteType: n.noteType,
        content: n.content,
        isEdited: n.isEdited,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        createdByName: n.createdBy?.name || 'Staff',
        updatedByName: n.updatedBy?.name || null,
      })),
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 14. CREATE STAY NOTE
// Permission: 'stay:note:create'
// ----------------------------------------------------
export async function createStayNoteAction(input: unknown): Promise<ActionResponse<any>> {
  try {
    const actor = await requirePermission('stay:note:create');
    const parsed = stayNoteCreateSchema.parse(input);

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.stayNote.create({
        data: {
          stayId: parsed.stayId,
          noteType: parsed.noteType as any,
          content: parsed.content,
          createdById: actor.id,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });

      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'STAY_NOTE_CREATED',
          entity: 'StayNote',
          entityId: created.id,
          newValues: {
            stayId: parsed.stayId,
            noteType: parsed.noteType,
            content: parsed.content,
          },
        },
        tx
      );

      return created;
    });

    revalidatePath('/admin/frontdesk/inhouse');
    return { success: true, data: note };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 15. UPDATE STAY NOTE
// Permission: 'stay:note:create'
// ----------------------------------------------------
export async function updateStayNoteAction(input: unknown): Promise<ActionResponse<any>> {
  try {
    const actor = await requirePermission('stay:note:create');
    const parsed = stayNoteUpdateSchema.parse(input);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.stayNote.findUniqueOrThrow({
        where: { id: parsed.id },
      });

      const res = await tx.stayNote.update({
        where: { id: parsed.id },
        data: {
          content: parsed.content,
          noteType: parsed.noteType ? (parsed.noteType as any) : undefined,
          isEdited: true,
          updatedById: actor.id,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
      });

      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'STAY_NOTE_EDITED',
          entity: 'StayNote',
          entityId: res.id,
          oldValues: {
            content: existing.content,
            noteType: existing.noteType,
          },
          newValues: {
            content: res.content,
            noteType: res.noteType,
          },
        },
        tx
      );

      return res;
    });

    revalidatePath('/admin/frontdesk/inhouse');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 16. ISSUE INVOICE
// Permission: 'invoice:issue'
// ----------------------------------------------------
export async function issueInvoiceAction(
  stayId: string
): Promise<ActionResponse<{ invoiceNumber: string; isNew: boolean }>> {
  try {
    const actor = await requirePermission('invoice:issue');
    const result = await issueInvoice(stayId, actor);
    revalidatePath('/admin/frontdesk/inhouse');
    revalidatePath(`/admin/frontdesk/inhouse/${stayId}/bill`);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

