import { SignJWT, jwtVerify } from 'jose';

const MIN_SECRET_LENGTH = 32;

/**
 * Validates and retrieves the server-side JWT encryption key.
 * Throws a hard error if AUTH_SECRET is missing or insufficiently long.
 * Never falls back to an insecure default secret.
 */
function getEncodedAuthKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      '[CRITICAL SECURITY CONFIGURATION ERROR] Missing AUTH_SECRET environment variable. Server authentication cannot initialize.'
    );
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[CRITICAL SECURITY CONFIGURATION ERROR] AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters long (got ${secret.length}).`
    );
  }

  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string;             // userId
  email: string;           // Normalized email
  sessionVersion: number;  // Database security version for instant invalidation
  role?: string;           // Optional hint; database User remains authoritative
  iat?: number;
  exp?: number;
}

/**
 * Creates a signed JWT session token with explicit 7-day expiration.
 * Only minimal transport metadata is embedded.
 */
export async function createSessionToken(payload: {
  sub: string;
  email: string;
  sessionVersion: number;
  role?: string;
}): Promise<string> {
  const encodedKey = getEncodedAuthKey();

  return new SignJWT({
    sub: payload.sub,
    email: payload.email,
    sessionVersion: payload.sessionVersion,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey);
}

/**
 * Verifies the JWT signature and expiration.
 * Returns decoded payload if valid, or null if tampered/expired.
 * Throws if AUTH_SECRET is missing or invalid.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const encodedKey = getEncodedAuthKey();
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });

    if (!payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    return {
      sub: payload.sub,
      email: (payload.email as string) || '',
      sessionVersion: typeof payload.sessionVersion === 'number' ? payload.sessionVersion : 1,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    // If it's a configuration error regarding AUTH_SECRET, rethrow so it's not swallowed as an invalid token
    if (error instanceof Error && error.message.includes('[CRITICAL SECURITY CONFIGURATION ERROR]')) {
      throw error;
    }
    return null;
  }
}

// Backward-compatible alias for existing callers
export const encryptSession = async (payload: { userId: string; email: string; role: string }): Promise<string> => {
  return createSessionToken({ sub: payload.userId, email: payload.email, sessionVersion: 1, role: payload.role });
};

export const verifySession = async (token: string) => {
  const verified = await verifySessionToken(token);
  if (!verified) return null;
  return {
    userId: verified.sub,
    email: verified.email,
    role: verified.role,
  };
};