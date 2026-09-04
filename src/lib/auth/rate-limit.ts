interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

/**
 * In-memory sliding window rate limiter for authentication endpoints.
 * Keyed by client IP or normalized email to prevent brute-force attacks.
 */
export function checkLoginRateLimit(key: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - entry.count };
}

export function recordLoginAttempt(key: string, success: boolean): void {
  const now = Date.now();
  if (success) {
    loginAttempts.delete(key);
    return;
  }

  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
  } else {
    entry.count += 1;
  }
}