import crypto from 'crypto';

export type BusinessNumberPrefix = 'ORD' | 'KOT' | 'BILL' | 'SES';

/**
 * Generates a collision-resistant business identifier conforming to standard hospitality numbering:
 * Format: PREFIX-YYYYMMDD-XXXXXX
 * (e.g., ORD-20260907-A1B2C3, KOT-20260907-D4E5F6, BILL-20260907-789012)
 *
 * Uses cryptographically secure random bytes rather than sequential count() to ensure
 * concurrency-safety across simultaneous worker nodes.
 */
export function generateRestaurantNumber(prefix: BusinessNumberPrefix): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const randSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();

  return `${prefix}-${dateStr}-${randSuffix}`;
}
