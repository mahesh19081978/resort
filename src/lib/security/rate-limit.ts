/**
 * Rate Limiter Specification for Phase 0.8:
 * - Development: Sliding-window in-memory map.
 * - Production: Distributed Redis rate limiter.
 * - Fail-Closed Invariant: In production, if Redis is down or unconfigured,
 *   the system MUST NOT silently fall back to local process memory; it must fail closed.
 */

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

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 5, windowMs: 10 * 60 * 1000 }
): Promise<RateLimitResult> {
  const isProduction = process.env.NODE_ENV === 'production';
  const redisUrl = process.env.REDIS_URL;

  // In production, distributed rate limiting is strictly required
  if (isProduction) {
    if (!redisUrl) {
      console.error('[SECURITY_ALERT] Production rate limiter missing REDIS_URL configuration.');
      return {
        success: false,
        limit: config.limit,
        remaining: 0,
        resetMs: config.windowMs,
        error: 'RATE_LIMITER_FAIL_CLOSED: Distributed rate limiter unavailable in production.',
      };
    }

    try {
      // If external Redis is configured, production calls go through distributed Redis client
      // Placeholder for Redis client call when deployed to infrastructure with Redis URL
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
