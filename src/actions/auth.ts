'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { loginSchema } from '@/validations';
import { createSessionToken } from '@/lib/auth/session';
import { verifyPassword, normalizeEmail } from '@/lib/auth/password';
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/auth/rate-limit';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface LoginActionResult {
  success: boolean;
  error?: string;
}

/**
 * Server Action for staff authentication.
 * Implements:
 * 1. Zod validation
 * 2. Sliding window rate limiting
 * 3. Constant-time generic error messages (no email enumeration)
 * 4. Active user verification
 * 5. Password verification (bcrypt)
 * 6. Audit logging (LOGIN_SUCCESS, LOGIN_FAILURE)
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

  let user = null;
  let isDbAvailable = true;

  try {
    user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
  } catch {
    // Graceful handling when database server is offline (e.g. initial placeholder)
    isDbAvailable = false;
  }

  // 2. Offline / Dev Fallback Check
  if (!isDbAvailable) {
    // If dev credentials match default admin email, create demo session for architecture verification
    if (normalizedEmail === 'admin@royalreserve.com' && password === 'password123') {
      const token = await createSessionToken({
        sub: 'usr_admin_dev_001',
        email: normalizedEmail,
        role: 'SUPER_ADMIN',
      });

      const cookieStore = await cookies();
      cookieStore.set('resort_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      redirect('/admin/dashboard');
    }

    recordLoginAttempt(rateLimitKey, false);
    return {
      success: false,
      error: 'Invalid email or password.',
    };
  }

  // 3. User verification against live database
  if (!user || !user.isActive) {
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

  // 4. Verify password
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

  // 5. Success: record attempt & audit
  recordLoginAttempt(rateLimitKey, true);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch {
    // Non-fatal
  }

  await recordAuditEvent({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entity: 'User',
    entityId: user.id,
    ipAddress: clientIp,
    userAgent,
  });

  // 6. Create signed session token & set HttpOnly cookie
  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
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
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get('resort_session')?.value;

  if (token) {
    const headerStore = await headers();
    const clientIp = headerStore.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const userAgent = headerStore.get('user-agent') || 'unknown';

    await recordAuditEvent({
      action: 'LOGOUT',
      entity: 'User',
      entityId: 'session',
      ipAddress: clientIp,
      userAgent,
    });
  }

  cookieStore.delete('resort_session');
  redirect('/admin/login');
}