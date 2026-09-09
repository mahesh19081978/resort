/**
 * Reports & Analytics — Shared Domain Services Index
 *
 * Centralizes all report metric definitions and data access.
 * Ensures consistency with Executive Dashboard definitions where applicable.
 */

export { resolveReportPeriod, REPORT_DATE_FIELDS } from './date';
export type { ReportDateField } from './date';

export { getRevenueReport, getRevenueDetailRows } from './revenue';
export type { RevenueReportSummary, RevenueReportData, RevenueTrendPoint, RevenueByCategory, RevenueByPaymentContext } from './revenue';

export { getOccupancyReport } from './occupancy';
export type { OccupancyReportSummary, OccupancyReportData, OccupancyTrendPoint, OccupancyByRoomType } from './occupancy';

export { getReservationReport, getReservationDetailRows } from './reservations';
export type { ReservationReportSummary, ReservationReportData, ReservationTrendPoint, BookingSourceBreakdown, RoomTypeDemand } from './reservations';

export { getRestaurantReport, getRestaurantDetailRows } from './restaurant';
export type { RestaurantReportSummary, RestaurantReportData, RestaurantTrendPoint, TopSellingDish, SalesByCategory } from './restaurant';

export { getInventoryReport, getInventoryMovementRows } from './inventory';
export type { InventoryReportSummary, InventoryReportData, StockByStore, StockMovementSummary, LowStockItem } from './inventory';

export { getProcurementReport } from './procurement';
export type { ProcurementReportSummary, ProcurementReportData, VendorOutstanding, ProcurementTrendPoint } from './procurement';

export { getPaymentReport, getPaymentDetailRows } from './payments';
export type { PaymentReportSummary, PaymentReportData, PaymentByMethod, PaymentByContext, PaymentTrendPoint } from './payments';

export { getGuestReport } from './guests';
export type { GuestReportSummary, GuestReportData, GuestStaySummary } from './guests';

export { getAuditReport, getAuditLogRows } from './audit';
export type { AuditReportSummary, AuditReportData, AuditLogEntry } from './audit';

export { generateCsv, getCsvContentType, getExportFilename } from './exports';
export type { CsvExportOptions, CsvColumn } from './exports';

/**
 * METRIC DEFINITIONS — Single Source of Truth
 *
 * These definitions are shared between Reports & Executive Dashboard.
 * Any changes must be applied consistently.
 *
 * TOTAL RESORT REVENUE
 * = Sum of Room Revenue + Restaurant Revenue + Other Service Revenue
 * Where:
 * - Room Revenue = FolioItem (itemType: ROOM_CHARGE, isVoided: false) posted in period
 * - Restaurant Revenue = RestaurantBill (status: SETTLED or CHARGED_TO_ROOM) created in period
 * - Other Service Revenue = FolioItem (itemType: EXTRA_SERVICE_CHARGE, LAUNDRY_CHARGE, DAMAGE_FEE, MISC_CHARGE) unvoided, posted in period
 *
 * OCCUPANCY %
 * = occupied room nights / sellable room nights * 100
 * Where:
 * - Occupied room nights = physically occupied room-nights (Stay + RoomAssignment based)
 * - Sellable room nights = (total active rooms - out of order rooms) * days in period
 *
 * ADR (Average Daily Rate)
 * = Room Revenue / Occupied Room Nights
 * If 0 occupied nights, ADR = null (undefined)
 *
 * RevPAR (Revenue Per Available Room)
 * = Room Revenue / Available Sellable Room Nights
 * If 0 available nights, RevPAR = null (undefined)
 *
 * RESTAURANT REVENUE
 * = Sum of RestaurantBill.totalAmount where status IN (SETTLED, CHARGED_TO_ROOM)
 * Excludes DRAFT, CANCELLED, SPLIT_CHILDREN
 * Room-service charged to room counts as restaurant revenue
 *
 * PAYMENT COLLECTIONS
 * = Sum of successful Payment.amount (contexts: RESERVATION_ADVANCE, FOLIO_SETTLEMENT, RESTAURANT_BILL, DIRECT_SERVICE)
 * minus processed Refund.amount
 * VENDOR_PAYMENT excluded
 *
 * INVENTORY VALUATION
 * = Sum of Stock.quantityOnHand * Stock.weightedAverageCost across all items
 * Uses current WAC (historical valuation would require historical ledger costs)
 */
