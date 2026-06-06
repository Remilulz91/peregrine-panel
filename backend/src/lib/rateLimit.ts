/**
 * Tiny in-memory IP rate-limiter (v0.23.0+).
 *
 * No external dependency, no Redis, just a Map<key, timestamps[]> kept
 * in process memory. Good enough for a single-instance Peregrine to
 * stop password-spraying attacks on `/api/auth/login` and
 * `/api/auth/mfa/verify`, and to throttle brute-force on the SFTP
 * server.
 *
 * On a multi-instance deployment behind a load balancer, each replica
 * has its own counter — an attacker could hit 5× max by distributing
 * across nodes. That's still 5× harder than no limit at all, and is
 * an acceptable trade-off for the single-process Peregrine.
 */

interface Bucket {
  /** Timestamps (ms since epoch) of recent attempts. */
  attempts: number[];
  /** When the IP is currently locked out (ms since epoch). 0 = not locked. */
  lockedUntil: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Max attempts allowed inside `windowMs`. */
  max: number;
  /** Window size, in milliseconds. */
  windowMs: number;
  /**
   * Optional lockout: when `max` is reached, the key is blocked for
   * this duration on top of the rolling window. 0 disables the
   * lockout (behaviour falls back to "drop the oldest as new attempts
   * come in"), default is `windowMs`.
   */
  lockoutMs?: number;
}

/** Returns true when this key has run out of its rate-limit budget. */
export function isRateLimited(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (bucket.lockedUntil > now) return true;
  // Prune old attempts.
  const cutoff = now - config.windowMs;
  bucket.attempts = bucket.attempts.filter((t) => t >= cutoff);
  if (bucket.attempts.length === 0 && bucket.lockedUntil === 0) {
    buckets.delete(key);
    return false;
  }
  return bucket.attempts.length >= config.max;
}

/**
 * Records one attempt against the bucket. If this attempt pushes the
 * count past `max`, the key gets locked for `lockoutMs` (or
 * `windowMs` by default). Call this AFTER deciding the attempt was a
 * failure — successful logins should not consume the budget.
 */
export function recordAttempt(key: string, config: RateLimitConfig): void {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { attempts: [], lockedUntil: 0 };
    buckets.set(key, bucket);
  }
  bucket.attempts.push(now);
  if (bucket.attempts.length >= config.max) {
    bucket.lockedUntil = now + (config.lockoutMs ?? config.windowMs);
  }
}

/** Clears the bucket for the given key (call this on successful login). */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}

/**
 * Returns the seconds until this key is allowed to retry. 0 means
 * "you can try right now". Useful for showing a friendly error in the
 * UI ("retry in N s") rather than a generic 429.
 */
export function retryAfterSeconds(
  key: string,
  config: RateLimitConfig,
): number {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  if (bucket.lockedUntil > now) {
    return Math.ceil((bucket.lockedUntil - now) / 1000);
  }
  if (bucket.attempts.length < config.max) return 0;
  const oldestRelevant = bucket.attempts[0];
  const releaseAt = oldestRelevant + config.windowMs;
  return Math.max(0, Math.ceil((releaseAt - now) / 1000));
}
