'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireAuth } from '@/lib/auth/auth';
import { hasPermission, UserRole } from '@/lib/permissions/rbac';
import {
  getAccessKpis,
  getStaffUsers,
  getRolesWithStats,
  getPermissionMatrix,
  getSecurityAuditLogs,
  createStaffUser,
  updateStaffUser,
  toggleStaffUserStatus,
  changeStaffUserRole,
  revokeStaffUserSessions,
  updateRolePermissions,
  AccessKpis,
  StaffUserItem,
  RoleStatItem,
  PermissionMatrixModule,
  SecurityAuditItem,
} from '@/lib/access/access-service';
import {
  createStaffUserSchema,
  updateStaffUserSchema,
  changeUserRoleSchema,
  toggleUserStatusSchema,
  revokeUserSessionsSchema,
  updateRolePermissionsSchema,
} from '@/validations/access';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Validates that the active user has at least one of the access view permissions:
 * 'user:manage', 'role:manage', or 'audit:read'.
 */
export async function verifyAccessConsoleAuthorization() {
  const user = await requireAuth();
  const canAccess =
    hasPermission(user, 'user:manage') ||
    hasPermission(user, 'role:manage') ||
    hasPermission(user, 'audit:read');

  if (!canAccess) {
    throw new Error('FORBIDDEN: Requires user:manage, role:manage, or audit:read permission.');
  }

  return user;
}

/**
 * Fetches the entire console initial data payload.
 */
export async function getAccessConsoleDataAction(): Promise<
  ActionResponse<{
    kpis: AccessKpis;
    users: StaffUserItem[];
    totalUsers: number;
    roles: RoleStatItem[];
    matrix: PermissionMatrixModule[];
    auditLogs: SecurityAuditItem[];
    currentUserPermissions: {
      canManageUsers: boolean;
      canManageRoles: boolean;
      canReadAudit: boolean;
    };
  }>
> {
  try {
    const user = await verifyAccessConsoleAuthorization();

    const [kpis, usersData, roles, matrix, auditLogs] = await Promise.all([
      getAccessKpis(),
      getStaffUsers(),
      getRolesWithStats(),
      getPermissionMatrix(),
      getSecurityAuditLogs({ limit: 50 }),
    ]);

    return {
      success: true,
      data: {
        kpis,
        users: usersData.users,
        totalUsers: usersData.total,
        roles,
        matrix,
        auditLogs,
        currentUserPermissions: {
          canManageUsers: hasPermission(user, 'user:manage'),
          canManageRoles: hasPermission(user, 'role:manage'),
          canReadAudit: hasPermission(user, 'audit:read'),
        },
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Searches staff users with filter criteria.
 * Gated by 'user:manage' or console authorization.
 */
export async function searchStaffUsersAction(params: {
  query?: string;
  role?: UserRole | 'ALL';
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  take?: number;
  skip?: number;
}): Promise<ActionResponse<{ users: StaffUserItem[]; total: number }>> {
  try {
    await verifyAccessConsoleAuthorization();
    const result = await getStaffUsers(params);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Creates a new staff user.
 * Gated strictly by 'user:manage'.
 */
export async function createStaffUserAction(
  formData: unknown
): Promise<ActionResponse<StaffUserItem>> {
  try {
    const actor = await requirePermission('user:manage');
    const parsed = createStaffUserSchema.parse(formData);

    const created = await createStaffUser(parsed, actor.id);
    revalidatePath('/admin/access');
    return { success: true, data: created };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Updates an existing staff user.
 * Gated strictly by 'user:manage'.
 */
export async function updateStaffUserAction(
  formData: unknown
): Promise<ActionResponse<StaffUserItem>> {
  try {
    const actor = await requirePermission('user:manage');
    const parsed = updateStaffUserSchema.parse(formData);

    const updated = await updateStaffUser(parsed, actor.id);
    revalidatePath('/admin/access');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Toggles a staff user's active status.
 * Gated strictly by 'user:manage'.
 */
export async function toggleStaffUserStatusAction(
  formData: unknown
): Promise<ActionResponse<StaffUserItem>> {
  try {
    const actor = await requirePermission('user:manage');
    const parsed = toggleUserStatusSchema.parse(formData);

    const updated = await toggleStaffUserStatus(parsed.userId, parsed.isActive, actor.id);
    revalidatePath('/admin/access');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Changes a staff user's role.
 * Gated strictly by 'user:manage'.
 */
export async function changeStaffUserRoleAction(
  formData: unknown
): Promise<ActionResponse<StaffUserItem>> {
  try {
    const actor = await requirePermission('user:manage');
    const parsed = changeUserRoleSchema.parse(formData);

    const updated = await changeStaffUserRole(parsed.userId, parsed.newRole, actor.id);
    revalidatePath('/admin/access');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Revokes all sessions for a staff user.
 * Gated strictly by 'user:manage'.
 */
export async function revokeStaffUserSessionsAction(
  formData: unknown
): Promise<ActionResponse<{ success: boolean; sessionVersion: number }>> {
  try {
    const actor = await requirePermission('user:manage');
    const parsed = revokeUserSessionsSchema.parse(formData);

    const result = await revokeStaffUserSessions(parsed.userId, actor.id);
    revalidatePath('/admin/access');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Updates role permissions in the database.
 * Gated strictly by 'role:manage'.
 */
export async function updateRolePermissionsAction(
  formData: unknown
): Promise<ActionResponse<{ success: boolean; added: string[]; removed: string[] }>> {
  try {
    const actor = await requirePermission('role:manage');
    const parsed = updateRolePermissionsSchema.parse(formData);

    const result = await updateRolePermissions(parsed.roleCode, parsed.permissionCodes, actor.id);
    revalidatePath('/admin/access');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
