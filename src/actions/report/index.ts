'use server';

/**
 * Report Server Actions
 * Handle auth, RBAC, property scoping, and data fetching for all reports.
 */

import { requireAuth, requirePermission } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/permissions/rbac';
import { prisma } from '@/lib/db/prisma';
import { resolveReportPeriod } from '@/lib/reports/date';
import {
  getRevenueReport,
  getRevenueDetailRows,
} from '@/lib/reports/revenue';
import {
  getOccupancyReport,
} from '@/lib/reports/occupancy';
import {
  getReservationReport,
  getReservationDetailRows,
} from '@/lib/reports/reservations';
import {
  getRestaurantReport,
  getRestaurantDetailRows,
} from '@/lib/reports/restaurant';
import {
  getInventoryReport,
  getInventoryMovementRows,
} from '@/lib/reports/inventory';
import {
  getProcurementReport,
} from '@/lib/reports/procurement';
import {
  getPaymentReport,
  getPaymentDetailRows,
} from '@/lib/reports/payments';
import {
  getGuestReport,
} from '@/lib/reports/guests';
import {
  getAuditReport,
  getAuditLogRows,
} from '@/lib/reports/audit';
import {
  getExpectedArrivals,
} from '@/lib/frontdesk/arrivals';
import {
  getExpectedDepartures,
} from '@/lib/frontdesk/departures';
import { getBusinessDateNow } from '@/lib/dashboard/date';

async function getPropertyId(): Promise<string> {
  const prop = await prisma.property.findFirst({ select: { id: true } });
  return prop?.id || '';
}

export interface ReportActionParams {
  period?: string | null;
  start?: string | null;
  end?: string | null;
}

function resolveParams(params: ReportActionParams) {
  return resolveReportPeriod(params.period, params.start, params.end);
}

// ========== REVENUE ==========
export async function fetchRevenueReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'reports:financial')) {
    throw new Error('FORBIDDEN: Financial reports require reports:financial permission');
  }
  const propertyId = await getPropertyId();
  const periodRange = resolveParams(params);
  return getRevenueReport(propertyId, periodRange);
}

export async function fetchRevenueDetails(params: ReportActionParams & { page?: number; pageSize?: number }) {
  const user = await requireAuth();
  if (!hasPermission(user, 'reports:financial')) {
    throw new Error('FORBIDDEN: Financial reports require reports:financial permission');
  }
  const propertyId = await getPropertyId();
  const periodRange = resolveParams(params);
  return getRevenueDetailRows(propertyId, periodRange, params.page, params.pageSize);
}

// ========== OCCUPANCY ==========
export async function fetchOccupancyReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'reports:operational') && !hasPermission(user, 'reports:financial')) {
    throw new Error('FORBIDDEN: Occupancy report requires reports:operational or reports:financial permission');
  }
  const propertyId = await getPropertyId();
  const periodRange = resolveParams(params);
  const isToday = !params.period || params.period === 'today';
  return getOccupancyReport(propertyId, periodRange, isToday);
}

// ========== RESERVATIONS ==========
export async function fetchReservationReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'booking:read')) {
    throw new Error('FORBIDDEN: Reservation report requires booking:read permission');
  }
  const propertyId = await getPropertyId();
  const periodRange = resolveParams(params);
  return getReservationReport(propertyId, periodRange);
}

export async function fetchReservationDetails(params: ReportActionParams & { page?: number; pageSize?: number }) {
  const user = await requireAuth();
  if (!hasPermission(user, 'booking:read')) {
    throw new Error('FORBIDDEN: Reservation report requires booking:read permission');
  }
  const propertyId = await getPropertyId();
  const periodRange = resolveParams(params);
  return getReservationDetailRows(propertyId, periodRange, params.page, params.pageSize);
}

// ========== ARRIVALS ==========
export async function fetchArrivalsReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'booking:read')) {
    throw new Error('FORBIDDEN: Arrivals report requires booking:read permission');
  }
  const businessDate = params.start || getBusinessDateNow();
  return getExpectedArrivals(businessDate);
}

// ========== DEPARTURES ==========
export async function fetchDeparturesReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'booking:read')) {
    throw new Error('FORBIDDEN: Departures report requires booking:read permission');
  }
  const propertyId = await getPropertyId();
  const businessDate = params.start || getBusinessDateNow();
  return getExpectedDepartures(businessDate, propertyId);
}

// ========== RESTAURANT ==========
export async function fetchRestaurantReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'restaurant:order:read') && !hasPermission(user, 'reports:operational')) {
    throw new Error('FORBIDDEN: Restaurant report requires restaurant:order:read or reports:operational permission');
  }
  const periodRange = resolveParams(params);
  return getRestaurantReport(periodRange);
}

export async function fetchRestaurantDetails(params: ReportActionParams & { page?: number; pageSize?: number }) {
  const user = await requireAuth();
  if (!hasPermission(user, 'restaurant:order:read') && !hasPermission(user, 'reports:operational')) {
    throw new Error('FORBIDDEN: Restaurant report requires restaurant:order:read or reports:operational permission');
  }
  const periodRange = resolveParams(params);
  return getRestaurantDetailRows(periodRange, params.page, params.pageSize);
}

// ========== INVENTORY ==========
export async function fetchInventoryReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'inventory:read') && !hasPermission(user, 'inventory:report:view')) {
    throw new Error('FORBIDDEN: Inventory report requires inventory:read or inventory:report:view permission');
  }
  const periodRange = resolveParams(params);
  return getInventoryReport(periodRange);
}

export async function fetchInventoryMovements(
  params: ReportActionParams & { page?: number; pageSize?: number; movementType?: string; storeId?: string }
) {
  const user = await requireAuth();
  if (!hasPermission(user, 'inventory:read') && !hasPermission(user, 'inventory:report:view')) {
    throw new Error('FORBIDDEN: Inventory report requires inventory:read or inventory:report:view permission');
  }
  const periodRange = resolveParams(params);
  return getInventoryMovementRows(periodRange, params.page, params.pageSize, params.movementType, params.storeId);
}

// ========== PROCUREMENT ==========
export async function fetchProcurementReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'reports:operational') && !hasPermission(user, 'procurement:order:create')) {
    throw new Error('FORBIDDEN: Procurement report requires reports:operational or procurement:order:create permission');
  }
  const periodRange = resolveParams(params);
  return getProcurementReport(periodRange);
}

// ========== PAYMENTS ==========
export async function fetchPaymentReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'reports:financial')) {
    throw new Error('FORBIDDEN: Payment report requires reports:financial permission');
  }
  const periodRange = resolveParams(params);
  return getPaymentReport(periodRange);
}

export async function fetchPaymentDetails(
  params: ReportActionParams & { page?: number; pageSize?: number; status?: string; context?: string }
) {
  const user = await requireAuth();
  if (!hasPermission(user, 'reports:financial')) {
    throw new Error('FORBIDDEN: Payment report requires reports:financial permission');
  }
  const periodRange = resolveParams(params);
  return getPaymentDetailRows(periodRange, params.page, params.pageSize, params.status, params.context);
}

// ========== GUESTS ==========
export async function fetchGuestReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'guest:read')) {
    throw new Error('FORBIDDEN: Guest report requires guest:read permission');
  }
  const periodRange = resolveParams(params);
  return getGuestReport(periodRange);
}

// ========== AUDIT ==========
export async function fetchAuditReport(params: ReportActionParams = {}) {
  const user = await requireAuth();
  if (!hasPermission(user, 'audit:read')) {
    throw new Error('FORBIDDEN: Audit report requires audit:read permission');
  }
  const periodRange = resolveParams(params);
  return getAuditReport(periodRange);
}

export async function fetchAuditLog(
  params: ReportActionParams & {
    page?: number;
    pageSize?: number;
    userId?: string;
    action?: string;
    entity?: string;
  }
) {
  const user = await requireAuth();
  if (!hasPermission(user, 'audit:read')) {
    throw new Error('FORBIDDEN: Audit log requires audit:read permission');
  }
  const periodRange = resolveParams(params);
  return getAuditLogRows(periodRange, params.page, params.pageSize, {
    userId: params.userId,
    action: params.action,
    entity: params.entity,
  });
}
