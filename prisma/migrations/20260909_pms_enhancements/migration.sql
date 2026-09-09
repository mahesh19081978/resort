-- CreateEnum
CREATE TYPE "TaxScope" AS ENUM ('ROOM', 'RESTAURANT', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceChargeScope" AS ENUM ('EXTRA_SERVICE', 'ROOM_SERVICE', 'RESTAURANT', 'ALL');

-- CreateEnum
CREATE TYPE "ServiceChargeRateType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('OPERATIONAL', 'GUEST_PREFERENCE', 'ALERT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CancellationFeeType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FIRST_NIGHT', 'FULL_BOOKING');

-- AlterTable
ALTER TABLE "Folio" ADD COLUMN "invoiceIssuedAt" TIMESTAMP(3),
ADD COLUMN "invoiceNumber" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "taxCode" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "checkInTime" TEXT NOT NULL DEFAULT '14:00',
ADD COLUMN "checkOutTime" TEXT NOT NULL DEFAULT '12:00',
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN "gstin" TEXT,
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ADD COLUMN "website" TEXT;

-- AlterTable
ALTER TABLE "ReservationRoom" ADD COLUMN "cancellationFeeType" "CancellationFeeType",
ADD COLUMN "cancellationFeeValue" DECIMAL(10,4),
ADD COLUMN "cancellationHoursBeforeCheckIn" INTEGER,
ADD COLUMN "cancellationMaxFeeAmount" DECIMAL(12,2),
ADD COLUMN "cancellationMinFeeAmount" DECIMAL(12,2),
ADD COLUMN "cancellationPolicyCode" TEXT,
ADD COLUMN "cancellationPolicyId" TEXT,
ADD COLUMN "cancellationPolicySnapshotAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "closingTime" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "openingTime" TEXT,
ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "taxId" TEXT;

-- AlterTable
ALTER TABLE "Tax" ADD COLUMN "description" TEXT,
ADD COLUMN "effectiveFrom" TIMESTAMP(3),
ADD COLUMN "effectiveTo" TIMESTAMP(3),
ADD COLUMN "scope" "TaxScope" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "StayNote" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "noteType" "NoteType" NOT NULL DEFAULT 'OPERATIONAL',
    "content" TEXT NOT NULL,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StayNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCharge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "scope" "ServiceChargeScope" NOT NULL,
    "rateType" "ServiceChargeRateType" NOT NULL DEFAULT 'PERCENTAGE',
    "rateValue" DECIMAL(8,4) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "taxId" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "feeType" "CancellationFeeType" NOT NULL,
    "feeValue" DECIMAL(10,4) NOT NULL,
    "maxFeeAmount" DECIMAL(12,2),
    "minFeeAmount" DECIMAL(12,2),
    "hoursBeforeCheckIn" INTEGER,
    "ratePlanId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceConfig" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'DEFAULT',
    "prefix" TEXT NOT NULL DEFAULT 'INV',
    "yearMonth" TEXT NOT NULL DEFAULT '',
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "termsAndConditions" TEXT,
    "footerNote" TEXT,
    "showTaxBreakdown" BOOLEAN NOT NULL DEFAULT true,
    "showPaymentHistory" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StayNote_stayId_idx" ON "StayNote"("stayId");

-- CreateIndex
CREATE INDEX "StayNote_noteType_idx" ON "StayNote"("noteType");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCharge_code_key" ON "ServiceCharge"("code");

-- CreateIndex
CREATE INDEX "ServiceCharge_scope_isActive_idx" ON "ServiceCharge"("scope", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationPolicy_code_key" ON "CancellationPolicy"("code");

-- CreateIndex
CREATE INDEX "CancellationPolicy_ratePlanId_idx" ON "CancellationPolicy"("ratePlanId");

-- CreateIndex
CREATE INDEX "CancellationPolicy_isDefault_isActive_idx" ON "CancellationPolicy"("isDefault", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceConfig_singletonKey_key" ON "InvoiceConfig"("singletonKey");

-- CreateIndex
CREATE UNIQUE INDEX "Folio_invoiceNumber_key" ON "Folio"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Tax_scope_isActive_idx" ON "Tax"("scope", "isActive");

-- CreateIndex
CREATE INDEX "Tax_effectiveFrom_effectiveTo_idx" ON "Tax"("effectiveFrom", "effectiveTo");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayNote" ADD CONSTRAINT "StayNote_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "Stay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayNote" ADD CONSTRAINT "StayNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayNote" ADD CONSTRAINT "StayNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCharge" ADD CONSTRAINT "ServiceCharge_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationPolicy" ADD CONSTRAINT "CancellationPolicy_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
