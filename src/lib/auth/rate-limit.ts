import { prisma } from '@/lib/db/prisma';

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
}

/**
 * Common Rate Limiter Interface.
 * Allows transparent swapping between Local Development (in-memory)
 * and Production (distributed PostgreSQL / Redis store).
 */
export interface RateLimiter {
  check(key: string): Promise<RateLimitResult> | RateLimitResult;
  record(key: string, success: boolean): Promise<void> | void;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-Memory Sliding Window Rate Limiter (LOCAL DEVELOPMENT ONLY).
 */
export class InMemoryRateLimiter implements RateLimiter {
  private attempts = new Map<string, RateLimitEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now > entry.resetAt) {
      return { allowed: true, remainingAttempts: this.maxAttempts };
    }

    if (entry.count >= this.maxAttempts) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    return { allowed: true, remainingAttempts: this.maxAttempts - entry.count };
  }

  record(key: string, success: boolean): void {
    const now = Date.now();
    if (success) {
      this.attempts.delete(key);
      return;
    }

    const entry = this.attempts.get(key);
    if (!entry || now > entry.resetAt) {
      this.attempts.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
    } else {
      entry.count += 1;
    }
  }
}

/**
 * PostgreSQL-backed Rate Limiter for Production.
 * Uses the RateLimitEntry table for distributed rate limiting.
 */
export class PostgresRateLimiter implements RateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = new Date();
    const prefix = 'login:';

    try {
      const existing = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
        SELECT count, "expiresAt"
        FROM "RateLimitEntry"
        WHERE key = ${prefix + key}
          AND "expiresAt" > ${now}
        LIMIT 1
      `;

      if (existing.length > 0) {
        const entry = existing[0];
        if (entry.count >= this.maxAttempts) {
          const retryAfterSeconds = Math.ceil((entry.expiresAt.getTime() - now.getTime()) / 1000);
          return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
        }
        return { allowed: true, remainingAttempts: this.maxAttempts - entry.count };
      }

      return { allowed: true, remainingAttempts: this.maxAttempts };
    } catch {
      // Fail closed in production
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds: 60 };
    }
  }

  async record(key: string, success: boolean): Promise<void> {
    const now = new Date();
    const prefix = 'login:';
    const fullKey = prefix + key;
    const expiresAt = new Date(now.getTime() + this.windowMs);

    try {
      if (success) {
        await prisma.$executeRaw`DELETE FROM "RateLimitEntry" WHERE key = ${fullKey}`;
        return;
      }

      await prisma.$executeRaw`
        INSERT INTO "RateLimitEntry" (id, key, count, "windowStart", "expiresAt", "createdAt")
        VALUES (${crypto.randomUUID()}, ${fullKey}, 1, ${now}, ${expiresAt}, ${now})
        ON CONFLICT (key) DO UPDATE
        SET count = CASE
          WHEN "RateLimitEntry"."expiresAt" <= ${now} THEN 1
          ELSE "RateLimitEntry".count + 1
        END,
        "expiresAt" = CASE
          WHEN "RateLimitEntry"."expiresAt" <= ${now} THEN ${expiresAt}
          ELSE "RateLimitEntry"."expiresAt"
        END
      `;
    } catch {
      // Non-fatal: record failure does not block login
    }
  }
}

// Production uses PostgreSQL, development uses in-memory
const isProduction = process.env.NODE_ENV === 'production';
const defaultLimiter: RateLimiter = isProduction
  ? new PostgresRateLimiter()
  : new InMemoryRateLimiter();

export function checkLoginRateLimit(key: string): RateLimitResult | Promise<RateLimitResult> {
  return defaultLimiter.check(key);
}

export function recordLoginAttempt(key: string, success: boolean): void | Promise<void> {
  return defaultLimiter.record(key, success);
}
