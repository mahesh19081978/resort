-- ============================================================================
-- 20260914_stay_extension_and_multi_guest
-- Additive migration for Stay Extension & Multi-Guest Check-In Phase
-- ============================================================================

-- 1. Add gender to Guest (nullable, backward compatible)
ALTER TABLE "Guest" ADD COLUMN IF NOT EXISTS "gender" TEXT;

-- 2. Add lifecycle & occupancy tracking fields to StayGuest
ALTER TABLE "StayGuest" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StayGuest" ADD COLUMN IF NOT EXISTS "leftAt" TIMESTAMP(3);
ALTER TABLE "StayGuest" ADD COLUMN IF NOT EXISTS "removedReason" TEXT;

-- 3. Create index on StayGuest (stayId, isActive) for fast active occupancy counting
CREATE INDEX IF NOT EXISTS "StayGuest_stayId_isActive_idx" ON "StayGuest"("stayId", "isActive");

-- 4. PostgreSQL Partial Unique Index: Enforce exactly one ACTIVE primary occupant per stay
-- Only one row per stayId can have isPrimary = true AND isActive = true
CREATE UNIQUE INDEX IF NOT EXISTS "StayGuest_one_active_primary_per_stay_idx"
ON "StayGuest"("stayId")
WHERE ("isPrimary" = true AND "isActive" = true);
