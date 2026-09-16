-- CreateEnum
CREATE TYPE "MenuItemAvailability" AS ENUM ('AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'SEASONAL_UNAVAILABLE');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "availabilityStatus" "MenuItemAvailability" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "prepTimeMinutes" INTEGER,
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MenuItem_availabilityStatus_idx" ON "MenuItem"("availabilityStatus");

-- CreateTable
CREATE TABLE "SittingArea" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SittingArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SittingArea_restaurantId_idx" ON "SittingArea"("restaurantId");
CREATE UNIQUE INDEX "SittingArea_restaurantId_code_key" ON "SittingArea"("restaurantId", "code");
CREATE UNIQUE INDEX "SittingArea_restaurantId_name_key" ON "SittingArea"("restaurantId", "name");

-- AddForeignKey
ALTER TABLE "SittingArea" ADD CONSTRAINT "SittingArea_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "RestaurantTable" ADD COLUMN "sittingAreaId" TEXT,
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "RestaurantTable_sittingAreaId_idx" ON "RestaurantTable"("sittingAreaId");

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_sittingAreaId_fkey" FOREIGN KEY ("sittingAreaId") REFERENCES "SittingArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Safe Data Backfill: Create SittingArea rows from distinct existing non-null sections in RestaurantTable
INSERT INTO "SittingArea" ("id", "restaurantId", "name", "code", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT 
    'sa_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20),
    rt."restaurantId",
    rt."section",
    CASE 
        WHEN rt."section" = 'Indoor Heritage AC' THEN 'INDOOR-AC'
        WHEN rt."section" = 'Open Forest Terrace' THEN 'TERRACE'
        ELSE upper(regexp_replace(rt."section", '[^a-zA-Z0-9]+', '-', 'g'))
    END,
    row_number() OVER (PARTITION BY rt."restaurantId" ORDER BY rt."section"),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "restaurantId", "section" 
    FROM "RestaurantTable" 
    WHERE "section" IS NOT NULL AND "section" != ''
) rt
ON CONFLICT ("restaurantId", "name") DO NOTHING;

-- Backfill sittingAreaId on existing RestaurantTable records matching their section
UPDATE "RestaurantTable" rt
SET "sittingAreaId" = sa."id"
FROM "SittingArea" sa
WHERE rt."restaurantId" = sa."restaurantId"
  AND rt."section" = sa."name"
  AND rt."sittingAreaId" IS NULL;
