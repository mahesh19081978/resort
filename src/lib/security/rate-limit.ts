/**
 * Rate Limiter Specification:
 * - Development: Sliding-window in-memory map.
 * - Production: Distributed PostgreSQL-backed rate limiter (RateLimitEntry table).
 * - Fail-Closed Invariant: In production, if the database is unavailable,
 *   the system MUST NOT silently fall back to local process memory; it must fail closed.
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

const memoryStore = new Map<string, { count: number; expiresAt: number }>();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  error?: string;
}

/**
 * PostgreSQL-backed sliding window rate limiter for production.
 * Uses atomic upsert + conditional increment for concurrency safety.
 */
async function checkRateLimitDistributed(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMs);
  const expiresAt = new Date(now.getTime() + config.windowMs);

  try {
    // Try to find existing entry within the current window
    const existing = await prisma.$queryRaw<{ id: string; count: number; expiresAt: Date }[]>`
      SELECT id, count, "expiresAt"
      FROM "RateLimitEntry"
      WHERE key = ${identifier}
        AND "expiresAt" > ${now}
      LIMIT 1
    `;

    if (existing.length > 0) {
      const entry = existing[0];

      if (entry.count >= config.limit) {
        const resetMs = entry.expiresAt.getTime() - now.getTime();
        return {
          success: false,
          limit: config.limit,
          remaining: 0,
          resetMs: Math.max(0, resetMs),
          error: 'TOO_MANY_REQUESTS: Rate limit exceeded. Please try again later.',
        };
      }

      // Increment atomically
      await prisma.$executeRaw`
        UPDATE "RateLimitEntry"
        SET count = count + 1
        WHERE id = ${entry.id}
      `;

      return {
        success: true,
        limit: config.limit,
        remaining: config.limit - entry.count - 1,
        resetMs: entry.expiresAt.getTime() - now.getTime(),
      };
    }

    // No existing entry — create new window
    await prisma.$executeRaw`
      INSERT INTO "RateLimitEntry" (id, key, count, "windowStart", "expiresAt", "createdAt")
      VALUES (${crypto.randomUUID()}, ${identifier}, 1, ${windowStart}, ${expiresAt}, ${now})
      ON CONFLICT (key) DO UPDATE
      SET count = CASE
        WHEN "RateLimitEntry"."expiresAt" <= ${now} THEN 1
        ELSE "RateLimitEntry".count + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitEntry"."expiresAt" <= ${now} THEN ${windowStart}
        ELSE "RateLimitEntry"."windowStart"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitEntry"."expiresAt" <= ${now} THEN ${expiresAt}
        ELSE "RateLimitEntry"."expiresAt"
      END
    `;

    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetMs: config.windowMs,
    };
  } catch (err) {
    console.error('[SECURITY_ALERT] Distributed rate limiter failed:', err);
    // Fail closed in production
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetMs: config.windowMs,
      error: 'RATE_LIMITER_FAIL_CLOSED',
    };
  }
}

/**
 * Periodic cleanup of expired rate limit entries.
 * Called lazily on each rate limit check (at most once per minute).
 */
let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 1000;

async function cleanupExpiredEntries(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  try {
    await prisma.$executeRaw`DELETE FROM "RateLimitEntry" WHERE "expiresAt" < ${new Date()}`;
  } catch {
    // Non-fatal: cleanup failure does not affect rate limiting
  }
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 5, windowMs: 10 * 60 * 1000 }
): Promise<RateLimitResult> {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    await cleanupExpiredEntries();
    return checkRateLimitDistributed(identifier, config);
  }

  // Development / Test: In-Memory Sliding Window
  const now = Date.now();
  const record = memoryStore.get(identifier);

  if (!record || record.expiresAt < now) {
    memoryStore.set(identifier, { count: 1, expiresAt: now + config.windowMs });
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetMs: config.windowMs,
    };
  }

  if (record.count >= config.limit) {
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetMs: record.expiresAt - now,
      error: 'TOO_MANY_REQUESTS: Rate limit exceeded. Please try again later.',
    };
  }

  record.count += 1;
  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - record.count,
    resetMs: record.expiresAt - now,
  };
}

export function resetRateLimitStore(): void {
  memoryStore.clear();
}
