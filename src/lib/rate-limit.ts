interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter kept in memory. Fine for one server process; use Redis/Upstash if you run several.
 * Returns ok=false once `max` hits happened inside `windowMs`.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterSec: number } {
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  return b.count > max
    ? { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
    : { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}
