import { z } from 'zod';

export const roomBookingItemSchema = z.object({
  roomTypeId: z.string().cuid('Invalid room type ID'),
  roomsCount: z.coerce.number().int().min(1, 'At least 1 room required').max(10, 'Maximum 10 rooms per category'),
});

export const guestContactSchema = z.object({
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  email: z.string().trim().email('Valid email address is required').toLowerCase(),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15)
    .regex(/^[0-9+\s()-]+$/, 'Invalid phone number format'),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(50).optional().default('India'),
});

export const createBookingRequestSchema = z
  .object({
    bookingRequestId: z.string().uuid('Valid UUID bookingRequestId is required'),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-in date (expected YYYY-MM-DD)'),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-out date (expected YYYY-MM-DD)'),
    adults: z.coerce.number().int().min(1, 'At least 1 adult required').max(20),
    children: z.coerce.number().int().min(0).max(10).default(0),
    rooms: z.array(roomBookingItemSchema).min(1, 'At least one room category must be selected'),
    guest: guestContactSchema,
    paymentMethod: z.enum(['PAY_ONLINE', 'PAY_AT_HOTEL']).default('PAY_ONLINE'),
    onlineSubMethod: z.enum(['CARD', 'UPI', 'NET_BANKING']).optional(),
    specialRequests: z.string().trim().max(500).optional(),
    turnstileToken: z.string().optional(),
  })
  .refine((data) => data.checkOutDate > data.checkInDate, {
    message: 'Check-out date must be strictly after check-in date',
    path: ['checkOutDate'],
  });

export const gatewayWebhookSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  eventType: z.enum(['payment.success', 'payment.failed']),
  provider: z.string().min(1, 'Provider is required'),
  providerTransactionId: z.string().min(1, 'Provider transaction ID is required'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  reservationId: z.string().cuid('Invalid reservation ID'),
  amount: z.coerce.number().positive('Payment amount must be strictly positive'),
  currency: z.literal('INR'),
  signature: z.string().min(1, 'Signature is required'),
  timestamp: z.string(),
  errorMessage: z.string().optional(),
});

export type CreateBookingRequestInput = z.input<typeof createBookingRequestSchema>;
export type ValidatedBookingRequestInput = z.output<typeof createBookingRequestSchema>;
export type GatewayWebhookInput = z.infer<typeof gatewayWebhookSchema>;
