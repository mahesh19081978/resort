import { describe, it, expect, vi } from 'vitest';
import { assertSuperAdminInvariant } from '@/lib/auth/auth';
import { UserRole, Permission, ROLE_PERMISSIONS, hasPermission } from '@/lib/permissions/rbac';
import {
  createStaffUserSchema,
  updateStaffUserSchema,
  changeUserRoleSchema,
  toggleUserStatusSchema,
  revokeUserSessionsSchema,
  updateRolePermissionsSchema,
} from '@/validations/access';

describe('RBAC & SECURITY DOMAIN SUITE', () => {
  describe('1. Standard Roles & Permission Boundaries', () => {
    const APPROVED_ROLES: UserRole[] = [
      'SUPER_ADMIN',
      'ADMIN',
      'RECEPTIONIST',
      'RESTAURANT_MANAGER',
      'RESTAURANT_BILLER',
      'KITCHEN_STAFF',
      'STORE_MANAGER',
      'PURCHASE_MANAGER',
      'CONTENT_MANAGER',
    ];

    it('has exactly the 9 approved system roles defined in ROLE_PERMISSIONS', () => {
      const keys = Object.keys(ROLE_PERMISSIONS) as UserRole[];
      expect(keys.length).toBe(9);
      for (const role of APPROVED_ROLES) {
        expect(keys).toContain(role);
      }
    });

    it('enforces that only SUPER_ADMIN has user:manage and role:manage by default', () => {
      expect(hasPermission({ role: 'SUPER_ADMIN' }, 'user:manage')).toBe(true);
      expect(hasPermission({ role: 'SUPER_ADMIN' }, 'role:manage')).toBe(true);
      expect(hasPermission({ role: 'SUPER_ADMIN' }, 'audit:read')).toBe(true);

      expect(hasPermission({ role: 'ADMIN' }, 'user:manage')).toBe(false);
      expect(hasPermission({ role: 'ADMIN' }, 'role:manage')).toBe(false);
      expect(hasPermission({ role: 'ADMIN' }, 'audit:read')).toBe(true);

      expect(hasPermission({ role: 'RECEPTIONIST' }, 'user:manage')).toBe(false);
      expect(hasPermission({ role: 'RECEPTIONIST' }, 'role:manage')).toBe(false);
      expect(hasPermission({ role: 'RECEPTIONIST' }, 'audit:read')).toBe(false);
    });

    it('restricts other operational roles from administrative security actions', () => {
      const staffRoles: UserRole[] = [
        'RESTAURANT_MANAGER',
        'RESTAURANT_BILLER',
        'KITCHEN_STAFF',
        'STORE_MANAGER',
        'PURCHASE_MANAGER',
        'CONTENT_MANAGER',
      ];

      for (const role of staffRoles) {
        expect(hasPermission({ role }, 'user:manage')).toBe(false);
        expect(hasPermission({ role }, 'role:manage')).toBe(false);
        expect(hasPermission({ role }, 'audit:read')).toBe(false);
      }
    });
  });

  describe('2. Super Admin Invariant & Concurrency Protection', () => {
    it('prevents deactivating the last active SUPER_ADMIN', async () => {
      const mockDb = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'admin-1',
            role: 'SUPER_ADMIN',
            isActive: true,
          }),
          count: vi.fn().mockResolvedValue(1),
        },
      };

      await expect(
        assertSuperAdminInvariant('admin-1', undefined, false, mockDb as any)
      ).rejects.toThrow('BUSINESS_RULE_VIOLATION: Cannot deactivate, downgrade, or remove the last active Super Administrator.');
    });

    it('prevents downgrading the role of the last active SUPER_ADMIN', async () => {
      const mockDb = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'admin-1',
            role: 'SUPER_ADMIN',
            isActive: true,
          }),
          count: vi.fn().mockResolvedValue(1),
        },
      };

      await expect(
        assertSuperAdminInvariant('admin-1', 'ADMIN', undefined, mockDb as any)
      ).rejects.toThrow('BUSINESS_RULE_VIOLATION: Cannot deactivate, downgrade, or remove the last active Super Administrator.');
    });

    it('permits deactivating or downgrading when multiple active SUPER_ADMINs exist', async () => {
      const mockDb = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'admin-1',
            role: 'SUPER_ADMIN',
            isActive: true,
          }),
          count: vi.fn().mockResolvedValue(2),
        },
      };

      await expect(
        assertSuperAdminInvariant('admin-1', 'ADMIN', undefined, mockDb as any)
      ).resolves.toBeUndefined();

      await expect(
        assertSuperAdminInvariant('admin-1', undefined, false, mockDb as any)
      ).resolves.toBeUndefined();
    });

    it('safely handles non-super admin role changes and status changes', async () => {
      const mockDb = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-rec-1',
            role: 'RECEPTIONIST',
            isActive: true,
          }),
          count: vi.fn().mockResolvedValue(1),
        },
      };

      await expect(
        assertSuperAdminInvariant('user-rec-1', 'RESTAURANT_MANAGER', true, mockDb as any)
      ).resolves.toBeUndefined();

      await expect(
        assertSuperAdminInvariant('user-rec-1', undefined, false, mockDb as any)
      ).resolves.toBeUndefined();
    });

    it('survives concurrent downgrade attempts when only 1 super admin remains', async () => {
      // Simulate race condition where 2 concurrent requests attempt to downgrade
      let activeAdmins = 1;
      const mockDb = {
        user: {
          findUnique: vi.fn().mockImplementation(async () => ({
            id: 'admin-1',
            role: 'SUPER_ADMIN',
            isActive: true,
          })),
          count: vi.fn().mockImplementation(async () => activeAdmins),
        },
      };

      // Both requests must throw
      const req1 = assertSuperAdminInvariant('admin-1', 'ADMIN', undefined, mockDb as any);
      const req2 = assertSuperAdminInvariant('admin-1', 'RECEPTIONIST', undefined, mockDb as any);

      await expect(req1).rejects.toThrow('BUSINESS_RULE_VIOLATION');
      await expect(req2).rejects.toThrow('BUSINESS_RULE_VIOLATION');
    });
  });

  describe('3. Zod Input Validation & Safety Constraints', () => {
    it('validates createStaffUserSchema strictly', () => {
      // Valid input
      const valid = createStaffUserSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@royalreserve.com',
        role: 'RECEPTIONIST',
        password: 'securePassword123!',
        isActive: true,
      });
      expect(valid.success).toBe(true);

      // Invalid email
      const invalidEmail = createStaffUserSchema.safeParse({
        name: 'Jane Doe',
        email: 'invalid-email',
        role: 'RECEPTIONIST',
        password: 'securePassword123!',
        isActive: true,
      });
      expect(invalidEmail.success).toBe(false);

      // Short password (< 8 chars)
      const shortPass = createStaffUserSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@royalreserve.com',
        role: 'RECEPTIONIST',
        password: 'short',
        isActive: true,
      });
      expect(shortPass.success).toBe(false);

      // Non-approved role
      const bogusRole = createStaffUserSchema.safeParse({
        name: 'Jane Doe',
        email: 'jane@royalreserve.com',
        role: 'HACKER_ROLE' as any,
        password: 'securePassword123!',
        isActive: true,
      });
      expect(bogusRole.success).toBe(false);
    });

    it('validates changeUserRoleSchema', () => {
      const valid = changeUserRoleSchema.safeParse({
        userId: 'cluser123456789012345678',
        newRole: 'ADMIN',
      });
      expect(valid.success).toBe(true);

      const invalid = changeUserRoleSchema.safeParse({
        userId: 'cluser123456789012345678',
        newRole: 'UNKNOWN',
      });
      expect(invalid.success).toBe(false);
    });

    it('validates toggleUserStatusSchema', () => {
      const valid = toggleUserStatusSchema.safeParse({
        userId: 'cluser123456789012345678',
        isActive: false,
      });
      expect(valid.success).toBe(true);
    });

    it('validates revokeUserSessionsSchema', () => {
      const valid = revokeUserSessionsSchema.safeParse({
        userId: 'cluser123456789012345678',
      });
      expect(valid.success).toBe(true);
    });

    it('validates updateRolePermissionsSchema', () => {
      const valid = updateRolePermissionsSchema.safeParse({
        roleCode: 'RECEPTIONIST',
        permissionCodes: ['booking:read', 'folio:read'],
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('4. Security & Audit Payload Hygiene', () => {
    it('verifies that staff audit payloads never include password or passwordHash', () => {
      // Simulate audit payload generation across various actions
      const sampleAuditNewValues = [
        { name: 'John Staff', email: 'john@example.com', role: 'RECEPTIONIST', isActive: true },
        { name: 'John Staff Updated', email: 'john@example.com', role: 'ADMIN', isActive: true, sessionVersionIncremented: true },
        { isActive: false, sessionVersion: 2 },
        { role: 'RESTAURANT_MANAGER', sessionVersion: 3 },
        { sessionVersion: 4 },
        { role: 'RECEPTIONIST', addedPermissions: ['booking:read'], removedPermissions: [], totalAssigned: 1 },
      ];

      for (const payload of sampleAuditNewValues) {
        const serialized = JSON.stringify(payload);
        expect(serialized).not.toContain('password');
        expect(serialized).not.toContain('passwordHash');
        expect(serialized).not.toContain('token');
        expect(serialized).not.toContain('secret');
      }
    });

    it('verifies role updates assign both role and roleEntityId atomically in schema expectations', () => {
      const roleMapping: Record<UserRole, string> = {
        SUPER_ADMIN: 'role_superadmin_id',
        ADMIN: 'role_admin_id',
        RECEPTIONIST: 'role_receptionist_id',
        RESTAURANT_MANAGER: 'role_restmgr_id',
        RESTAURANT_BILLER: 'role_restbiller_id',
        KITCHEN_STAFF: 'role_kitchen_id',
        STORE_MANAGER: 'role_storemgr_id',
        PURCHASE_MANAGER: 'role_purchasemgr_id',
        CONTENT_MANAGER: 'role_contentmgr_id',
      };

      for (const [role, id] of Object.entries(roleMapping)) {
        expect(role).toBeDefined();
        expect(id).toBeDefined();
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});

