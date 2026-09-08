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
  accessToken: string;
  checkoutUrl?: string;
  transactionReference?: string;
  paymentToken?: string;
}

export async function createPublicBookingAction(
  rawInput: unknown
): Promise<ActionResult<BookingSubmissionResult>> {
  try {
    // 1. Ingress Rate Limiting
    let clientIp = '127.0.0.1';
    try {
      const headerList = await headers();
      const forwardedFor = headerList.get('x-forwarded-for');
      if (forwardedFor) {
        clientIp = forwardedFor.split(',')[0].trim();
      }
    } catch {
      // In test script or non-HTTP context, fallback gracefully to loopback
      clientIp = '127.0.0.1';
    }

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

    // 4. Policy Check for PAY_AT_HOTEL (Server-side authoritative)
    const { getPaymentPolicy } = await import('@/lib/booking/policy');
    const policy = getPaymentPolicy();

    if (input.paymentMethod === 'PAY_AT_HOTEL') {
      if (!policy.allowPayAtHotel) {
        return fail(
          'Pay at Hotel is currently not permitted. An advance payment is required.',
          'BUSINESS_RULE_VIOLATION'
        );
      }
    }

    // 5. Create Reservation Hold or Confirmed Pay at Hotel under Pessimistic DB Lock
    const booking = await createReservationHold(input);

    // 6. Generate Short-Lived Scoped Access Tokens
    const { createBookingAccessToken } = await import('@/lib/booking/tokens');
    const statusAccessToken = await createBookingAccessToken(
      booking.reservationId,
      booking.reservationNumber,
      'public_booking_status'
    );

    // 7. Handle Payment Method Routing
    if (input.paymentMethod === 'PAY_AT_HOTEL') {
      return ok({
        booking,
        accessToken: statusAccessToken,
      });
    }

    // Initiate Payment Intent via Gateway SPI for PAY_ONLINE
    const paymentToken = await createBookingAccessToken(
      booking.reservationId,
      booking.reservationNumber,
      'public_payment'
    );

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

    const channelQuery = input.onlineSubMethod ? `&channel=${encodeURIComponent(input.onlineSubMethod)}` : '';
    const checkoutUrl = paymentIntent.checkoutUrl
      ? `${paymentIntent.checkoutUrl}&token=${encodeURIComponent(paymentToken)}&statusToken=${encodeURIComponent(statusAccessToken)}${channelQuery}`
      : undefined;

    return ok({
      booking,
      accessToken: statusAccessToken,
      checkoutUrl,
      transactionReference: paymentIntent.transactionReference,
      paymentToken,
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
