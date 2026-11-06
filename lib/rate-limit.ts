/**
 * In-memory sliding-window rate limiting. Fine for a single region at low
 * volume and needs no secrets; move to a shared store if it runs multi-instance.
 */

/** Past this many keys, a hit sweeps out keys whose window has emptied. */
const SWEEP_AT = 10_000;

/** A limiter that allows `max` hits per key in any `windowMs`. Returns true when the hit is refused. */
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  return function rateLimited(key: string, now: number): boolean {
    if (hits.size > SWEEP_AT) {
      for (const [k, times] of hits) if (now - times[times.length - 1] >= windowMs) hits.delete(k);
    }
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    return false;
  };
}

/** The caller's IP as the platform proxy reports it (the first x-forwarded-for hop). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}
