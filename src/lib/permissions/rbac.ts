export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'RECEPTIONIST'
  | 'RESTAURANT_MANAGER'
  | 'RESTAURANT_BILLER'
  | 'KITCHEN_STAFF'
  | 'STORE_MANAGER'
  | 'PURCHASE_MANAGER'
  | 'CONTENT_MANAGER';

export type Permission =
  // Bookings & PMS
  | 'booking:read'
  | 'booking:create'
  | 'booking:update'
  | 'booking:cancel'
  | 'checkin:perform'
  | 'checkout:perform'
  | 'folio:read'
  | 'folio:update'
  | 'folio:settle'
  | 'room:read'
  | 'room:manage'
  | 'property:manage'
  | 'guest:read'
  | 'guest:manage'
  | 'guest:view_sensitive'
  // Restaurant & POS
  | 'restaurant:order:create'
  | 'restaurant:order:read'
  | 'restaurant:order:update'
  | 'restaurant:table:manage'
  | 'restaurant:bill:settle'
  | 'kitchen:view'
  | 'kitchen:update_kot'
  // Inventory & Store
  | 'inventory:read'
  | 'inventory:issue'
  | 'inventory:adjust'
  | 'inventory:transfer'
  | 'inventory:count'
  // Procurement
  | 'procurement:request:create'
  | 'procurement:order:create'
  | 'procurement:grn:receive'
  | 'procurement:bill:process'
  | 'vendor:manage'
  // Admin & Content
  | 'user:manage'
  | 'role:manage'
  | 'reports:financial'
  | 'reports:operational'
  | 'content:manage'
  | 'audit:read';

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: [
    'booking:read', 'booking:create', 'booking:update', 'booking:cancel',
    'checkin:perform', 'checkout:perform', 'folio:read', 'folio:update', 'folio:settle',
    'room:read', 'room:manage', 'property:manage', 'guest:read', 'guest:manage', 'guest:view_sensitive',
    'restaurant:order:create', 'restaurant:order:read', 'restaurant:order:update',
    'restaurant:table:manage', 'restaurant:bill:settle', 'kitchen:view', 'kitchen:update_kot',
    'inventory:read', 'inventory:issue', 'inventory:adjust', 'inventory:transfer', 'inventory:count',
    'procurement:request:create', 'procurement:order:create', 'procurement:grn:receive',
    'procurement:bill:process', 'vendor:manage',
    'user:manage', 'role:manage', 'reports:financial', 'reports:operational',
    'content:manage', 'audit:read',
  ],
  ADMIN: [
    'booking:read', 'booking:create', 'booking:update', 'booking:cancel',
    'checkin:perform', 'checkout:perform', 'folio:read', 'folio:update', 'folio:settle',
    'room:read', 'room:manage', 'property:manage', 'guest:read', 'guest:manage', 'guest:view_sensitive',
    'restaurant:order:create', 'restaurant:order:read', 'restaurant:order:update',
    'restaurant:table:manage', 'restaurant:bill:settle', 'kitchen:view',
    'inventory:read', 'inventory:issue', 'inventory:adjust', 'inventory:transfer',
    'procurement:request:create', 'procurement:order:create', 'procurement:grn:receive',
    'procurement:bill:process', 'vendor:manage',
    'reports:financial', 'reports:operational', 'content:manage', 'audit:read',
  ],
  RECEPTIONIST: [
    'booking:read', 'booking:create', 'booking:update', 'booking:cancel',
    'checkin:perform', 'checkout:perform', 'folio:read', 'folio:update', 'folio:settle',
    'room:read', 'guest:read', 'guest:manage',
  ],
  RESTAURANT_MANAGER: [
    'restaurant:order:create', 'restaurant:order:read', 'restaurant:order:update',
    'restaurant:table:manage', 'restaurant:bill:settle', 'kitchen:view', 'inventory:read',
    'reports:operational',
  ],
  RESTAURANT_BILLER: [
    'restaurant:order:create', 'restaurant:order:read', 'restaurant:bill:settle',
  ],
  KITCHEN_STAFF: [
    'kitchen:view', 'kitchen:update_kot',
  ],
  STORE_MANAGER: [
    'inventory:read', 'inventory:issue', 'inventory:adjust', 'inventory:transfer', 'inventory:count',
    'procurement:grn:receive',
  ],
  PURCHASE_MANAGER: [
    'inventory:read', 'procurement:request:create', 'procurement:order:create',
    'procurement:bill:process', 'vendor:manage', 'reports:operational',
  ],
  CONTENT_MANAGER: [
    'content:manage',
  ],
};

export function hasPermission(
  user: { role: string } | null | undefined,
  permission: Permission
): boolean {
  if (!user || !user.role) return false;
  const role = user.role as UserRole;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function requirePermission(
  user: { role: string } | null | undefined,
  permission: Permission
): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`FORBIDDEN: Missing required permission [${permission}]`);
  }
}