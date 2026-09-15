import { prisma } from '@/lib/db/prisma';
import { hasPermission } from '@/lib/permissions/rbac';
import type { AuthenticatedUser } from '@/lib/auth/auth';
import { getBusinessDateNow } from './date';
import { getFrontDeskMetrics, FrontDeskMetrics } from './frontdesk';
import { getRoomInventorySummary, RoomInventorySummary } from './rooms';
import { getReservationMetrics, ReservationMetrics } from './reservations';
import { getRestaurantMetrics, RestaurantMetrics } from './restaurant';
import { getInventoryMetrics, InventoryMetrics } from './inventory';
import { getFinancialMetrics, FinancialMetrics } from './financial';

export type MetricResult<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export interface DashboardOverview {
  businessDate: string;
  property: {
    id: string;
    name: string;
    code: string;
    city: string;
  } | null;
  frontdesk: MetricResult<FrontDeskMetrics> | null;
  rooms: MetricResult<RoomInventorySummary> | null;
  reservations: MetricResult<ReservationMetrics> | null;
  restaurant: MetricResult<RestaurantMetrics> | null;
  inventory: MetricResult<InventoryMetrics> | null;
  financial: MetricResult<FinancialMetrics> | null;
}

/**
 * Authoritative Dashboard Data Aggregator.
 *
 * Invariants:
 * 1. RBAC enforcement server-side: Only authorized sections are queried.
 * 2. Error containment: An error in one domain (e.g. inventory timeout) returns
 *    { status: 'error', message } for that domain rather than crashing the page or masking as 0.
 * 3. Property details are queried dynamically from the database.
 * 4. Business date uses Asia/Kolkata timezone.
 */
export async function getDashboardOverview(
  user: AuthenticatedUser,
  businessDate: string = getBusinessDateNow()
): Promise<DashboardOverview> {
  // 1. Authoritative dynamic Property query
  let property = null;
  try {
    const propRecord = await prisma.property.findFirst({
      select: { id: true, name: true, code: true, city: true },
    });
    if (propRecord) {
      property = propRecord;
    }
  } catch (err) {
    console.error('[Dashboard] Failed to fetch property context:', err);
  }

  const propertyId = property?.id;

  // 2. Permission gates
  const canReadRooms = hasPermission(user, 'room:read') || hasPermission(user, 'booking:read');
  const canReadBookings = hasPermission(user, 'booking:read');
  const canReadRestaurant =
    hasPermission(user, 'restaurant:order:read') || hasPermission(user, 'kitchen:view');
  const canReadInventory = hasPermission(user, 'inventory:read');
  const canReadFinancial = hasPermission(user, 'reports:financial');

  // 3. Parallel independent queries with isolated error boundaries
  const [
    roomsResult,
    frontdeskResult,
    reservationsResult,
    restaurantResult,
    inventoryResult,
    financialResult,
  ] = await Promise.all([
    canReadRooms
      ? getRoomInventorySummary(propertyId)
          .then((data): MetricResult<RoomInventorySummary> => ({ status: 'success', data }))
          .catch((err): MetricResult<RoomInventorySummary> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load room inventory',
          }))
      : Promise.resolve(null),

    canReadBookings
      ? getFrontDeskMetrics(businessDate, propertyId)
          .then((data): MetricResult<FrontDeskMetrics> => ({ status: 'success', data }))
          .catch((err): MetricResult<FrontDeskMetrics> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load front desk metrics',
          }))
      : Promise.resolve(null),

    canReadBookings
      ? getReservationMetrics(businessDate)
          .then((data): MetricResult<ReservationMetrics> => ({ status: 'success', data }))
          .catch((err): MetricResult<ReservationMetrics> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load reservation metrics',
          }))
      : Promise.resolve(null),

    canReadRestaurant
      ? getRestaurantMetrics(businessDate)
          .then((data): MetricResult<RestaurantMetrics> => ({ status: 'success', data }))
          .catch((err): MetricResult<RestaurantMetrics> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load restaurant metrics',
          }))
      : Promise.resolve(null),

    canReadInventory
      ? getInventoryMetrics(businessDate)
          .then((data): MetricResult<InventoryMetrics> => ({ status: 'success', data }))
          .catch((err): MetricResult<InventoryMetrics> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load inventory metrics',
          }))
      : Promise.resolve(null),

    canReadFinancial
      ? getFinancialMetrics(businessDate, propertyId)
          .then((data): MetricResult<FinancialMetrics> => ({ status: 'success', data }))
          .catch((err): MetricResult<FinancialMetrics> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load financial metrics',
          }))
      : Promise.resolve(null),
  ]);

  return {
    businessDate,
    property,
    rooms: roomsResult,
    frontdesk: frontdeskResult,
    reservations: reservationsResult,
    restaurant: restaurantResult,
    inventory: inventoryResult,
    financial: financialResult,
  };
}

import {
  ExecutiveKpiSummary,
  RevenuePerformanceData,
  BookingPerformanceData,
  RestaurantExecutiveData,
  RoomTypePerformanceItem,
  OperationalAttentionData,
  getExecutiveFinancialKpis,
  getRevenueTrend,
  getBookingPerformance,
  getRestaurantExecutiveAnalytics,
  getRoomTypePerformance,
  getOperationalAttention,
} from './executive';
import { resolvePeriodRange, ResolvedPeriodRange, DashboardPeriod } from './date';

export interface ExecutiveDashboardOverview {
  businessDate: string;
  property: {
    id: string;
    name: string;
    code: string;
    city: string;
  } | null;
  periodRange: ResolvedPeriodRange;
  financialKpis: MetricResult<ExecutiveKpiSummary> | null;
  revenuePerformance: MetricResult<RevenuePerformanceData> | null;
  bookingPerformance: MetricResult<BookingPerformanceData> | null;
  restaurantPerformance: MetricResult<RestaurantExecutiveData> | null;
  roomTypePerformance: MetricResult<RoomTypePerformanceItem[]> | null;
  operationalAttention: MetricResult<OperationalAttentionData> | null;
}

/**
 * Authoritative Executive Performance Dashboard Aggregator.
 * 
 * Invariants:
 * 1. RBAC enforcement server-side: Non-financial users receive null for financial metrics.
 * 2. Error containment: Domain query failures return { status: 'error', message } and are not masked as 0.
 * 3. Property context is dynamically queried from the database.
 * 4. Business date uses Asia/Kolkata timezone.
 * 5. Period range is deterministically resolved with zero data fabrication.
 */
export async function getExecutiveDashboardOverview(
  user: AuthenticatedUser,
  periodParam?: string | null,
  customStart?: string | null,
  customEnd?: string | null
): Promise<ExecutiveDashboardOverview> {
  const businessDate = getBusinessDateNow();
  const periodRange = resolvePeriodRange(periodParam, customStart, customEnd, businessDate);

  // Dynamic Property context
  let property = null;
  try {
    const propRecord = await prisma.property.findFirst({
      select: { id: true, name: true, code: true, city: true },
    });
    if (propRecord) {
      property = propRecord;
    }
  } catch (err) {
    console.error('[ExecutiveDashboard] Failed to fetch property:', err);
  }

  const propertyId = property?.id || '';

  // Server-side RBAC checks
  const canReadFinancial = hasPermission(user, 'reports:financial');
  const canReadBookings = hasPermission(user, 'booking:read');
  const canReadRestaurant = hasPermission(user, 'restaurant:order:read');
  const canReadRooms = hasPermission(user, 'room:read') || hasPermission(user, 'booking:read');

  // Parallel independent domain queries
  const [
    financialKpisResult,
    revenuePerformanceResult,
    bookingPerformanceResult,
    restaurantPerformanceResult,
    roomTypePerformanceResult,
    operationalAttentionResult,
  ] = await Promise.all([
    canReadFinancial
      ? getExecutiveFinancialKpis(propertyId, periodRange)
          .then((data): MetricResult<ExecutiveKpiSummary> => ({ status: 'success', data }))
          .catch((err): MetricResult<ExecutiveKpiSummary> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load executive financial KPIs',
          }))
      : Promise.resolve(null),

    canReadFinancial
      ? getRevenueTrend(propertyId, periodRange)
          .then((data): MetricResult<RevenuePerformanceData> => ({ status: 'success', data }))
          .catch((err): MetricResult<RevenuePerformanceData> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load revenue trend',
          }))
      : Promise.resolve(null),

    canReadBookings
      ? getBookingPerformance(propertyId, periodRange)
          .then((data): MetricResult<BookingPerformanceData> => ({ status: 'success', data }))
          .catch((err): MetricResult<BookingPerformanceData> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load booking performance',
          }))
      : Promise.resolve(null),

    canReadRestaurant
      ? getRestaurantExecutiveAnalytics(periodRange)
          .then((data): MetricResult<RestaurantExecutiveData> => ({ status: 'success', data }))
          .catch((err): MetricResult<RestaurantExecutiveData> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load restaurant analytics',
          }))
      : Promise.resolve(null),

    canReadRooms
      ? getRoomTypePerformance(propertyId, periodRange)
          .then((data): MetricResult<RoomTypePerformanceItem[]> => ({ status: 'success', data }))
          .catch((err): MetricResult<RoomTypePerformanceItem[]> => ({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load room type performance',
          }))
      : Promise.resolve(null),

    getOperationalAttention(propertyId, businessDate)
      .then((data): MetricResult<OperationalAttentionData> => ({ status: 'success', data }))
      .catch((err): MetricResult<OperationalAttentionData> => ({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unable to load operational alerts',
      })),
  ]);

  return {
    businessDate,
    property,
    periodRange,
    financialKpis: financialKpisResult,
    revenuePerformance: revenuePerformanceResult,
    bookingPerformance: bookingPerformanceResult,
    restaurantPerformance: restaurantPerformanceResult,
    roomTypePerformance: roomTypePerformanceResult,
    operationalAttention: operationalAttentionResult,
  };
}

export * from './date';
export * from './executive';
export * from './rooms';
export * from './frontdesk';
export * from './reservations';
export * from './restaurant';
export * from './inventory';
export * from './financial';
