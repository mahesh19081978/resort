-- ============================================================================
-- 20260911_reconcile_schema_drift_v2
-- Schema drift reconciliation (retry with fixed StayNote.default handling)
--
-- Previous attempt (20260911_reconcile_schema_drift) was rolled back after
-- failing on StayNote.noteType default cast. This migration fixes that issue
-- by dropping the default before altering the column type.
-- ============================================================================

-- 1. TAX.SCOPE: text -> TaxScope enum
--    4 rows NULL -> OTHER, 3 rows RESTAURANT -> preserved
ALTER TABLE "Tax"
  ALTER COLUMN "scope" TYPE "TaxScope"
  USING COALESCE("scope", 'OTHER')::"TaxScope";
ALTER TABLE "Tax" ALTER COLUMN "scope" SET DEFAULT 'OTHER';
ALTER TABLE "Tax" ALTER COLUMN "scope" SET NOT NULL;

-- 2. STAYNOTE.NOTETYPE: StayNoteType -> NoteType
--    Must drop default first (it references StayNoteType), then alter, then re-set.
ALTER TABLE "StayNote" ALTER COLUMN "noteType" DROP DEFAULT;
ALTER TABLE "StayNote"
  ALTER COLUMN "noteType" TYPE "NoteType"
  USING "noteType"::text::"NoteType";
ALTER TABLE "StayNote" ALTER COLUMN "noteType" SET DEFAULT 'OPERATIONAL'::"NoteType";

-- 3. DROP orphan StayNoteType enum (no longer referenced after step 2)
DROP TYPE "StayNoteType";

-- 4. DROP orphan InvoiceConfig columns (all verified empty, no references)
DROP INDEX IF EXISTS "InvoiceConfig_propertyId_key";
ALTER TABLE "InvoiceConfig" DROP COLUMN "propertyId";
ALTER TABLE "InvoiceConfig" DROP COLUMN "nextNumber";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelName";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelAddress";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelPhone";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelEmail";
ALTER TABLE "InvoiceConfig" DROP COLUMN "hotelGstin";
ALTER TABLE "InvoiceConfig" DROP COLUMN "createdAt";

-- 5. DROP orphan Invoice table (0 rows, no FK references, no Prisma model)
DROP TABLE "Invoice";
