'use server';

import { createBookingRequestSchema, CreateBookingRequestInput } from '@/lib/booking/schema';
import { createReservationHold, SanitizedPublicBooking } from '@/lib/booking/reservation-service';
import { defaultPaymentGateway } from '@/lib/booking/payment-provider';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { ok, fail, ActionResult } from '@/lib/errors';
import { headers } from 'next/headers';
import { Prisma } from '@prisma/client';

export interface BookingSubmissionResult {
  booking: SanitizedPublicBooking;
  checkoutUrl?: string;
  transactionReference?: string;
}

export async function createPublicBookingAction(
  rawInput: unknown
): Promise<ActionResult<BookingSubmissionResult>> {
  try {
    // 1. Ingress Rate Limiting
    const headerList = await headers();
    const forwardedFor = headerList.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    const rateLimit = await checkRateLimit(`booking:${clientIp}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });

    if (!rateLimit.success) {
      return fail(rateLimit.error || 'Too many booking attempts. Please try again later.', 'BUSINESS_RULE_VIOLATION');
    }

    // 2. Strict Zod Validation
    const parsed = createBookingRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return fail('Validation error in booking submission', 'VALIDATION_ERROR', parsed.error.flatten().fieldErrors);
    }

    const input: CreateBookingRequestInput = parsed.data;

    // 3. Turnstile Bot Verification (Fail-closed in production if secret is configured)
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (process.env.NODE_ENV === 'production' && turnstileSecret && !turnstileSecret.startsWith('0x4AAAAAA')) {
      if (!input.turnstileToken) {
        return fail('Bot protection verification token required.', 'BUSINESS_RULE_VIOLATION');
      }

      try {
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(input.turnstileToken)}&remoteip=${encodeURIComponent(clientIp)}`,
        });
        const outcome = (await verifyRes.json()) as { success: boolean };
        if (!outcome.success) {
          return fail('Bot protection verification failed. Please refresh and try again.', 'BUSINESS_RULE_VIOLATION');
        }
      } catch (err) {
        console.error('[TURNSTILE_VERIFY_ERROR]', err);
        return fail('Bot verification service unavailable.', 'EXTERNAL_SERVICE_ERROR');
      }
    }

    // 4. Create Reservation Hold under Pessimistic DB Lock
    const booking = await createReservationHold(input);

    // 4. Initiate Payment Intent via Gateway SPI
    const paymentIntent = await defaultPaymentGateway.createPaymentIntent({
      reservationId: booking.reservationId,
      reservationNumber: booking.reservationNumber,
      amount: new Prisma.Decimal(booking.requiredAdvanceAmount),
      currency: 'INR',
      guest: {
        name: `${input.guest.firstName} ${input.guest.lastName}`,
        email: input.guest.email,
        phone: input.guest.phone,
      },
    });

    return ok({
      booking,
      checkoutUrl: paymentIntent.checkoutUrl,
      transactionReference: paymentIntent.transactionReference,
    });
  } catch (error: any) {
    console.error('[PUBLIC_BOOKING_ERROR]', error);

    if (error?.message?.startsWith('INSUFFICIENT_INVENTORY')) {
      return fail(
        'One or more selected rooms are no longer available for your dates. Please check updated availability.',
        'CONFLICT'
      );
    }

    if (error?.message?.startsWith('OCCUPANCY_EXCEEDED')) {
      return fail(error.message, 'BUSINESS_RULE_VIOLATION');
    }

    return fail(
      'Unable to reserve rooms at this time. Please check your details and try again.',
      'INTERNAL_ERROR'
    );
  }
}
