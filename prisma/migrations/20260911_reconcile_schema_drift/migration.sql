-- ============================================================================
-- 20260911_reconcile_schema_drift
-- Schema drift reconciliation migration
--
-- Prepared: 2026-09-11 (NOT YET APPLIED)
-- Database: Neon PostgreSQL neondb
-- Drift confirmed via information_schema / pg_catalog forensic audit
--
-- This migration fixes 5 confirmed drift items:
--   1. Tax.scope: text -> TaxScope enum (with NULL->OTHER coalesce)
--   2. StayNote.noteType: StayNoteType -> NoteType enum
--   3. Drop orphan StayNoteType enum
--   4. Drop 8 orphan InvoiceConfig columns
--   5. Drop orphan Invoice table
-- ============================================================================

-- ============================================================================
-- 1. TAX.SCOPE: Convert text column to TaxScope enum
--
-- Current state: text, nullable, no default
--   4 rows have scope = NULL, 3 rows have scope = 'RESTAURANT'
-- Target state: TaxScope enum, NOT NULL, DEFAULT 'OTHER'
--
-- Strategy: Use COALESCE to convert NULL to 'OTHER' before casting.
-- The TaxScope enum already exists in pg_catalog with values:
--   ROOM, RESTAURANT, SERVICE, OTHER
-- 'RESTAURANT' is a valid enum value -> preserved as-is.
-- NULL rows -> converted to 'OTHER' (the Prisma schema default).
-- ============================================================================
ALTER TABLE "Tax"
  ALTER COLUMN "scope" TYPE "TaxScope"
  USING COALESCE("scope", 'OTHER')::"TaxScope";

ALTER TABLE "Tax"
  ALTER COLUMN "scope" SET DEFAULT 'OTHER';

ALTER TABLE "Tax"
  ALTER COLUMN "scope" SET NOT NULL;

-- ============================================================================
-- 2. STAYNOTE.NOTETYPE: Convert StayNoteType enum to NoteType enum
--
-- Current state: column uses "StayNoteType" enum
-- Target state: column uses "NoteType" enum
-- Both enums have identical values:
--   OPERATIONAL, GUEST_PREFERENCE, ALERT, INTERNAL
--
-- Strategy: Cast through text to avoid enum mismatch errors.
-- Must drop default first (it references StayNoteType), alter type, then re-set.
-- ============================================================================
ALTER TABLE "StayNote" ALTER COLUMN "noteType" DROP DEFAULT;
ALTER TABLE "StayNote"
  ALTER COLUMN "noteType" TYPE "NoteType"
  USING "noteType"::text::"NoteType";
ALTER TABLE "StayNote" ALTER COLUMN "noteType" SET DEFAULT 'OPERATIONAL'::"NoteType";

-- ============================================================================
-- 3. DROP orphan StayNoteType enum
--
-- Verified: Only StayNote.noteType referenced StayNoteType.
-- After step 2, no database object references this enum.
-- ============================================================================
DROP TYPE "StayNoteType";

-- ============================================================================
-- 4. DROP orphan InvoiceConfig columns
--
-- Verified via codebase search:
--   - No application source references any of these columns
--   - No Prisma schema references any of these columns
--   - No FK, index, trigger, function, or view references them
--   - Created by failed/orphaned migration 20260910_pms_room_operations
--
-- Columns to remove:
--   propertyId, nextNumber, hotelName, hotelAddress,
--   hotelPhone, hotelEmail, hotelGstin, createdAt
--
-- NOTE: propertyId has a unique index that must be dropped first.
-- ============================================================================
DROP INDEX IF EXISTS "InvoiceConfig_propertyId_key";
ALTER TABLE "InvoiceConfig" DROP COLUMN "propertyId";
ALTER TABLE "InvoiceConfig" DROP COLUMN "nextNumber";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelName";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelAddress";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelPhone";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelEmail";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelGstin";
ALTER TABLE "InvoiceConfig" DROP COLUMN "createdAt";

-- ============================================================================
-- 5. DROP orphan Invoice table
--
-- Verified:
--   - Row count: 0
--   - No Prisma model in schema.prisma
--   - No application source code references the table
--   - No foreign keys reference this table
--   - No views, functions, or triggers depend on it
--   - Created by failed/orphaned migration 20260910_pms_room_operations
-- ============================================================================
DROP TABLE "Invoice";
