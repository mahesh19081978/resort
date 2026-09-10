-- AlterTable: Add idempotencyKey to FolioItem
-- Safe: nullable column with unique constraint, no backfill needed
-- Existing historical FolioItems will have NULL idempotencyKey (valid for nullable unique)
ALTER TABLE "FolioItem" ADD COLUMN "idempotencyKey" TEXT;

-- CreateUniqueIndex: Only enforces uniqueness for non-null values
-- Nullable unique in PostgreSQL allows multiple NULLs
CREATE UNIQUE INDEX "FolioItem_idempotencyKey_key" ON "FolioItem"("idempotencyKey");
