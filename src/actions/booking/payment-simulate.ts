'use server';

import { prisma } from '@/lib/db/prisma';
import { ok, fail, ActionResult } from '@/lib/errors';
import { verifyBookingAccessToken, createBookingAccessToken } from '@/lib/booking/tokens';
import { processPaymentWebhook } from '@/lib/booking/reservation-service';
import { defaultPaymentGateway } from '@/lib/booking/payment-provider';

export interface SimulatePaymentResult {
  success: boolean;
  statusAccessToken?: string;
  message: string;
}

/**
 * Server-side Mock Gateway Simulator Action.
 * RESTRICTED: Strictly disabled in production.
 * Browser sends only a simulation instruction ('SUCCESS' | 'FAILED') along with the signed public_payment token.
 * The server securely extracts reservation truth, generates the trusted webhook payload, signs it with the gateway secret,
 * verifies it through the official Gateway SPI, and settles through processPaymentWebhook().
 */
export async function simulateMockGatewayPaymentAction(params: {
  token: string;
  outcome: 'SUCCESS' | 'FAILED';
  channel?: 'CARD' | 'UPI' | 'NET_BANKING';
}): Promise<ActionResult<SimulatePaymentResult>> {
  try {
    // 1. Production Guard (Fail Closed)
    if (process.env.NODE_ENV === 'production') {
      return fail('Mock payment simulator is strictly prohibited in production environment.', 'BUSINESS_RULE_VIOLATION');
    }

    if (!params.token || typeof params.token !== 'string') {
      return fail('Payment access token is required.', 'VALIDATION_ERROR');
    }

    // 2. Validate public_payment scope
    const verified = await verifyBookingAccessToken(params.token, 'public_payment');
    if (!verified) {
      return fail('Invalid, expired, or wrong-scoped payment access token.', 'AUTHORIZATION_ERROR');
    }

    // 3. Retrieve authoritative reservation record directly from database
    const reservation = await prisma.reservation.findUnique({
      where: { id: verified.resId },
    });

    if (!reservation) {
      return fail('Reservation not found.', 'NOT_FOUND');
    }

    const eventId = `evt_${Date.now()}`;
    const idempotencyKey = `idemp_${Date.now()}`;
    const providerTransactionId = `MOCK-TX-${reservation.reservationNumber}-${Date.now()}`;
    const eventType = params.outcome === 'SUCCESS' ? 'payment.success' : 'payment.failed';
    const amount = Number(reservation.totalAmount); // Authoritative snapshotted amount

    const rawPayload = {
      eventId,
      eventType,
      provider: 'MOCK_GATEWAY',
      providerTransactionId,
      idempotencyKey,
      reservationId: reservation.id,
      amount,
      currency: 'INR',
      signature: 'mock_valid_signature_for_test',
      timestamp: new Date().toISOString(),
      errorMessage: params.outcome === 'FAILED' ? 'Simulated bank card decline' : undefined,
    };

    // 4. Verify Gateway Signature via official Gateway SPI
    const verification = await defaultPaymentGateway.verifyWebhook(rawPayload, rawPayload.signature);
    if (!verification.isValid) {
      return fail('Gateway webhook verification rejected signature.', 'AUTHORIZATION_ERROR');
    }

    // 5. Process through the Authoritative Settlement Service
    await processPaymentWebhook(rawPayload as any);

    if (params.outcome === 'SUCCESS') {
      const statusAccessToken = await createBookingAccessToken(
        reservation.id,
        reservation.reservationNumber,
        'public_booking_status'
      );

      return ok({
        success: true,
        statusAccessToken,
        message: 'Payment successfully captured and authorized.',
      });
    } else {
      return ok({
        success: false,
        message: 'Payment simulation declined by bank.',
      });
    }
  } catch (error: any) {
    console.error('[SIMULATE_MOCK_PAYMENT_ERROR]', error);
    return fail(error?.message || 'Payment simulation failed.', 'INTERNAL_ERROR');
  }
}
