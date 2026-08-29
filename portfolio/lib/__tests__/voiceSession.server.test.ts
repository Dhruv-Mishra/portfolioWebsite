import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOICE_AGENT_MODEL_ID, VOICE_AUTH_TOKEN_URL } from '@/lib/voiceAgentConfig';
import { mintVoiceSession } from '@/lib/voiceSession.server';

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
});

describe('voice session mint request contract', () => {
  beforeEach(() => {
    vi.stubEnv('VOICE_AGENT_API_KEY', 'test-voice-key');
    vi.stubEnv('STAGING_VOICE_AGENT_API_KEY', '');
    vi.stubEnv('PRODUCTION_VOICE_AGENT_API_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('MODEL_HEALTH_ENVIRONMENT', '');
  });

  it('posts one wrapped request to the v1beta endpoint and returns browser session context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      name: 'token-1',
      expireTime: '2030-01-01T00:00:00.000Z',
      newSessionExpireTime: '2030-01-01T00:01:00.000Z',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const minted = await mintVoiceSession({
      lowNetwork: true,
      resumeHandle: 'resume-1',
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
    expect(parseRequestBody(init as RequestInit)).toEqual({
      authToken: {
        uses: 1,
        expireTime: expect.any(String),
        newSessionExpireTime: expect.any(String),
        bidiGenerateContentSetup: {
          model: `models/${VOICE_AGENT_MODEL_ID}`,
        },
      },
    });
    expect(minted).toMatchObject({
      token: 'token-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      newSessionExpiresAt: '2030-01-01T00:01:00.000Z',
      resumeHandle: 'resume-1',
      setup: {
        modelLabel: 'native-live',
        voiceLabel: 'male',
        lowNetwork: true,
        clientState: expect.stringContaining('route /about'),
        resumeHandle: 'resume-1',
      },
    });
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