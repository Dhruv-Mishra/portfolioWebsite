import { describe, expect, it } from 'vitest';

import { getClientIP } from '@/lib/serverRateLimit';

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

  it('uses the first forwarded address when no normalized header exists', () => {
    const request = requestWithHeaders({
      'x-forwarded-for': '198.51.100.7, 192.0.2.4',
    });

    expect(getClientIP(request)).toBe('198.51.100.7');
  });

  it('returns a stable fallback when no address is available', () => {
    expect(getClientIP(requestWithHeaders({}))).toBe('unknown');
  });
});