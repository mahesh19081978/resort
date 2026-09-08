import { SignJWT, jwtVerify } from 'jose';

const MIN_SECRET_LENGTH = 32;

export type BookingTokenScope = 'public_booking_status' | 'public_payment';

function getBookingTokenSecret(): Uint8Array {
  const secret = process.env.BOOKING_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      '[CRITICAL SECURITY CONFIGURATION ERROR] Missing BOOKING_TOKEN_SECRET environment variable. Booking tokens cannot initialize.'
    );
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[CRITICAL SECURITY CONFIGURATION ERROR] BOOKING_TOKEN_SECRET must be at least ${MIN_SECRET_LENGTH} characters long (got ${secret.length}).`
    );
  }

  return new TextEncoder().encode(secret);
}

export interface BookingAccessTokenPayload {
  resId: string;
  resNum: string;
  scope: BookingTokenScope;
  exp?: number;
}

/**
 * Issues a short-lived (30 minutes) scoped access token for public reservation status / payment.
 * Prevents unauthorized enumeration or access using raw CUIDs.
 */
export async function createBookingAccessToken(
  reservationId: string,
  reservationNumber: string,
  scope: BookingTokenScope = 'public_booking_status'
): Promise<string> {
  const secret = getBookingTokenSecret();
  return new SignJWT({
    resId: reservationId,
    resNum: reservationNumber,
    scope,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(reservationId)
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret);
}

/**
 * Verifies a short-lived booking access token with strict signature, expiry, and scope validation.
 */
export async function verifyBookingAccessToken(
  token: string,
  expectedScope: BookingTokenScope
): Promise<BookingAccessTokenPayload | null> {
  try {
    const secret = getBookingTokenSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    if (!payload.resId || typeof payload.resId !== 'string') {
      return null;
    }

    if (!payload.resNum || typeof payload.resNum !== 'string') {
      return null;
    }

    const scope = payload.scope;
    if (scope !== 'public_booking_status' && scope !== 'public_payment') {
      return null;
    }

    if (scope !== expectedScope) {
      return null;
    }

    return {
      resId: payload.resId,
      resNum: payload.resNum,
      scope,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
