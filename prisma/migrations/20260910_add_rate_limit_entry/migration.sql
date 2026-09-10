-- CreateTable: RateLimitEntry for distributed rate limiting
-- Used by security/rate-limit.ts in production
-- NOT applied automatically — prepared per migration workflow

CREATE TABLE "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimitEntry_key_key" ON "RateLimitEntry"("key");
CREATE INDEX "RateLimitEntry_key_idx" ON "RateLimitEntry"("key");
CREATE INDEX "RateLimitEntry_expiresAt_idx" ON "RateLimitEntry"("expiresAt");
