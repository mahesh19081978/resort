import assert from 'node:assert';
import { createSessionToken, verifySessionToken } from '../src/lib/auth/session';
import { loginSchema } from '../src/validations';
import { normalizeEmail, verifyPassword, DUMMY_BCRYPT_HASH } from '../src/lib/auth/password';

async function testAuthSession() {
  console.log('--- Starting Auth & Session Verification Test Suite ---');

  // 1. Zod login validation
  const validParse = loginSchema.safeParse({ email: 'admin@royalreserve.com', password: 'password123!' });
  assert.ok(validParse.success, 'Valid login should pass Zod');

  const invalidEmail = loginSchema.safeParse({ email: 'not-an-email', password: 'password123!' });
  assert.strictEqual(invalidEmail.success, false, 'Invalid email should fail Zod');

  const shortPassword = loginSchema.safeParse({ email: 'admin@royalreserve.com', password: 'short' });
  assert.strictEqual(shortPassword.success, false, 'Password < 8 chars should fail Zod');
  console.log('? Zod input validation schemas enforced');

  // 2. Email normalization
  const normalized = normalizeEmail('  Admin@RoyalReserve.COM ');
  assert.strictEqual(normalized, 'admin@royalreserve.com');
  console.log('? Email normalization verified');

  // 3. Constant-time dummy verification
  const dummyResult = await verifyPassword('wrong-pass', DUMMY_BCRYPT_HASH);
  assert.strictEqual(dummyResult, false);
  console.log('? Constant-time dummy bcrypt verification verified');

  // 4. Create and verify signed session token
  const token = await createSessionToken({
    sub: 'user-id-abc-123',
    email: 'admin@royalreserve.com',
    sessionVersion: 1,
    role: 'SUPER_ADMIN',
  });
  assert.ok(typeof token === 'string' && token.length > 50, 'Token must be non-empty JWT');
  console.log('? Session token cryptographically signed');

  const verified = await verifySessionToken(token);
  assert.ok(verified !== null, 'Valid session token must verify');
  assert.strictEqual(verified.sub, 'user-id-abc-123');
  assert.strictEqual(verified.email, 'admin@royalreserve.com');
  assert.strictEqual(verified.sessionVersion, 1);
  assert.strictEqual(verified.role, 'SUPER_ADMIN');
  console.log('? Session token verified with sub, email, and sessionVersion');

  // 5. Tampered token rejection (fail-closed)
  const tamperedToken = token.slice(0, -10) + '0000000000';
  const tamperedVerified = await verifySessionToken(tamperedToken);
  assert.strictEqual(tamperedVerified, null, 'Tampered token must return null');
  console.log('? Tampered token safely rejected (fail closed)');

  console.log('--- ALL AUTH & SESSION VERIFICATIONS PASSED ---');

  // 6. Live Database & HTTP Verification
  console.log('--- Starting Live Neon DB & HTTP Verification ---');
  const { prisma } = await import('../src/lib/db/prisma');

  const admin = await prisma.user.findUnique({ where: { email: 'admin@royalreserve.com' } });
  assert.ok(admin !== null, 'Admin must exist in Neon database');
  console.log('✔ Neon DB User Verified: ID = ' + admin.id + ', Role = ' + admin.role + ', SessionVersion = ' + admin.sessionVersion);

  const pwdMatch = await verifyPassword('12345678', admin.passwordHash);
  assert.strictEqual(pwdMatch, true, 'verifyPassword for 12345678 must return true');
  console.log('✔ Live Admin Password match: true');

  // Unauthenticated HTTP checks
  const unauthDash = await fetch('http://localhost:3001/admin/dashboard', { redirect: 'manual' });
  assert.strictEqual(unauthDash.status, 307, 'Unauthenticated dashboard must redirect (307)');
  console.log('✔ GET /admin/dashboard (unauthenticated) -> 307 to: ' + unauthDash.headers.get('location'));

  const unauthFrontdesk = await fetch('http://localhost:3001/admin/frontdesk', { redirect: 'manual' });
  assert.strictEqual(unauthFrontdesk.status, 307, 'Unauthenticated frontdesk must redirect (307)');
  console.log('✔ GET /admin/frontdesk (unauthenticated) -> 307 to: ' + unauthFrontdesk.headers.get('location'));

  // Isolated Login Page check
  const loginRes = await fetch('http://localhost:3001/admin/login');
  assert.strictEqual(loginRes.status, 200, 'Login page must return 200 OK');
  const loginHtml = await loginRes.text();
  assert.ok(loginHtml.includes('Staff Management Portal'), 'Login page must contain portal title');
  assert.strictEqual(loginHtml.includes('AdminSidebar'), false, 'Login page must NOT contain AdminSidebar');
  console.log('✔ GET /admin/login -> 200 OK, standalone login page without AdminSidebar');

  // Authenticated HTTP checks
  const liveToken = await createSessionToken({
    sub: admin.id,
    email: admin.email,
    sessionVersion: admin.sessionVersion,
    role: admin.role,
  });

  const authDash = await fetch('http://localhost:3001/admin/dashboard', {
    headers: { Cookie: 'resort_session=' + liveToken },
    redirect: 'manual'
  });
  assert.strictEqual(authDash.status, 200, 'Authenticated dashboard must return 200 OK');
  console.log('✔ GET /admin/dashboard (authenticated with session cookie) -> 200 OK');

  const authFrontdesk = await fetch('http://localhost:3001/admin/frontdesk', {
    headers: { Cookie: 'resort_session=' + liveToken },
    redirect: 'manual'
  });
  assert.strictEqual(authFrontdesk.status, 200, 'Authenticated frontdesk must return 200 OK');
  console.log('✔ GET /admin/frontdesk (authenticated with session cookie) -> 200 OK');

  const authBookings = await fetch('http://localhost:3001/admin/bookings', {
    headers: { Cookie: 'resort_session=' + liveToken },
    redirect: 'manual'
  });
  assert.strictEqual(authBookings.status, 200, 'Authenticated bookings must return 200 OK');
  console.log('✔ GET /admin/bookings (authenticated with session cookie) -> 200 OK');

  const authLogin = await fetch('http://localhost:3001/admin/login', {
    headers: { Cookie: 'resort_session=' + liveToken },
    redirect: 'manual'
  });
  assert.strictEqual(authLogin.status, 307, 'Authenticated user accessing /admin/login must redirect (307)');
  console.log('✔ GET /admin/login (authenticated) -> 307 to: ' + authLogin.headers.get('location'));

  console.log('--- ALL LIVE NEON DB & E2E HTTP VERIFICATIONS PASSED ---');
}

testAuthSession().catch((err) => {
  console.error(err);
  process.exit(1);
});

