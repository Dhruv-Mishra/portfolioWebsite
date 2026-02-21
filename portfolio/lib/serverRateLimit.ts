// lib/serverRateLimit.ts — Shared server-side in-memory rate limiter

interface RateLimitConfig {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Max tracked IPs before forced cleanup (default: 500) */
  maxTrackedIPs?: number;
  /** Cleanup frequency in request count (default: 50) */
  cleanupInterval?: number;
}

interface RateLimitResult {
  limited: boolean;
  retryAfter: number;
}

/**
 * Creates a per-IP rate limiter with configurable limits.
 * Uses an in-memory sliding window — suitable for single-instance deployments.
 */
export function createServerRateLimiter(config: RateLimitConfig) {
  const { maxRequests, windowMs, maxTrackedIPs = 500, cleanupInterval = 50 } = config;
  const ipRequests = new Map<string, number[]>();
  let requestsSinceCleanup = 0;

  function evictStaleEntries(): void {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of ipRequests) {
      const valid = times.filter(t => t > cutoff);
      if (valid.length === 0) {
        ipRequests.delete(ip);
      } else {
        ipRequests.set(ip, valid);
      }
    }
  }

  function check(ip: string): RateLimitResult {
    requestsSinceCleanup++;
    if (requestsSinceCleanup >= cleanupInterval || ipRequests.size > maxTrackedIPs) {
      requestsSinceCleanup = 0;
      evictStaleEntries();
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    let times = ipRequests.get(ip) || [];
    times = times.filter(t => t > windowStart);

    if (times.length >= maxRequests) {
      const retryAfter = Math.ceil((times[0] + windowMs - now) / 1000);
      return { limited: true, retryAfter };
    }

    times.push(now);
    ipRequests.set(ip, times);
    return { limited: false, retryAfter: 0 };
  }

  return { check };
}

/**
 * Extract client IP from a Next.js request, checking forwarded headers.
 */
export function getClientIP(request: { headers: { get(name: string): string | null } }): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}
