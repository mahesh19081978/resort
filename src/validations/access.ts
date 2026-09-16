import { z } from 'zod';
import { UserRole } from '@/lib/permissions/rbac';

export const USER_ROLES: [UserRole, ...UserRole[]] = [
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

export const createStaffUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Valid email address is required').max(150),
  role: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Invalid system role selected' }) }),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  isActive: z.boolean().default(true),
});

export const updateStaffUserSchema = z.object({
  id: z.string().cuid('Invalid user ID'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Valid email address is required').max(150),
  role: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Invalid system role selected' }) }),
  isActive: z.boolean(),
});

export const changeUserRoleSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  newRole: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Invalid system role selected' }) }),
});

export const toggleUserStatusSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  isActive: z.boolean(),
});

export const revokeUserSessionsSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
});

export const updateRolePermissionsSchema = z.object({
  roleCode: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Invalid system role' }) }),
  permissionCodes: z.array(z.string().min(1)),
});

export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;
export type UpdateStaffUserInput = z.infer<typeof updateStaffUserSchema>;
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
export type ToggleUserStatusInput = z.infer<typeof toggleUserStatusSchema>;
export type RevokeUserSessionsInput = z.infer<typeof revokeUserSessionsSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
