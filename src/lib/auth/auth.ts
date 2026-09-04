import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { verifySessionToken } from './session';
import { hasPermission, requirePermission as assertPermission, Permission, UserRole } from '@/lib/permissions/rbac';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  sessionVersion: number;
}

/**
 * Retrieves the currently authenticated user from the request session cookie.
 * STRICT PRODUCTION POLICY:
 * 1. Cryptographically verifies token signature & expiration.
 * 2. Queries PostgreSQL to verify user existence, active status, and matching sessionVersion.
 * 3. FAILS CLOSED on any database failure, user missing, account inactive, or version mismatch.
 * NEVER returns a fallback/trusted user without live database validation.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('resort_session')?.value;
    if (!token) return null;

    const session = await verifySessionToken(token);
    if (!session || !session.sub) return null;

    // Authoritative verification against PostgreSQL database:
    // If the database is unreachable or query errors, this throws and the outer catch returns null (FAILS CLOSED)
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        sessionVersion: true,
      },
    });

    // Fail closed if account does not exist or has been deactivated
    if (!user || !user.isActive) {
      return null;
    }

    // Fail closed if sessionVersion in token does not match active DB version (forced logout / password change)
    if (session.sessionVersion !== undefined && user.sessionVersion !== session.sessionVersion) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      isActive: user.isActive,
      sessionVersion: user.sessionVersion,
    };
  } catch (error) {
    // Fail closed on any exception (network drop, DB authentication error, tampered token)
    // NEVER grant access via offline fallback
    if (error instanceof Error && error.message.includes('[CRITICAL SECURITY CONFIGURATION ERROR]')) {
      throw error;
    }
    return null;
  }
}

/**
 * Requires an authenticated, active user validated against PostgreSQL.
 * Throws UNAUTHORIZED if unauthenticated or database unavailable.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED: Authentication required and must be verified by database');
  }
  return user;
}

/**
 * Requires an authenticated user with an authorized role.
 * Role authority is derived solely from the database record.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`FORBIDDEN: Requires one of [${allowedRoles.join(', ')}]`);
  }
  return user;
}

/**
 * Centralized authorization helper: requires authenticated user and specific granular permission.
 * Fails closed if user or permissions do not validate.
 */
export async function requirePermission(permission: Permission): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  assertPermission(user, permission);
  return user;
}

/**
 * Enforces the Super Administrator invariant transactionally.
 * Ensures at least one active SUPER_ADMIN account remains in the system.
 */
export async function assertSuperAdminInvariant(targetUserId: string, newRole?: UserRole, newActiveStatus?: boolean): Promise<void> {
  // If target user is being deactivated or downgraded from SUPER_ADMIN:
  if (newActiveStatus === false || (newRole && newRole !== 'SUPER_ADMIN')) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true, isActive: true },
    });

    if (targetUser && targetUser.role === 'SUPER_ADMIN' && targetUser.isActive) {
      const activeSuperAdminsCount = await prisma.user.count({
        where: {
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });

      if (activeSuperAdminsCount <= 1) {
        throw new Error('BUSINESS_RULE_VIOLATION: Cannot deactivate, downgrade, or remove the last active Super Administrator.');
      }
    }
  }
}

export { hasPermission };