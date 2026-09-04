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
}

testAuthSession().catch((err) => {
  console.error(err);
  process.exit(1);
});
