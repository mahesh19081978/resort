import { z } from 'zod';
import { IdDocumentType, PaymentMethod } from '@prisma/client';

export const occupantInputSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  gender: z.string().trim().min(1, 'Gender is required'),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  idDocumentType: z.nativeEnum(IdDocumentType, { message: 'Valid ID document type is required' }),
  idDocumentNumber: z.string().trim().min(3, 'Document number must be at least 3 characters').max(50),
  documentStorageRef: z.string().trim().min(5).optional(),
  documentFileName: z.string().trim().max(255).optional(),
  documentMimeType: z.string().trim().max(100).optional(),
  documentFileSize: z.coerce.number().int().positive().max(15 * 1024 * 1024).optional(),
  isPrimary: z.boolean().default(false),
});

export const checkInSchema = z.object({
  reservationId: z.string().cuid({ message: 'Invalid reservation ID' }),
  roomId: z.string().cuid({ message: 'Invalid physical room ID' }),
  expectedCheckOut: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid expected checkout date is required',
  }),
  idDocumentType: z.nativeEnum(IdDocumentType, { message: 'Valid ID document type is required' }).optional(),
  idDocumentNumber: z.string().trim().min(3, 'Document number must be at least 3 characters').max(50).optional(),
  gender: z.string().trim().optional(),
  documentStorageRef: z.string().trim().min(5, 'Valid document storage reference is required').optional(),
  documentFileName: z.string().trim().max(255).optional(),
  documentMimeType: z.string().trim().max(100).optional(),
  documentFileSize: z.coerce.number().int().positive().max(15 * 1024 * 1024).optional(),
  photoStorageRef: z.string().trim().min(5, 'Valid photo storage reference is required').optional(),
  advanceDepositAmount: z.coerce.number().min(0, 'Deposit amount cannot be negative').optional(),
  advanceDepositMethod: z.nativeEnum(PaymentMethod).optional(),
  advanceDepositReference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  occupants: z.array(occupantInputSchema).optional(),
});

export const checkOutSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  notes: z.string().trim().max(500).optional(),
  settlementPaymentMethod: z.nativeEnum(PaymentMethod).optional(),
  settlementPaymentAmount: z.coerce.number().min(0, 'Payment amount cannot be negative').optional(),
  transactionReference: z.string().trim().max(100).optional(),
});

export const guestDocumentUploadSchema = z.object({
  guestId: z.string().cuid({ message: 'Invalid guest ID' }),
  documentType: z.nativeEnum(IdDocumentType),
  documentNumber: z.string().trim().min(3).max(50),
  fileBase64: z.string().min(10, 'File content required'),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], {
    message: 'Allowed formats: JPEG, PNG, WEBP, PDF',
  }),
  existingDocumentId: z.string().cuid().optional(),
});

export const guestDocumentVerifySchema = z.object({
  documentId: z.string().cuid({ message: 'Invalid document ID' }),
  verificationStatus: z.enum(['VERIFIED', 'REJECTED'], {
    message: 'Status must be VERIFIED or REJECTED',
  }),
});

export const guestPhotoUploadSchema = z.object({
  guestId: z.string().cuid({ message: 'Invalid guest ID' }),
  photoBase64: z.string().min(10, 'Photo content required'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    message: 'Allowed formats: JPEG, PNG, WEBP',
  }),
});

export const folioChargeSchema = z.object({
  folioId: z.string().cuid({ message: 'Invalid folio ID' }),
  description: z.string().trim().min(3).max(255),
  amount: z.coerce.number().positive('Charge amount must be greater than zero'),
  taxCode: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1, 'Idempotency key is required'),
});

export const postServiceChargeSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  serviceId: z.string().cuid({ message: 'Invalid service ID' }),
  description: z.string().trim().min(1, 'Description is required').max(255),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1').default(1),
  unitPrice: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(1, 'Idempotency key is required'),
});

export const recordFolioPaymentSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  method: z.nativeEnum(PaymentMethod, { message: 'Valid payment method required' }),
  transactionReference: z.string().trim().max(100).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  idempotencyKey: z.string().trim().min(1, 'Idempotency key is required'),
});

export const stayNoteCreateSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  noteType: z.enum(['OPERATIONAL', 'GUEST_PREFERENCE', 'ALERT', 'INTERNAL']).default('OPERATIONAL'),
  content: z.string().trim().min(1, 'Note content is required').max(1000),
});

export const stayNoteUpdateSchema = z.object({
  id: z.string().cuid({ message: 'Invalid note ID' }),
  noteType: z.enum(['OPERATIONAL', 'GUEST_PREFERENCE', 'ALERT', 'INTERNAL']).optional(),
  content: z.string().trim().min(1, 'Note content is required').max(1000),
});

export const issueInvoiceSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
});

export const extendStayPreviewSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  newCheckoutDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid new checkout date is required',
  }),
});

export const extendStaySchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  newCheckoutDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid new checkout date is required',
  }),
  targetRoomId: z.string().cuid().optional(),
  transferReason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(1, 'Idempotency key is required'),
});

export const addOccupantSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  occupant: occupantInputSchema,
});

export const removeOccupantSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  stayGuestId: z.string().cuid({ message: 'Invalid stayGuest ID' }),
  reason: z.string().trim().min(1, 'Reason for removal is required').max(500),
});

export const transferPrimaryGuestSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  newPrimaryGuestId: z.string().cuid({ message: 'Invalid guest ID' }).optional(),
  newPrimaryStayGuestId: z.string().cuid({ message: 'Invalid stayGuest ID' }).optional(),
}).refine((data) => data.newPrimaryGuestId || data.newPrimaryStayGuestId, {
  message: 'Either newPrimaryGuestId or newPrimaryStayGuestId must be provided',
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type GuestDocumentUploadInput = z.infer<typeof guestDocumentUploadSchema>;
export type GuestDocumentVerifyInput = z.infer<typeof guestDocumentVerifySchema>;
export type GuestPhotoUploadInput = z.infer<typeof guestPhotoUploadSchema>;
export type FolioChargeInput = z.infer<typeof folioChargeSchema>;
export type PostServiceChargeInput = z.infer<typeof postServiceChargeSchema>;
export type RecordFolioPaymentInput = z.infer<typeof recordFolioPaymentSchema>;
export type StayNoteCreateInput = z.infer<typeof stayNoteCreateSchema>;
export type StayNoteUpdateInput = z.infer<typeof stayNoteUpdateSchema>;
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;
export type OccupantInput = z.infer<typeof occupantInputSchema>;
export type ExtendStayInput = z.infer<typeof extendStaySchema>;
export type AddOccupantInput = z.infer<typeof addOccupantSchema>;
export type RemoveOccupantInput = z.infer<typeof removeOccupantSchema>;
export type TransferPrimaryGuestInput = z.infer<typeof transferPrimaryGuestSchema>;
