import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// Fixed pre-computed dummy bcrypt hash (cost factor 12) for constant-time comparison on nonexistent accounts
// Generated for dummy string to avoid timing attacks/account enumeration
export const DUMMY_BCRYPT_HASH = '$2a$12$e8Y78gK7oN3O2MvQ6W1qI.K2R3E5T7Y9U1I3O5P7A9S1D3F5G7H9J';

/**
 * Hashes a plaintext password using bcrypt with cost factor 12.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Securely verifies a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Normalizes email address for consistent case-insensitive identity lookup.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}