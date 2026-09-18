-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('WEEKEND', 'SEASONAL', 'FESTIVAL', 'PROMOTION');

-- AlterTable
ALTER TABLE "ReservationRoom" ADD COLUMN "nightlyRateSnapshot" JSONB;

-- AlterTable
ALTER TABLE "RoomRate" ADD COLUMN "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "name" TEXT,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "rateType" "RateType" NOT NULL;

-- CreateIndex
CREATE INDEX "RoomRate_rateType_isActive_idx" ON "RoomRate"("rateType", "isActive");
