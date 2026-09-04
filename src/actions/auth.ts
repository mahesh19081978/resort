'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { loginSchema } from '@/validations';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';
import { verifyPassword, normalizeEmail, DUMMY_BCRYPT_HASH } from '@/lib/auth/password';
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/auth/rate-limit';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface LoginActionResult {
  success: boolean;
  error?: string;
}

/**
 * Server Action for staff authentication.
 * Production Security Rules:
 * 1. Zod input validation
 * 2. Sliding window brute-force protection
 * 3. Constant-time dummy verification against timing leakage
 * 4. STRICT FAIL-CLOSED: If database is unavailable, login fails with safe generic error
 * 5. NO credential or offline fallbacks
 * 6. Audit logging of all security events
 * 7. Secure HttpOnly session cookie
 */
export async function loginAction(
  prevState: LoginActionResult | null,
  formData: FormData
): Promise<LoginActionResult> {
  const rawEmail = formData.get('email')?.toString() || '';
  const password = formData.get('password')?.toString() || '';

  const parsed = loginSchema.safeParse({ email: rawEmail, password });
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please enter a valid email and password (minimum 8 characters).',
    };
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const headerStore = await headers();
  const clientIp = headerStore.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const userAgent = headerStore.get('user-agent') || 'unknown';

  // 1. Rate Limiting Check
  const rateLimitKey = `${clientIp}:${normalizedEmail}`;
  const rateLimitStatus = checkLoginRateLimit(rateLimitKey);
  if (!rateLimitStatus.allowed) {
    await recordAuditEvent({
      action: 'LOGIN_RATE_LIMITED',
      entity: 'User',
      entityId: normalizedEmail,
      ipAddress: clientIp,
      userAgent,
      newValues: { retryAfterSeconds: rateLimitStatus.retryAfterSeconds },
    });
    return {
      success: false,
      error: `Too many login attempts. Please try again in ${rateLimitStatus.retryAfterSeconds} seconds.`,
    };
  }

  // 2. Query user from PostgreSQL (Strict Fail-Closed)
  let user = null;
  try {
    user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
  } catch (dbError) {
    // Database unreachable or connection failed: fail closed immediately
    recordLoginAttempt(rateLimitKey, false);
    await recordAuditEvent({
      action: 'LOGIN_SYSTEM_ERROR',
      entity: 'User',
      entityId: normalizedEmail,
      ipAddress: clientIp,
      userAgent,
      newValues: { error: 'Database query failed during authentication' },
    });

    return {
      success: false,
      error: 'Authentication service temporarily unavailable. Please contact the system administrator.',
    };
  }

  // 3. User Existence & Password Verification with Timing Hardening
  if (!user || !user.isActive) {
    // Perform dummy bcrypt comparison to neutralize response timing discrepancy between existing & nonexistent users
    await verifyPassword(password, DUMMY_BCRYPT_HASH);

    recordLoginAttempt(rateLimitKey, false);
    await recordAuditEvent({
      action: 'LOGIN_FAILURE',
      entity: 'User',
      entityId: normalizedEmail,
      ipAddress: clientIp,
      userAgent,
      newValues: { reason: !user ? 'USER_NOT_FOUND' : 'USER_INACTIVE' },
    });

    return {
      success: false,
      error: 'Invalid email or password.',
    };
  }

  // 4. Verify password against stored hash
  const isValidPassword = await verifyPassword(password, user.passwordHash);
  if (!isValidPassword) {
    recordLoginAttempt(rateLimitKey, false);
    await recordAuditEvent({
      userId: user.id,
      action: 'LOGIN_FAILURE',
      entity: 'User',
      entityId: user.id,
      ipAddress: clientIp,
      userAgent,
      newValues: { reason: 'INVALID_PASSWORD' },
    });

    return {
      success: false,
      error: 'Invalid email or password.',
    };
  }

  // 5. Successful Authentication
  recordLoginAttempt(rateLimitKey, true);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch {
    // Non-fatal if update fails
  }

  await recordAuditEvent({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entity: 'User',
    entityId: user.id,
    ipAddress: clientIp,
    userAgent,
  });

  // 6. Create signed session token with current sessionVersion
  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    sessionVersion: user.sessionVersion,
    role: user.role,
  });

  const cookieStore = await cookies();
  cookieStore.set('resort_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  redirect('/admin/dashboard');
}

/**
 * Server Action for staff logout.
 * Resolves user identity from session before clearing cookie.
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get('resort_session')?.value;

  if (token) {
    let sessionUserId = 'session';
    try {
      const session = await verifySessionToken(token);
      if (session && session.sub) {
        sessionUserId = session.sub;
      }
    } catch {
      // Non-fatal if verification fails
    }

    const headerStore = await headers();
    const clientIp = headerStore.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const userAgent = headerStore.get('user-agent') || 'unknown';

    await recordAuditEvent({
      userId: sessionUserId !== 'session' ? sessionUserId : undefined,
      action: 'LOGOUT',
      entity: 'User',
      entityId: sessionUserId,
      ipAddress: clientIp,
      userAgent,
    });
  }

  cookieStore.delete('resort_session');
  redirect('/admin/login');
}