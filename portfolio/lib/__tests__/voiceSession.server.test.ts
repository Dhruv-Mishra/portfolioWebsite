import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOICE_AUTH_TOKEN_URL } from '@/lib/voiceAgentConfig';
import { mintVoiceSession, VOICE_TOKEN_REQUEST_TIMEOUT_MS } from '@/lib/voiceSession.server';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseRequestBody(init: RequestInit | undefined): Record<string, unknown> {
  expect(typeof init?.body).toBe('string');
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function requestHeaders(init: RequestInit | undefined): Record<string, string> {
  expect(init?.headers).toBeTruthy();
  return init?.headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('voice session mint request contract', () => {
  beforeEach(() => {
    vi.stubEnv('VOICE_AGENT_API_KEY', 'test-voice-key');
    vi.stubEnv('STAGING_VOICE_AGENT_API_KEY', '');
    vi.stubEnv('PRODUCTION_VOICE_AGENT_API_KEY', '');
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('MODEL_HEALTH_ENVIRONMENT', '');
  });

  it('posts one direct token request to the v1beta endpoint and returns browser session context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      name: 'token-1',
      expireTime: '2030-01-01T00:00:00.000Z',
      newSessionExpireTime: '2030-01-01T00:01:00.000Z',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const minted = await mintVoiceSession({
      lowNetwork: true,
      snapshot: { route: '/about', theme: 'dark', topic: 'about' },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(VOICE_AUTH_TOKEN_URL);
    expect(VOICE_AUTH_TOKEN_URL).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens');
    expect(requestHeaders(init as RequestInit)).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-voice-key',
    });
    expect((init as RequestInit).cache).toBe('no-store');
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(parseRequestBody(init as RequestInit)).toEqual({
      uses: 1,
      expireTime: expect.any(String),
      newSessionExpireTime: expect.any(String),
    });
    expect(minted).toMatchObject({
      token: 'token-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      newSessionExpiresAt: '2030-01-01T00:01:00.000Z',
      setup: {
        modelLabel: 'native-live',
        voiceLabel: 'male',
        lowNetwork: true,
        clientState: expect.stringContaining('route /about'),
      },
    });
  });

  it.each([
    ['staging', '', 'production-only'],
    ['production', 'staging-only', ''],
    ['', '', 'production-only'],
  ])('does not mint with another environment’s key: %s', async (environment, staged, production) => {
    vi.stubEnv('VOICE_AGENT_API_KEY', '');
    vi.stubEnv('MODEL_HEALTH_ENVIRONMENT', environment);
    vi.stubEnv('STAGING_VOICE_AGENT_API_KEY', staged);
    vi.stubEnv('PRODUCTION_VOICE_AGENT_API_KEY', production);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: false })).rejects.toThrow('Voice agent API key is not configured.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['fetch', 'deadline'], ['body', 'deadline'],
    ['fetch', 'disconnect'], ['body', 'disconnect'],
  ])('aborts token %s on %s', async (phase, cause) => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    const caller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const rejectOnAbort = (signal: AbortSignal) => new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const json = vi.fn(() => rejectOnAbort(providerSignal!));
    const fetchMock = vi.fn((_url: unknown, init: RequestInit) => {
      providerSignal = init.signal as AbortSignal;
      return phase === 'fetch' ? rejectOnAbort(providerSignal) : Promise.resolve({ ok: true, json });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = expect(mintVoiceSession({ lowNetwork: false, signal: caller.signal }))
      .rejects.toThrow('Unable to mint a voice session.');
    await vi.advanceTimersByTimeAsync(0);
    if (phase === 'body') expect(json).toHaveBeenCalledOnce();

    if (cause === 'deadline') {
      await vi.advanceTimersByTimeAsync(VOICE_TOKEN_REQUEST_TIMEOUT_MS - 1);
      expect(providerSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
    } else {
      caller.abort('client disconnected');
    }
    await pending;

    expect(AbortSignal.timeout).toHaveBeenCalledWith(8_000);
    expect(providerSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('skips token dispatch for an already-disconnected caller', async () => {
    const caller = new AbortController();
    caller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: false, signal: caller.signal }))
      .rejects.toThrow('Unable to mint a voice session.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a generic mint error without retrying or exposing provider details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: { message: 'secret google detail' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: false }))
      .rejects
      .toThrow('Unable to mint a voice session.');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});