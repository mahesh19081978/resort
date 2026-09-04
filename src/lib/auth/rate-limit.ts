export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
}

/**
 * Common Rate Limiter Interface.
 * Allows transparent swapping between Local Development (in-memory)
 * and Production (distributed Redis / Upstash / DB store).
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
 * NOTE: Serverless/multi-instance production environments (Vercel) must inject
 * a distributed RateLimiter implementation (e.g. Upstash Redis or PostgreSQL store).
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

// Active singleton instance (Local in-memory by default)
const defaultLimiter = new InMemoryRateLimiter();

export function checkLoginRateLimit(key: string): RateLimitResult {
  return defaultLimiter.check(key);
}

export function recordLoginAttempt(key: string, success: boolean): void {
  defaultLimiter.record(key, success);
}