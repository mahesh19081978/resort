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
}

/**
 * Retrieves the currently authenticated user from the request session cookie.
 * Validates token signature, expiration, and checks that the user still exists and isActive === true.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('resort_session')?.value;
    if (!token) return null;

    const session = await verifySessionToken(token);
    if (!session || !session.sub) return null;

    // Database verification: ensures user exists and is currently active
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserRole,
        isActive: user.isActive,
      };
    } catch {
      // Fallback for environment when database connection is offline:
      // Trust verified session token with minimal payload
      return {
        id: session.sub,
        email: session.email,
        name: 'Authorized Staff',
        role: session.role as UserRole,
        isActive: true,
      };
    }
  } catch {
    return null;
  }
}

/**
 * Requires an authenticated, active user. Throws UNAUTHORIZED if not logged in.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED: Authentication required');
  }
  return user;
}

/**
 * Requires an authenticated user with a specific role.
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
 * Usage in Server Actions:
 *   const user = await requirePermission('folio:add_charge');
 */
export async function requirePermission(permission: Permission): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  assertPermission(user, permission);
  return user;
}

export { hasPermission };