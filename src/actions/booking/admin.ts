'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/auth';
import {
  cancelAdminReservation,
  createAdminReservation,
  CancelReservationResult,
  AdminReservationCreationResult,
} from '@/lib/booking/admin-reservation-service';
import { calculateBookingPrice } from '@/lib/booking/pricing-calculator';
import { prisma } from '@/lib/db/prisma';
import { BookingSource, PaymentMethod, Prisma } from '@prisma/client';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const cancelReservationSchema = z.object({
  reservationId: z.string().cuid('Invalid reservation ID'),
  reason: z.string().trim().min(3, 'Cancellation reason must be at least 3 characters'),
});

/**
 * Server action to cancel a reservation.
 * Gated by 'booking:cancel' permission.
 */
export async function cancelReservationAction(
  prevState: ActionResponse<CancelReservationResult> | null,
  formData: FormData
): Promise<ActionResponse<CancelReservationResult>> {
  try {
    const user = await requirePermission('booking:cancel');

    const raw = {
      reservationId: formData.get('reservationId')?.toString() || '',
      reason: formData.get('reason')?.toString() || '',
    };

    const parsed = cancelReservationSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await cancelAdminReservation(parsed.data.reservationId, parsed.data.reason, user);

    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${parsed.data.reservationId}`);
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/frontdesk');
    revalidatePath('/admin/frontdesk/arrivals');
    revalidatePath('/admin/frontdesk/departures');

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cancellation operation failed.',
    };
  }
}

const adminRoomItemSchema = z.object({
  roomTypeId: z.string().cuid('Invalid room type ID'),
  roomsCount: z.coerce.number().int().min(1, 'At least 1 room required').max(10),
});

const adminGuestSchema = z.object({
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone must be at least 10 digits')
    .max(15)
    .regex(/^[0-9+\s()-]+$/, 'Invalid phone number format'),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(50).optional().default('India'),
});

const createAdminReservationSchema = z
  .object({
    bookingRequestId: z.string().min(10, 'Valid bookingRequestId idempotency key is required'),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-in date (YYYY-MM-DD)'),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-out date (YYYY-MM-DD)'),
    adults: z.coerce.number().int().min(1, 'At least 1 adult required').max(20),
    children: z.coerce.number().int().min(0).max(10).default(0),
    rooms: z.array(adminRoomItemSchema).min(1, 'At least one room type required'),
    guest: adminGuestSchema,
    source: z.nativeEnum(BookingSource).default(BookingSource.FRONT_DESK_WALKIN),
    specialRequests: z.string().trim().max(500).optional(),
    advancePayment: z
      .object({
        received: z.boolean(),
        amount: z.coerce.number().positive().optional(),
        method: z.nativeEnum(PaymentMethod).optional(),
        transactionReference: z.string().trim().max(100).optional(),
        notes: z.string().trim().max(255).optional(),
      })
      .optional(),
  })
  .refine((data) => data.checkOutDate > data.checkInDate, {
    message: 'Check-out date must be strictly after check-in date',
    path: ['checkOutDate'],
  });

/**
 * Server action to create an Admin reservation.
 * Gated by 'booking:create' permission.
 */
export async function createAdminReservationAction(
  rawInput: unknown
): Promise<ActionResponse<AdminReservationCreationResult>> {
  try {
    const user = await requirePermission('booking:create');

    const parsed = createAdminReservationSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await createAdminReservation(parsed.data, user);

    revalidatePath('/admin/bookings');
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/frontdesk');
    revalidatePath('/admin/frontdesk/arrivals');

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Reservation creation failed.',
    };
  }
}

/**
 * Authoritative pricing calculation helper for Admin reservation flow.
 * Reuses calculateReservationPricing() and live DB Tax record.
 */
export async function calculateAdminPricingAction(params: {
  checkInDate: string;
  checkOutDate: string;
  rooms: Array<{ roomTypeId: string; roomsCount: number }>;
}): Promise<
  ActionResponse<{
    subtotal: string;
    taxAmount: string;
    discountAmount: string;
    totalAmount: string;
    nights: number;
    lines: Array<{
      roomTypeId: string;
      roomTypeName: string;
      roomsCount: number;
      ratePerNight: string;
      totalNights: number;
      lineTotal: string;
    }>;
  }>
> {
  try {
    await requirePermission('booking:read');

    if (!params.checkInDate || !params.checkOutDate || params.checkInDate >= params.checkOutDate) {
      return { success: false, error: 'Valid check-in and check-out dates required.' };
    }

    if (!params.rooms || params.rooms.length === 0) {
      return { success: false, error: 'At least one room required.' };
    }

    const pricing = await calculateBookingPrice(
      {
        checkInDate: params.checkInDate,
        checkOutDate: params.checkOutDate,
        rooms: params.rooms,
      },
      prisma
    );

    return {
      success: true,
      data: {
        subtotal: pricing.subtotal.toFixed(2),
        taxAmount: pricing.taxAmount.toFixed(2),
        discountAmount: pricing.discountAmount.toFixed(2),
        totalAmount: pricing.totalAmount.toFixed(2),
        nights: pricing.nights,
        lines: pricing.roomDetails.map((l) => ({
          roomTypeId: l.roomTypeId,
          roomTypeName: l.name,
          roomsCount: l.roomsCount,
          ratePerNight: l.ratePerNight.toFixed(2),
          totalNights: l.totalNights,
          lineTotal: l.lineTotal.toFixed(2),
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Pricing calculation failed.',
    };
  }
}
