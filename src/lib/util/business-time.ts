/**
 * Business Time Utility
 * 
 * Provides deterministic, timezone-aware date and time functions
 * based on the property configuration (Property.timezone).
 */

export const DEFAULT_PROPERTY_TIMEZONE = 'Asia/Kolkata';

/**
 * Validates whether an IANA timezone string is recognized.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Derives current YYYYMM in the configured property timezone.
 * Used for monthly invoice numbering cycles (e.g. INV-202609-0001).
 */
export function getCurrentYearMonth(timezone: string = DEFAULT_PROPERTY_TIMEZONE): string {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_PROPERTY_TIMEZONE;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value || '';
    const month = parts.find((p) => p.type === 'month')?.value || '';
    return `${year}${month}`;
  } catch {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}

/**
 * Returns formatted business date string in property timezone.
 */
export function formatBusinessDate(date: Date, timezone: string = DEFAULT_PROPERTY_TIMEZONE): string {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_PROPERTY_TIMEZONE;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Returns formatted business time string (HH:MM:SS) in property timezone.
 */
export function formatBusinessTime(date: Date, timezone: string = DEFAULT_PROPERTY_TIMEZONE): string {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_PROPERTY_TIMEZONE;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
