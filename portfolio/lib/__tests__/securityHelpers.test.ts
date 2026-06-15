import { afterEach, describe, expect, it } from 'vitest';

import { getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

describe('server security helpers', () => {
  afterEach(() => {
    delete process.env.TRUST_X_FORWARDED_FOR;
  });

  it('requires a real allowed Origin for strict endpoints', async () => {
    const forgedMetadata = new Request('https://whoisdhruv.com/api/chat', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    });

    const response = validateOrigin(forgedMetadata, { requireOrigin: true });

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('allows fetch-metadata fallback only when explicitly requested', () => {
    const sameOriginBrowserGet = new Request('https://whoisdhruv.com/api/tts', {
      method: 'GET',
      headers: { 'sec-fetch-site': 'same-origin' },
    });

    expect(validateOrigin(sameOriginBrowserGet, {
      allowFetchMetadataFallback: true,
      requireOrigin: true,
    })).toBeNull();
  });

  it('allows configured production origins', () => {
    const sameOriginPost = new Request('https://whoisdhruv.com/api/chat', {
      method: 'POST',
      headers: { origin: 'https://whoisdhruv.com' },
    });

    expect(validateOrigin(sameOriginPost, { requireOrigin: true })).toBeNull();
  });

  it('prefers trusted proxy IP headers and ignores X-Forwarded-For by default', () => {
    const request = new Request('https://whoisdhruv.com/api/chat', {
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.99',
        'x-real-ip': '192.0.2.5',
      },
    });

    expect(getClientIP(request)).toBe('203.0.113.10');
  });

  it('does not trust spoofable X-Forwarded-For unless explicitly enabled', () => {
    const request = new Request('https://whoisdhruv.com/api/chat', {
      headers: { 'x-forwarded-for': '198.51.100.99' },
    });

    expect(getClientIP(request)).toBe('unknown');

    process.env.TRUST_X_FORWARDED_FOR = 'true';
    expect(getClientIP(request)).toBe('198.51.100.99');
  });
});