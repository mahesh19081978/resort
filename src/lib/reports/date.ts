/**
 * Reports & Analytics — Date Utilities
 * Reuses authoritative business date utilities from dashboard/date.ts.
 * Centralizes report-specific date range resolution.
 */

export {
  PROPERTY_TIMEZONE,
  getBusinessDateNow,
  getBusinessDateUtcDate,
  getNextBusinessDate,
  getPreviousBusinessDate,
  getBusinessDateUtcRange,
  getBusinessDayTimestampRange,
  buildDateRangeBounds,
  shiftDateDays,
  resolvePeriodRange,
  getPeriodBuckets,
} from '@/lib/dashboard/date';

export type {
  DashboardPeriod,
  DateRangeBounds,
  ResolvedPeriodRange,
  PeriodBucket,
  PeriodGranularity,
} from '@/lib/dashboard/date';

import { resolvePeriodRange, type ResolvedPeriodRange, type DashboardPeriod } from '@/lib/dashboard/date';

/**
 * Resolves report period from URL search params.
 * Returns both current and previous period ranges for comparison.
 */
export function resolveReportPeriod(
  periodParam?: string | null,
  customStart?: string | null,
  customEnd?: string | null,
  refDateStr?: string
): ResolvedPeriodRange {
  return resolvePeriodRange(periodParam, customStart, customEnd, refDateStr);
}

/**
 * Report date semantics — identifies which date field a filter applies to.
 */
export type ReportDateField =
  | 'reservation_created'
  | 'check_in_date'
  | 'check_out_date'
  | 'stay_occupancy'
  | 'payment_created'
  | 'payment_success'
  | 'restaurant_bill'
  | 'stock_movement'
  | 'grn_date'
  | 'purchase_bill'
  | 'audit_event'
  | 'folio_posted'
  | 'order_created';

/**
 * Defines which date fields are relevant for each report type.
 */
export const REPORT_DATE_FIELDS: Record<string, ReportDateField[]> = {
  revenue: ['folio_posted', 'restaurant_bill'],
  occupancy: ['stay_occupancy'],
  reservations: ['reservation_created', 'check_in_date', 'check_out_date'],
  arrivals: ['check_in_date'],
  departures: ['check_out_date'],
  restaurant: ['restaurant_bill', 'order_created'],
  inventory: ['stock_movement'],
  procurement: ['grn_date', 'purchase_bill'],
  payments: ['payment_success', 'payment_created'],
  guests: ['stay_occupancy'],
  audit: ['audit_event'],
};
