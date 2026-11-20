import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';

function requestWithHeaders(values: Record<string, string>) {
  const headers = new Headers(values);
  return { headers };
}

describe('getClientIP', () => {
  it('prefers the address normalized by the trusted reverse proxy', () => {
    const request = requestWithHeaders({
      'x-real-ip': '203.0.113.8',
      'x-forwarded-for': '198.51.100.7, 192.0.2.4',
    });

    expect(getClientIP(request)).toBe('203.0.113.8');
  });

  it('ignores client-controlled forwarded addresses when no normalized header exists', () => {
    const request = requestWithHeaders({
      'x-forwarded-for': '198.51.100.7, 192.0.2.4',
    });

    expect(getClientIP(request)).toBe('unknown');
  });

  it('returns a stable fallback when no address is available', () => {
    expect(getClientIP(requestWithHeaders({}))).toBe('unknown');
  });
});

describe('rate limiter capacity', () => {
  afterEach(() => vi.useRealTimers());

  it('preserves live counters and shares one overflow budget across new keys', () => {
    vi.useFakeTimers();
    const limiter = createServerRateLimiter({ maxRequests: 2, windowMs: 60_000, maxTrackedIPs: 2, cleanupInterval: 50 });

    expect(limiter.check('first').limited).toBe(false);
    expect(limiter.check('first').limited).toBe(false);
    expect(limiter.check('second').limited).toBe(false);
    expect(limiter.check('second').limited).toBe(false);
    expect(limiter.check('overflow-a').limited).toBe(false);
    expect(limiter.check('overflow-b').limited).toBe(false);
    for (let index = 0; index < 100; index++) {
      expect(limiter.check(`new-${index}`)).toEqual({ limited: true, retryAfter: 60 });
    }
    expect(limiter.check('first').limited).toBe(true);
    expect(limiter.check('second').limited).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(limiter.check('first').limited).toBe(false);
    expect(limiter.check('second').limited).toBe(false);
    expect(limiter.check('overflow-c').limited).toBe(false);
    expect(limiter.check('overflow-d').limited).toBe(false);
    expect(limiter.check('overflow-e').limited).toBe(true);
  });

  it('reclaims stale per-IP buckets before using overflow', () => {
    vi.useFakeTimers();
    const limiter = createServerRateLimiter({ maxRequests: 1, windowMs: 60_000, maxTrackedIPs: 1 });
    limiter.check('stale');
    vi.advanceTimersByTime(30_000);
    limiter.check('overflow');
    vi.advanceTimersByTime(30_000);

    expect(limiter.check('new').limited).toBe(false);
    expect(limiter.check('new').limited).toBe(true);
    expect(limiter.check('another').limited).toBe(true);
  });
});
