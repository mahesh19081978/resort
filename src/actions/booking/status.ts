'use server';

import { prisma } from '@/lib/db/prisma';
import { ok, fail, ActionResult } from '@/lib/errors';
import { sanitizeReservation, SanitizedPublicBooking } from '@/lib/booking/reservation-service';

export async function getBookingStatusAction(
  target: string,
  token?: string
): Promise<ActionResult<SanitizedPublicBooking>> {
  try {
    if (!target || typeof target !== 'string') {
      return fail('Invalid reservation identifier', 'VALIDATION_ERROR');
    }

    const { verifyBookingAccessToken } = await import('@/lib/booking/tokens');

    // Token must be provided either as token parameter or as the target itself
    const candidateToken = token || (target.split('.').length === 3 ? target : null);
    if (!candidateToken) {
      return fail('A valid signed booking access token is required to view reservation status', 'AUTHORIZATION_ERROR');
    }

    const verified = await verifyBookingAccessToken(candidateToken, 'public_booking_status');
    if (!verified) {
      return fail('Invalid or expired booking access token', 'AUTHORIZATION_ERROR');
    }

    // If target was passed as an ID alongside the token, ensure it matches
    if (token && target !== verified.resId) {
      return fail('Access token does not match requested reservation', 'AUTHORIZATION_ERROR');
    }

    const reservationId = verified.resId;

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        primaryGuest: true,
        reservedRooms: {
          include: {
            roomType: true,
          },
        },
      },
    });

    if (!reservation) {
      return fail('Reservation not found', 'NOT_FOUND');
    }

    return ok(sanitizeReservation(reservation));
  } catch (error: any) {
    console.error('[GET_BOOKING_STATUS_ERROR]', error);
    return fail('Failed to fetch reservation status', 'INTERNAL_ERROR');
  }
}
