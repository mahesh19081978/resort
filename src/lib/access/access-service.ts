import { prisma } from '@/lib/db/prisma';
import { UserRole, Permission, ROLE_PERMISSIONS } from '@/lib/permissions/rbac';
import { assertSuperAdminInvariant } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';
import { hashPassword } from '@/lib/auth/password';
import { Prisma } from '@prisma/client';

export interface AccessKpis {
  totalStaffUsers: number;
  activeUsers: number;
  totalRoles: number;
  securityEventsToday: number;
}

export interface StaffUserItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleEntityId: string | null;
  isActive: boolean;
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface RoleStatItem {
  id: string;
  name: string;
  code: UserRole;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
  permissions: string[];
}

export interface PermissionMatrixModule {
  module: string;
  label: string;
  permissions: {
    code: string;
    description: string | null;
    roles: Record<UserRole, boolean>;
  }[];
}

export interface SecurityAuditItem {
  id: string;
  timestamp: Date;
  actor: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null;
  action: string;
  entity: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

// Module human labels for display
const MODULE_LABELS: Record<string, string> = {
  BOOKING: 'Front Desk & Reservations',
  PMS: 'Rooms & PMS Operations',
  FOLIO: 'Guest Folio & Billing',
  GUEST: 'Guest Database & Profiles',
  RESTAURANT: 'Restaurant POS & Kitchen',
  INVENTORY: 'Inventory & Stock Management',
  PROCUREMENT: 'Procurement & Vendors',
  ADMIN: 'Administration & Staff Management',
  REPORTS: 'Reports & Auditing',
  SETTINGS: 'Settings & Configuration',
  CONTENT: 'Content Management',
};

/**
 * Retrieves live database KPIs for the RBAC console.
 * Strictly uses database queries - no hardcoding.
 */
export async function getAccessKpis(): Promise<AccessKpis> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [totalStaffUsers, activeUsers, totalRoles, securityEventsToday] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.role.count(),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startOfDay },
      },
    }),
  ]);

  return {
    totalStaffUsers,
    activeUsers,
    totalRoles,
    securityEventsToday,
  };
}

/**
 * Retrieves staff users with flexible filtering and sorting.
 * Strips passwordHash completely to prevent accidental exposure.
 */
export async function getStaffUsers(params?: {
  query?: string;
  role?: UserRole | 'ALL';
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  take?: number;
  skip?: number;
}): Promise<{ users: StaffUserItem[]; total: number }> {
  const where: Prisma.UserWhereInput = {};

  if (params?.query && params.query.trim()) {
    const q = params.query.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (params?.role && params.role !== 'ALL') {
    where.role = params.role;
  }

  if (params?.status && params.status !== 'ALL') {
    where.isActive = params.status === 'ACTIVE';
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleEntityId: true,
        isActive: true,
        sessionVersion: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      take: params?.take || 100,
      skip: params?.skip || 0,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => ({
      ...u,
      role: u.role as UserRole,
    })),
    total,
  };
}

/**
 * Retrieves all approved roles with database user counts and permissions.
 */
export async function getRolesWithStats(): Promise<RoleStatItem[]> {
  const roles = await prisma.role.findMany({
    include: {
      users: { select: { id: true } },
      permissions: {
        include: {
          permission: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return roles.map((r) => {
    // If DB role permissions exist, use them; otherwise fallback to code's ROLE_PERMISSIONS
    const dbPermissions = r.permissions.map((p) => p.permission.code);
    const codePermissions = ROLE_PERMISSIONS[r.code as UserRole] || [];
    const effectivePermissions = dbPermissions.length > 0 ? dbPermissions : Array.from(codePermissions);

    return {
      id: r.id,
      name: r.name,
      code: r.code as UserRole,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r.users.length,
      permissionCount: effectivePermissions.length,
      permissions: effectivePermissions,
    };
  });
}

/**
 * Builds the comprehensive Permission Matrix grouped by domain module.
 */
export async function getPermissionMatrix(): Promise<PermissionMatrixModule[]> {
  // Query all permissions from DB
  const dbPermissions = await prisma.permission.findMany({
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
    orderBy: [{ module: 'asc' }, { code: 'asc' }],
  });

  // Group by module
  const moduleMap = new Map<string, PermissionMatrixModule>();

  for (const perm of dbPermissions) {
    const mod = perm.module || 'ADMIN';
    if (!moduleMap.has(mod)) {
      moduleMap.set(mod, {
        module: mod,
        label: MODULE_LABELS[mod] || mod,
        permissions: [],
      });
    }

    // Determine which roles have this permission
    const rolesWithPerm: Record<UserRole, boolean> = {
      SUPER_ADMIN: false,
      ADMIN: false,
      RECEPTIONIST: false,
      RESTAURANT_MANAGER: false,
      RESTAURANT_BILLER: false,
      KITCHEN_STAFF: false,
      STORE_MANAGER: false,
      PURCHASE_MANAGER: false,
      CONTENT_MANAGER: false,
    };

    // 1. Check DB RolePermission relations
    for (const rp of perm.roles) {
      const rCode = rp.role.code as UserRole;
      if (rCode in rolesWithPerm) {
        rolesWithPerm[rCode] = true;
      }
    }

    // 2. Fallback to ROLE_PERMISSIONS constant if DB doesn't have mappings populated
    const rolesList = Object.keys(rolesWithPerm) as UserRole[];
    for (const roleCode of rolesList) {
      if (!rolesWithPerm[roleCode]) {
        const allowed = ROLE_PERMISSIONS[roleCode]?.includes(perm.code as Permission) ?? false;
        if (allowed) {
          rolesWithPerm[roleCode] = true;
        }
      }
    }

    moduleMap.get(mod)!.permissions.push({
      code: perm.code,
      description: perm.description,
      roles: rolesWithPerm,
    });
  }

  return Array.from(moduleMap.values());
}

/**
 * Retrieves security and RBAC audit events with actor data.
 */
export async function getSecurityAuditLogs(params?: {
  limit?: number;
}): Promise<SecurityAuditItem[]> {
  const limit = params?.limit || 50;

  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'User' },
        { entity: 'Role' },
        { entity: 'RolePermission' },
        { action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_CHANGE', 'ROLE_ASSIGN'] } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs.map((log) => ({
    id: log.id,
    timestamp: log.createdAt,
    actor: log.user
      ? {
          id: log.user.id,
          name: log.user.name,
          email: log.user.email,
          role: log.user.role as UserRole,
        }
      : null,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    oldValues: (log.oldValues as Record<string, unknown>) || null,
    newValues: (log.newValues as Record<string, unknown>) || null,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
  }));
}

/**
 * Creates a new staff user inside a transaction with audit logging.
 */
export async function createStaffUser(
  data: {
    name: string;
    email: string;
    role: UserRole;
    password: string;
    isActive: boolean;
  },
  actorId: string
): Promise<StaffUserItem> {
  const normalizedEmail = data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    throw new Error('A user with this email address already exists.');
  }

  const roleRecord = await prisma.role.findUnique({
    where: { code: data.role },
  });

  const passwordHash = await hashPassword(data.password);

  const newUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        role: data.role,
        roleEntityId: roleRecord?.id || null,
        passwordHash,
        isActive: data.isActive,
        sessionVersion: 1,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleEntityId: true,
        isActive: true,
        sessionVersion: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await recordAuditEvent(
      {
        userId: actorId,
        action: 'STAFF_USER_CREATED',
        entity: 'User',
        entityId: user.id,
        newValues: {
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      },
      tx
    );

    return user;
  });

  return {
    ...newUser,
    role: newUser.role as UserRole,
  };
}

/**
 * Updates a staff user (name, email, role, active status).
 * Enforces Super Admin invariant transactionally.
 * Increments sessionVersion if role or active status changes.
 */
export async function updateStaffUser(
  data: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  },
  actorId: string
): Promise<StaffUserItem> {
  const normalizedEmail = data.email.trim().toLowerCase();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new Error('Staff user not found.');
    }

    // Check email clash if modified
    if (existing.email.toLowerCase() !== normalizedEmail) {
      const emailClash = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (emailClash && emailClash.id !== data.id) {
        throw new Error('Another user with this email address already exists.');
      }
    }

    // Super Admin Invariant Check
    await assertSuperAdminInvariant(data.id, data.role, data.isActive, tx);

    const roleRecord = await tx.role.findUnique({
      where: { code: data.role },
    });

    // Invalidate sessions if role changed or account deactivated
    const shouldInvalidateSession =
      existing.role !== data.role || (existing.isActive && !data.isActive);
    const newSessionVersion = shouldInvalidateSession
      ? existing.sessionVersion + 1
      : existing.sessionVersion;

    const updated = await tx.user.update({
      where: { id: data.id },
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        role: data.role,
        roleEntityId: roleRecord?.id || null,
        isActive: data.isActive,
        sessionVersion: newSessionVersion,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleEntityId: true,
        isActive: true,
        sessionVersion: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await recordAuditEvent(
      {
        userId: actorId,
        action: 'STAFF_USER_UPDATED',
        entity: 'User',
        entityId: updated.id,
        oldValues: {
          name: existing.name,
          email: existing.email,
          role: existing.role,
          isActive: existing.isActive,
        },
        newValues: {
          name: updated.name,
          email: updated.email,
          role: updated.role,
          isActive: updated.isActive,
          sessionVersionIncremented: shouldInvalidateSession,
        },
      },
      tx
    );

    return updated;
  });

  return {
    ...result,
    role: result.role as UserRole,
  };
}

/**
 * Toggles a user's active status.
 * Enforces Super Admin invariant transactionally.
 * Increments sessionVersion when deactivating.
 */
export async function toggleStaffUserStatus(
  userId: string,
  isActive: boolean,
  actorId: string
): Promise<StaffUserItem> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new Error('Staff user not found.');
    }

    // Check invariant if deactivating
    if (!isActive) {
      await assertSuperAdminInvariant(userId, undefined, false, tx);
    }

    const newSessionVersion = !isActive ? existing.sessionVersion + 1 : existing.sessionVersion;

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        isActive,
        sessionVersion: newSessionVersion,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleEntityId: true,
        isActive: true,
        sessionVersion: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await recordAuditEvent(
      {
        userId: actorId,
        action: isActive ? 'STAFF_USER_ACTIVATED' : 'STAFF_USER_DEACTIVATED',
        entity: 'User',
        entityId: updated.id,
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: updated.isActive, sessionVersion: updated.sessionVersion },
      },
      tx
    );

    return updated;
  });

  return {
    ...result,
    role: result.role as UserRole,
  };
}

/**
 * Changes a staff user's role.
 * Enforces Super Admin invariant transactionally.
 * Increments sessionVersion to force re-authentication.
 */
export async function changeStaffUserRole(
  userId: string,
  newRole: UserRole,
  actorId: string
): Promise<StaffUserItem> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new Error('Staff user not found.');
    }

    await assertSuperAdminInvariant(userId, newRole, undefined, tx);

    const roleRecord = await tx.role.findUnique({
      where: { code: newRole },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        role: newRole,
        roleEntityId: roleRecord?.id || null,
        sessionVersion: existing.sessionVersion + 1,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleEntityId: true,
        isActive: true,
        sessionVersion: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await recordAuditEvent(
      {
        userId: actorId,
        action: 'ROLE_ASSIGN',
        entity: 'User',
        entityId: updated.id,
        oldValues: { role: existing.role },
        newValues: { role: updated.role, sessionVersion: updated.sessionVersion },
      },
      tx
    );

    return updated;
  });

  return {
    ...result,
    role: result.role as UserRole,
  };
}

/**
 * Revokes all active sessions for a staff user by incrementing sessionVersion.
 */
export async function revokeStaffUserSessions(
  userId: string,
  actorId: string
): Promise<{ success: boolean; sessionVersion: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new Error('Staff user not found.');
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        sessionVersion: existing.sessionVersion + 1,
      },
      select: {
        id: true,
        sessionVersion: true,
      },
    });

    await recordAuditEvent(
      {
        userId: actorId,
        action: 'USER_SESSIONS_REVOKED',
        entity: 'User',
        entityId: updated.id,
        oldValues: { sessionVersion: existing.sessionVersion },
        newValues: { sessionVersion: updated.sessionVersion },
      },
      tx
    );

    return updated;
  });

  return {
    success: true,
    sessionVersion: result.sessionVersion,
  };
}

/**
 * Updates permissions for a specific role.
 * Validates permission IDs and audits the changes (added and removed permissions).
 */
export async function updateRolePermissions(
  roleCode: UserRole,
  newPermissionCodes: string[],
  actorId: string
): Promise<{ success: boolean; added: string[]; removed: string[] }> {
  const result = await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { code: roleCode },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new Error(`Role ${roleCode} not found in database.`);
    }

    // Fetch valid permissions from DB
    const allDbPermissions = await tx.permission.findMany({
      where: { code: { in: newPermissionCodes } },
    });

    const validPermissionMap = new Map(allDbPermissions.map((p) => [p.code, p.id]));
    const invalidCodes = newPermissionCodes.filter((code) => !validPermissionMap.has(code));
    if (invalidCodes.length > 0) {
      throw new Error(`Invalid permission codes submitted: ${invalidCodes.join(', ')}`);
    }

    const currentPermissionCodes = new Set(role.permissions.map((rp) => rp.permission.code));
    const targetPermissionCodes = new Set(newPermissionCodes);

    const added = newPermissionCodes.filter((code) => !currentPermissionCodes.has(code));
    const removed = Array.from(currentPermissionCodes).filter((code) => !targetPermissionCodes.has(code));

    // Remove permissions that are no longer assigned
    if (removed.length > 0) {
      const permsToRemove = await tx.permission.findMany({
        where: { code: { in: removed } },
        select: { id: true },
      });
      const permIdsToRemove = permsToRemove.map((p) => p.id);

      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: { in: permIdsToRemove },
        },
      });
    }

    // Add newly assigned permissions in a single fast batch
    if (added.length > 0) {
      const recordsToCreate: { roleId: string; permissionId: string }[] = [];
      for (const code of added) {
        const permId = validPermissionMap.get(code);
        if (permId) {
          recordsToCreate.push({
            roleId: role.id,
            permissionId: permId,
          });
        }
      }

      if (recordsToCreate.length > 0) {
        await tx.rolePermission.createMany({
          data: recordsToCreate,
          skipDuplicates: true,
        });
      }
    }

    await recordAuditEvent(
      {
        userId: actorId,
        action: 'ROLE_PERMISSIONS_UPDATED',
        entity: 'Role',
        entityId: role.id,
        newValues: {
          role: role.code,
          addedPermissions: added,
          removedPermissions: removed,
          totalAssigned: targetPermissionCodes.size,
        },
      },
      tx
    );

    return { added, removed };
  });

  return {
    success: true,
    added: result.added,
    removed: result.removed,
  };
}
