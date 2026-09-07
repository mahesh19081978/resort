import crypto from 'crypto';

export type InventoryNumberPrefix = 'MOV' | 'TRF' | 'CNT' | 'ISS' | 'CON';

/**
 * Generates a collision-resistant business identifier conforming to standard inventory numbering:
 * Format: PREFIX-YYYYMMDD-XXXXXX
 * (e.g., MOV-20260907-A1B2C3, TRF-20260907-D4E5F6, CNT-20260907-789012)
 *
 * Uses cryptographically secure random bytes rather than sequential count() to ensure
 * concurrency-safety across simultaneous worker transactions.
 */
export function generateInventoryNumber(prefix: InventoryNumberPrefix): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const randSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();

  return `${prefix}-${dateStr}-${randSuffix}`;
}
