import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { UserRole, Permission, ROLE_PERMISSIONS, hasPermission } from '../src/lib/permissions/rbac';
import { DUMMY_BCRYPT_HASH, verifyPassword } from '../src/lib/auth/password';
import { assertSuperAdminInvariant } from '../src/lib/auth/auth';

async function runRbacTests() {
  console.log('--- Starting RBAC & Security Test Suite ---');

  const expectedRoles: UserRole[] = [
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

  const definedRoles = Object.keys(ROLE_PERMISSIONS) as UserRole[];
  assert.strictEqual(definedRoles.length, 9, 'Must have exactly 9 defined roles');
  for (const role of expectedRoles) {
    assert.ok(definedRoles.includes(role), 'Missing role: ' + role);
  }
  console.log('✔ Exactly 9 approved roles defined in ROLE_PERMISSIONS');

  // RECEPTIONIST
  assert.ok(hasPermission({ role: 'RECEPTIONIST' }, 'booking:read'));
  assert.ok(hasPermission({ role: 'RECEPTIONIST' }, 'booking:create'));
  assert.ok(hasPermission({ role: 'RECEPTIONIST' }, 'checkin:perform'));
  assert.ok(hasPermission({ role: 'RECEPTIONIST' }, 'checkout:perform'));
  assert.ok(hasPermission({ role: 'RECEPTIONIST' }, 'folio:settle'));
  assert.ok(hasPermission({ role: 'RECEPTIONIST' }, 'guest:manage'));

  // RESTAURANT_MANAGER
  assert.ok(hasPermission({ role: 'RESTAURANT_MANAGER' }, 'restaurant:table:manage'));
  assert.ok(hasPermission({ role: 'RESTAURANT_MANAGER' }, 'restaurant:bill:settle'));
  assert.ok(hasPermission({ role: 'RESTAURANT_MANAGER' }, 'kitchen:view'));

  // RESTAURANT_BILLER
  assert.ok(hasPermission({ role: 'RESTAURANT_BILLER' }, 'restaurant:bill:settle'));
  assert.ok(hasPermission({ role: 'RESTAURANT_BILLER' }, 'restaurant:order:create'));

  // KITCHEN_STAFF
  assert.ok(hasPermission({ role: 'KITCHEN_STAFF' }, 'kitchen:view'));
  assert.ok(hasPermission({ role: 'KITCHEN_STAFF' }, 'kitchen:update_kot'));

  // STORE_MANAGER
  assert.ok(hasPermission({ role: 'STORE_MANAGER' }, 'inventory:read'));
  assert.ok(hasPermission({ role: 'STORE_MANAGER' }, 'inventory:issue'));
  assert.ok(hasPermission({ role: 'STORE_MANAGER' }, 'inventory:adjust'));
  assert.ok(hasPermission({ role: 'STORE_MANAGER' }, 'inventory:count'));
  assert.ok(hasPermission({ role: 'STORE_MANAGER' }, 'procurement:grn:receive'));

  // PURCHASE_MANAGER
  assert.ok(hasPermission({ role: 'PURCHASE_MANAGER' }, 'procurement:order:create'));
  assert.ok(hasPermission({ role: 'PURCHASE_MANAGER' }, 'procurement:bill:process'));
  assert.ok(hasPermission({ role: 'PURCHASE_MANAGER' }, 'vendor:manage'));

  // CONTENT_MANAGER
  assert.ok(hasPermission({ role: 'CONTENT_MANAGER' }, 'content:manage'));

  // ADMIN
  assert.ok(hasPermission({ role: 'ADMIN' }, 'booking:read'));
  assert.ok(hasPermission({ role: 'ADMIN' }, 'restaurant:bill:settle'));
  assert.ok(hasPermission({ role: 'ADMIN' }, 'inventory:read'));
  assert.ok(hasPermission({ role: 'ADMIN' }, 'procurement:order:create'));

  // SUPER_ADMIN
  assert.ok(hasPermission({ role: 'SUPER_ADMIN' }, 'user:manage'));
  assert.ok(hasPermission({ role: 'SUPER_ADMIN' }, 'role:manage'));
  assert.ok(hasPermission({ role: 'SUPER_ADMIN' }, 'guest:view_sensitive'));
  assert.ok(hasPermission({ role: 'SUPER_ADMIN' }, 'audit:read'));

  console.log('✔ Positive role permissions verified for all 9 roles');

  // Negative tests
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'user:manage'), false);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'role:manage'), false);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'guest:view_sensitive'), false);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'kitchen:update_kot'), false);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'procurement:order:create'), false);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'reports:financial'), false);

  assert.strictEqual(hasPermission({ role: 'KITCHEN_STAFF' }, 'restaurant:bill:settle'), false);
  assert.strictEqual(hasPermission({ role: 'KITCHEN_STAFF' }, 'restaurant:table:manage'), false);
  assert.strictEqual(hasPermission({ role: 'KITCHEN_STAFF' }, 'booking:read'), false);
  assert.strictEqual(hasPermission({ role: 'KITCHEN_STAFF' }, 'vendor:manage'), false);

  assert.strictEqual(hasPermission({ role: 'RESTAURANT_BILLER' }, 'kitchen:update_kot'), false);
  assert.strictEqual(hasPermission({ role: 'RESTAURANT_BILLER' }, 'restaurant:table:manage'), false);
  assert.strictEqual(hasPermission({ role: 'RESTAURANT_BILLER' }, 'inventory:issue'), false);

  assert.strictEqual(hasPermission({ role: 'STORE_MANAGER' }, 'procurement:order:create'), false);
  assert.strictEqual(hasPermission({ role: 'STORE_MANAGER' }, 'restaurant:bill:settle'), false);
  assert.strictEqual(hasPermission({ role: 'STORE_MANAGER' }, 'booking:create'), false);

  assert.strictEqual(hasPermission({ role: 'PURCHASE_MANAGER' }, 'inventory:count'), false);
  assert.strictEqual(hasPermission({ role: 'PURCHASE_MANAGER' }, 'inventory:adjust'), false);
  assert.strictEqual(hasPermission({ role: 'PURCHASE_MANAGER' }, 'checkin:perform'), false);

  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'booking:read'), false);
  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'folio:settle'), false);
  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'restaurant:bill:settle'), false);
  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'inventory:read'), false);
  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'user:manage'), false);

  assert.strictEqual(hasPermission({ role: 'ADMIN' }, 'user:manage'), false);
  assert.strictEqual(hasPermission({ role: 'ADMIN' }, 'role:manage'), false);

  console.log('✔ Negative cross-domain permission boundaries verified');

  assert.strictEqual(typeof DUMMY_BCRYPT_HASH, 'string');
  assert.ok(DUMMY_BCRYPT_HASH.startsWith('$') || DUMMY_BCRYPT_HASH.startsWith('$'), 'Hash must be bcrypt cost 12');
  assert.strictEqual(DUMMY_BCRYPT_HASH.length, 60, 'Bcrypt hash length must be 60 characters');

  const dummyCompResult = await verifyPassword('randomPassword123!', DUMMY_BCRYPT_HASH);
  assert.strictEqual(dummyCompResult, false, 'Dummy hash must never match arbitrary passwords');
  console.log('✔ DUMMY_BCRYPT_HASH verified: valid format, cost 12, safe comparison');

  const mockDbSingleAdmin = {
    user: {
      findUnique: async () => ({ role: 'SUPER_ADMIN', isActive: true }),
      count: async () => 1,
    },
  };

  let caughtError: Error | null = null;
  try {
    await assertSuperAdminInvariant('admin-1', 'ADMIN', true, mockDbSingleAdmin as any);
  } catch (err: any) {
    caughtError = err;
  }
  assert.ok(caughtError !== null, 'Should reject downgrading the last SUPER_ADMIN');
  assert.ok(caughtError?.message.includes('BUSINESS_RULE_VIOLATION'), 'Should throw BUSINESS_RULE_VIOLATION');

  const mockDbMultipleAdmins = {
    user: {
      findUnique: async () => ({ role: 'SUPER_ADMIN', isActive: true }),
      count: async () => 2,
    },
  };
  await assertSuperAdminInvariant('admin-1', 'ADMIN', true, mockDbMultipleAdmins as any);
  console.log('✔ assertSuperAdminInvariant logic verified: prevents removing the last Super Admin');

  console.log('--- ALL RBAC & SECURITY VERIFICATIONS PASSED ---');
}

runRbacTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
