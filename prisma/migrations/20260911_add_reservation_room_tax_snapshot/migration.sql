-- Migration: Add tax snapshot fields to ReservationRoom
-- This is an ADDITIVE-only migration. No historical data is modified.
-- All new columns are nullable to preserve existing records.

ALTER TABLE "ReservationRoom" ADD COLUMN "taxId" TEXT;
ALTER TABLE "ReservationRoom" ADD COLUMN "taxCode" TEXT;
ALTER TABLE "ReservationRoom" ADD COLUMN "taxRate" DECIMAL(5, 2);
ALTER TABLE "ReservationRoom" ADD COLUMN "taxSnapshotAt" TIMESTAMP(3);
