/**
 * Resort & Restaurant Management System — Authoritative Business Date & Timezone Utilities
 * Timezone: Asia/Kolkata (UTC+05:30)
 */

export const PROPERTY_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's business date as a YYYY-MM-DD string in property timezone (Asia/Kolkata).
 * Uses Intl.DateTimeFormat with 'en-CA' to avoid timezone shift bugs.
 */
export function getBusinessDateNow(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROPERTY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? String(now.getFullYear());
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/**
 * Converts a YYYY-MM-DD string into a UTC Date object representing midnight UTC.
 * STRICTLY for PostgreSQL @db.Date columns (e.g. Reservation.checkInDate, checkOutDate).
 * PostgreSQL DATE columns store pure calendar dates without time or offset.
 * Passing `2026-09-08T00:00:00.000Z` instructs Prisma to compare directly against DATE '2026-09-08'.
 */
export function getBusinessDateUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Returns the next business date as a YYYY-MM-DD string.
 */
export function getNextBusinessDate(dateStr: string): string {
  const d = getBusinessDateUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the previous business date as a YYYY-MM-DD string.
 */
export function getPreviousBusinessDate(dateStr: string): string {
  const d = getBusinessDateUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns [start, end) range in UTC Date objects for PostgreSQL @db.Date column matching.
 */
export function getBusinessDateUtcRange(dateStr: string): { start: Date; end: Date } {
  const start = getBusinessDateUtcDate(dateStr);
  const next = getNextBusinessDate(dateStr);
  const end = getBusinessDateUtcDate(next);
  return { start, end };
}

/**
 * Returns the exact [start, end) UTC timestamps for a full business day in Asia/Kolkata.
 * Asia/Kolkata is UTC+05:30:
 * - Start of day (00:00:00.000 IST) = previous UTC calendar day at 18:30:00.000Z
 * - End of day (24:00:00.000 IST) = current UTC calendar day at 18:30:00.000Z
 * 
 * STRICTLY for timestamp fields (createdAt, paymentDate, postedAt, movementDate).
 */
export function getBusinessDayTimestampRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const nextDate = getNextBusinessDate(dateStr);
  const end = new Date(`${nextDate}T00:00:00.000+05:30`);
  return { start, end };
}

export type PeriodGranularity = 'daily' | 'monthly';

export type DashboardPeriod =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'this-year'
  | 'custom';

export interface DateRangeBounds {
  startDateStr: string;
  endDateStr: string;
  startTimestamp: Date;
  endTimestamp: Date;
  utcDateStart: Date;
  utcDateEnd: Date;
  daysCount: number;
}

export interface ResolvedPeriodRange {
  period: DashboardPeriod;
  label: string;
  granularity: PeriodGranularity;
  current: DateRangeBounds;
  previous: DateRangeBounds;
  isToday: boolean;
}

export interface PeriodBucket {
  key: string;
  label: string;
  startTimestamp: Date;
  endTimestamp: Date;
  dateStr: string;
}

/**
 * Builds DateRangeBounds from start and end YYYY-MM-DD strings (inclusive).
 */
export function buildDateRangeBounds(startDateStr: string, endDateStr: string): DateRangeBounds {
  const startTimestamp = new Date(`${startDateStr}T00:00:00.000+05:30`);
  const nextEndDate = getNextBusinessDate(endDateStr);
  const endTimestamp = new Date(`${nextEndDate}T00:00:00.000+05:30`);

  const utcDateStart = getBusinessDateUtcDate(startDateStr);
  const utcDateEnd = getBusinessDateUtcDate(nextEndDate);

  const startUtcMs = utcDateStart.getTime();
  const endUtcMs = getBusinessDateUtcDate(endDateStr).getTime();
  const daysCount = Math.max(1, Math.round((endUtcMs - startUtcMs) / (1000 * 60 * 60 * 24)) + 1);

  return {
    startDateStr,
    endDateStr,
    startTimestamp,
    endTimestamp,
    utcDateStart,
    utcDateEnd,
    daysCount,
  };
}

/**
 * Shifts a YYYY-MM-DD date string by a given number of days.
 */
export function shiftDateDays(dateStr: string, daysDelta: number): string {
  const d = getBusinessDateUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() + daysDelta);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves period into authoritative current & prior comparison ranges.
 * Default period: 'this-month'.
 */
export function resolvePeriodRange(
  periodParam?: string | null,
  customStart?: string | null,
  customEnd?: string | null,
  refDateStr?: string
): ResolvedPeriodRange {
  const todayStr = refDateStr || getBusinessDateNow();
  const validPeriod = (periodParam as DashboardPeriod) || 'this-month';

  let currentStart = todayStr;
  let currentEnd = todayStr;
  let prevStart = todayStr;
  let prevEnd = todayStr;
  let label = 'This Month';
  let granularity: PeriodGranularity = 'daily';
  let resolvedPeriod: DashboardPeriod = validPeriod;

  const todayUtc = getBusinessDateUtcDate(todayStr);
  const curYear = todayUtc.getUTCFullYear();
  const curMonth = todayUtc.getUTCMonth(); // 0-indexed

  switch (validPeriod) {
    case 'today': {
      currentStart = todayStr;
      currentEnd = todayStr;
      prevStart = getPreviousBusinessDate(todayStr);
      prevEnd = prevStart;
      label = 'Today';
      granularity = 'daily';
      break;
    }

    case 'yesterday': {
      const yest = getPreviousBusinessDate(todayStr);
      currentStart = yest;
      currentEnd = yest;
      prevStart = getPreviousBusinessDate(yest);
      prevEnd = prevStart;
      label = 'Yesterday';
      granularity = 'daily';
      break;
    }

    case 'this-week': {
      // Monday-start week in Asia/Kolkata
      const dayOfWeek = todayUtc.getUTCDay(); // 0 = Sun, 1 = Mon ...
      const diffToMonday = (dayOfWeek + 6) % 7;
      currentStart = shiftDateDays(todayStr, -diffToMonday);
      currentEnd = todayStr;
      const weekDays = diffToMonday + 1;
      prevEnd = shiftDateDays(currentStart, -1);
      prevStart = shiftDateDays(prevEnd, -(weekDays - 1));
      label = 'This Week';
      granularity = 'daily';
      break;
    }

    case 'this-month': {
      const firstDay = new Date(Date.UTC(curYear, curMonth, 1)).toISOString().slice(0, 10);
      const lastDay = new Date(Date.UTC(curYear, curMonth + 1, 0)).toISOString().slice(0, 10);
      currentStart = firstDay;
      currentEnd = lastDay;

      // Previous month
      const prevMonthFirst = new Date(Date.UTC(curYear, curMonth - 1, 1)).toISOString().slice(0, 10);
      const prevMonthLast = new Date(Date.UTC(curYear, curMonth, 0)).toISOString().slice(0, 10);
      prevStart = prevMonthFirst;
      prevEnd = prevMonthLast;

      const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(curYear, curMonth, 1)));
      label = monthName;
      granularity = 'daily';
      break;
    }

    case 'last-month': {
      const prevMonthFirst = new Date(Date.UTC(curYear, curMonth - 1, 1)).toISOString().slice(0, 10);
      const prevMonthLast = new Date(Date.UTC(curYear, curMonth, 0)).toISOString().slice(0, 10);
      currentStart = prevMonthFirst;
      currentEnd = prevMonthLast;

      const priorMonthFirst = new Date(Date.UTC(curYear, curMonth - 2, 1)).toISOString().slice(0, 10);
      const priorMonthLast = new Date(Date.UTC(curYear, curMonth - 1, 0)).toISOString().slice(0, 10);
      prevStart = priorMonthFirst;
      prevEnd = priorMonthLast;

      const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(curYear, curMonth - 1, 1)));
      label = `Last Month (${monthName})`;
      granularity = 'daily';
      break;
    }

    case 'last-3-months': {
      // 3 full months prior to today's month + current month
      const startD = new Date(Date.UTC(curYear, curMonth - 2, 1)).toISOString().slice(0, 10);
      const endD = new Date(Date.UTC(curYear, curMonth + 1, 0)).toISOString().slice(0, 10);
      currentStart = startD;
      currentEnd = endD;

      const priorStart = new Date(Date.UTC(curYear, curMonth - 5, 1)).toISOString().slice(0, 10);
      const priorEnd = new Date(Date.UTC(curYear, curMonth - 2, 0)).toISOString().slice(0, 10);
      prevStart = priorStart;
      prevEnd = priorEnd;

      label = 'Last 3 Months';
      granularity = 'monthly';
      break;
    }

    case 'last-6-months': {
      const startD = new Date(Date.UTC(curYear, curMonth - 5, 1)).toISOString().slice(0, 10);
      const endD = new Date(Date.UTC(curYear, curMonth + 1, 0)).toISOString().slice(0, 10);
      currentStart = startD;
      currentEnd = endD;

      const priorStart = new Date(Date.UTC(curYear, curMonth - 11, 1)).toISOString().slice(0, 10);
      const priorEnd = new Date(Date.UTC(curYear, curMonth - 5, 0)).toISOString().slice(0, 10);
      prevStart = priorStart;
      prevEnd = priorEnd;

      label = 'Last 6 Months';
      granularity = 'monthly';
      break;
    }

    case 'this-year': {
      currentStart = `${curYear}-01-01`;
      currentEnd = `${curYear}-12-31`;
      prevStart = `${curYear - 1}-01-01`;
      prevEnd = `${curYear - 1}-12-31`;
      label = `Year ${curYear}`;
      granularity = 'monthly';
      break;
    }

    case 'custom': {
      const isValidDate = (s?: string | null): boolean => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (isValidDate(customStart) && isValidDate(customEnd) && customStart! <= customEnd!) {
        // Cap max range to 366 days
        const startMs = getBusinessDateUtcDate(customStart!).getTime();
        const endMs = getBusinessDateUtcDate(customEnd!).getTime();
        const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
        if (diffDays <= 366) {
          currentStart = customStart!;
          currentEnd = customEnd!;
          granularity = diffDays <= 31 ? 'daily' : 'monthly';
          const spanDays = diffDays + 1;
          prevEnd = shiftDateDays(currentStart, -1);
          prevStart = shiftDateDays(prevEnd, -(spanDays - 1));
          label = `${currentStart} to ${currentEnd}`;
          resolvedPeriod = 'custom';
          break;
        }
      }
      // Fallback to this-month if custom dates invalid or out of bounds
      const firstDay = new Date(Date.UTC(curYear, curMonth, 1)).toISOString().slice(0, 10);
      const lastDay = new Date(Date.UTC(curYear, curMonth + 1, 0)).toISOString().slice(0, 10);
      currentStart = firstDay;
      currentEnd = lastDay;
      prevStart = new Date(Date.UTC(curYear, curMonth - 1, 1)).toISOString().slice(0, 10);
      prevEnd = new Date(Date.UTC(curYear, curMonth, 0)).toISOString().slice(0, 10);
      label = 'This Month';
      granularity = 'daily';
      resolvedPeriod = 'this-month';
      break;
    }

    default: {
      const firstDay = new Date(Date.UTC(curYear, curMonth, 1)).toISOString().slice(0, 10);
      const lastDay = new Date(Date.UTC(curYear, curMonth + 1, 0)).toISOString().slice(0, 10);
      currentStart = firstDay;
      currentEnd = lastDay;
      prevStart = new Date(Date.UTC(curYear, curMonth - 1, 1)).toISOString().slice(0, 10);
      prevEnd = new Date(Date.UTC(curYear, curMonth, 0)).toISOString().slice(0, 10);
      label = 'This Month';
      granularity = 'daily';
      resolvedPeriod = 'this-month';
    }
  }

  const current = buildDateRangeBounds(currentStart, currentEnd);
  const previous = buildDateRangeBounds(prevStart, prevEnd);
  const isToday = currentStart === todayStr && currentEnd === todayStr;

  return {
    period: resolvedPeriod,
    label,
    granularity,
    current,
    previous,
    isToday,
  };
}

/**
 * Generates deterministic daily or monthly buckets for chart series within the current period range.
 */
export function getPeriodBuckets(range: ResolvedPeriodRange): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  const { current, granularity } = range;

  if (granularity === 'daily') {
    let curr = current.startDateStr;
    while (curr <= current.endDateStr) {
      const startTimestamp = new Date(`${curr}T00:00:00.000+05:30`);
      const nextDate = getNextBusinessDate(curr);
      const endTimestamp = new Date(`${nextDate}T00:00:00.000+05:30`);

      const dUtc = getBusinessDateUtcDate(curr);
      const dayStr = String(dUtc.getUTCDate()).padStart(2, '0');
      const monthStr = dUtc.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

      buckets.push({
        key: curr,
        label: `${dayStr} ${monthStr}`,
        startTimestamp,
        endTimestamp,
        dateStr: curr,
      });

      curr = nextDate;
    }
  } else {
    // Monthly buckets
    const startUtc = getBusinessDateUtcDate(current.startDateStr);
    const endUtc = getBusinessDateUtcDate(current.endDateStr);

    let y = startUtc.getUTCFullYear();
    let m = startUtc.getUTCMonth();
    const endY = endUtc.getUTCFullYear();
    const endM = endUtc.getUTCMonth();

    while (y < endY || (y === endY && m <= endM)) {
      const firstDay = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
      const startTimestamp = new Date(`${firstDay}T00:00:00.000+05:30`);
      const nextMonthFirst = new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10);
      const endTimestamp = new Date(`${nextMonthFirst}T00:00:00.000+05:30`);

      const monthLabel = new Date(Date.UTC(y, m, 1)).toLocaleString('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });

      buckets.push({
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: monthLabel,
        startTimestamp,
        endTimestamp,
        dateStr: firstDay,
      });

      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }

  return buckets;
}
