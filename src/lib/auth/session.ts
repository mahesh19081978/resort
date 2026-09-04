import { SignJWT, jwtVerify } from 'jose';

const secretKey = process.env.AUTH_SECRET || 'resort_default_jwt_secret_min_32_characters_long';
const encodedKey = new TextEncoder().encode(secretKey);

export interface SessionPayload {
  sub: string;        // userId
  email: string;      // Normalized email
  role: string;       // UserRole code
  sessionVersion?: number;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

/**
 * Creates a signed JWT session token with explicit 7-day expiration.
 * Stores only minimal identity indicators (userId, email, role).
 */
export async function createSessionToken(payload: { sub: string; email: string; role: string; sessionVersion?: number }): Promise<string> {
  return new SignJWT({ sub: payload.sub, email: payload.email, role: payload.role, sessionVersion: payload.sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey);
}

/**
 * Verifies the JWT signature and expiration.
 * Returns decoded payload if valid, or null if tampered/expired.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
      sessionVersion: payload.sessionVersion as number | undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

// Backward-compatible alias for Phase 0.1 callers
export const encryptSession = async (payload: { userId: string; email: string; role: string }): Promise<string> => {
  return createSessionToken({ sub: payload.userId, email: payload.email, role: payload.role });
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