import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOICE_AGENT_MODEL_ID, VOICE_AUTH_TOKEN_URLS } from '@/lib/voiceAgentConfig';
import {
  buildLockedLiveSetup,
  buildVoiceAuthTokenRequest,
  mintFromUrl,
  mintVoiceSession,
} from '@/lib/voiceSession.server';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAcceptedMintBody(body: Record<string, unknown>): boolean {
  if (isRecord(body.authToken)) {
    return true;
  }
  return isRecord(body.liveConnectConstraints);
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

  it('lists discovery paths with snake_case auth_tokens first', () => {
    expect([...VOICE_AUTH_TOKEN_URLS]).toEqual([
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
      'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
      'https://generativelanguage.googleapis.com/v1alpha/authTokens',
      'https://generativelanguage.googleapis.com/v1beta/authTokens',
    ]);
  });

  it('wraps AuthToken fields and uses MINIMAL thinking when setup is present', () => {
    const setup = buildLockedLiveSetup(false);
    const locked = buildVoiceAuthTokenRequest(setup);
    const unlocked = buildVoiceAuthTokenRequest(null);

    expect(setup.model).toBe(`models/${VOICE_AGENT_MODEL_ID}`);
    expect(setup.generationConfig.thinkingConfig.thinkingLevel).toBe('MINIMAL');
    expect(locked.authToken.bidiGenerateContentSetup).toEqual(setup);
    expect(unlocked.authToken).not.toHaveProperty('bidiGenerateContentSetup');
    expect(unlocked.authToken).toMatchObject({
      uses: 1,
    });
  });

  it('retries a later auth token URL after a 404 and returns the minted name', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: 'secret google detail' } }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'token-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: false })).resolves.toMatchObject({
      token: 'token-1',
      setup: {
        modelLabel: 'native-live',
        voiceLabel: 'male',
        greetOnConnect: true,
        lowNetwork: false,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/auth_tokens|authTokens/);
      const body = parseRequestBody(init as RequestInit);
      expect(isAcceptedMintBody(body)).toBe(true);
      const setup = isRecord(body.authToken)
        ? body.authToken.bidiGenerateContentSetup
        : undefined;
      if (isRecord(setup) && isRecord(setup.generationConfig)) {
        const thinking = setup.generationConfig.thinkingConfig;
        expect(isRecord(thinking) && thinking.thinkingLevel).toBe('MINIMAL');
      }
    }

    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1alpha/auth_tokens');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1beta/auth_tokens');
    expect(String(fetchMock.mock.calls[0][0])).toContain('key=test-voice-key');
  });

  it('posts the wrapped authToken body from mintFromUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { name: 'token-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      mintFromUrl(VOICE_AUTH_TOKEN_URLS[0], 'test-voice-key', buildLockedLiveSetup(true)),
    ).resolves.toEqual({ name: 'token-1' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/v1alpha/auth_tokens');
    const body = parseRequestBody(init as RequestInit);
    expect(body).toHaveProperty('authToken');
    const setup = isRecord(body.authToken) ? body.authToken.bidiGenerateContentSetup : undefined;
    expect(isRecord(setup)).toBe(true);
    if (isRecord(setup) && isRecord(setup.generationConfig)) {
      const thinking = setup.generationConfig.thinkingConfig;
      expect(isRecord(thinking) && thinking.thinkingLevel).toBe('MINIMAL');
    }
  });

  it('falls back to unlocked then liveConnectConstraints mint bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBody(init);
      if (isRecord(body.authToken) && 'bidiGenerateContentSetup' in body.authToken) {
        return jsonResponse(400, { error: { message: 'locked rejected' } });
      }
      if (isRecord(body.authToken)) {
        return jsonResponse(400, { error: { message: 'unlocked rejected' } });
      }
      if (isRecord(body.liveConnectConstraints)) {
        return jsonResponse(200, { name: 'token-1' });
      }
      return jsonResponse(500, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: true })).resolves.toMatchObject({
      token: 'token-1',
      setup: { lowNetwork: true },
    });

    const lastBody = parseRequestBody(fetchMock.mock.calls.at(-1)?.[1] as RequestInit);
    expect(lastBody).toMatchObject({
      liveConnectConstraints: {
        model: `models/${VOICE_AGENT_MODEL_ID}`,
        config: {
          responseModalities: ['AUDIO'],
          sessionResumption: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' },
            },
          },
        },
      },
    });
    expect(lastBody).not.toHaveProperty('authToken');
  });
});
