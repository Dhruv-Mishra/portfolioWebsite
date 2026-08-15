import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOICE_AGENT_MODEL_ID, VOICE_AUTH_TOKEN_URLS } from '@/lib/voiceAgentConfig';
import { VOICE_WELCOME_VARIATIONS } from '@/lib/voiceAgentProtocol';
import {
  buildLockedLiveSetup,
  buildSlimLiveSetup,
  buildVoiceAuthTokenRequest,
  mintFromUrl,
  mintVoiceSession,
  resetVoiceMintRecipeCache,
  wrapVoiceAuthTokenRequest,
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

function requestHeaders(init: RequestInit | undefined): Record<string, string> {
  expect(init?.headers).toBeTruthy();
  return init?.headers as Record<string, string>;
}

function expectHeaderAuth(url: unknown, init: RequestInit | undefined) {
  expect(String(url)).not.toContain('key=');
  expect(requestHeaders(init)['x-goog-api-key']).toBe('test-voice-key');
  expect(requestHeaders(init)['Content-Type']).toBe('application/json');
}

afterEach(() => {
  resetVoiceMintRecipeCache();
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

  it('lists discovery paths with v1beta auth_tokens then v1alpha auth_tokens', () => {
    expect([...VOICE_AUTH_TOKEN_URLS]).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
      'https://generativelanguage.googleapis.com/v1beta/authTokens',
      'https://generativelanguage.googleapis.com/v1alpha/authTokens',
    ]);
  });

  it('builds unlocked and constrained bodies without wrapping or liveConnectConstraints', () => {
    const lockedSetup = buildLockedLiveSetup(false);
    const slimSetup = buildSlimLiveSetup();
    const unlocked = buildVoiceAuthTokenRequest(null);
    const locked = buildVoiceAuthTokenRequest(lockedSetup);
    const slim = buildVoiceAuthTokenRequest(slimSetup);

    expect(lockedSetup.model).toBe(`models/${VOICE_AGENT_MODEL_ID}`);
    expect(lockedSetup.generationConfig.thinkingConfig.thinkingLevel).toBe('MINIMAL');
    const lockedPrompt = lockedSetup.systemInstruction.parts[0]?.text ?? '';
    expect(lockedPrompt).toContain('contextually relevant next-step question');
    for (const variation of VOICE_WELCOME_VARIATIONS) {
      expect(lockedPrompt).not.toContain(variation.greeting);
      expect(lockedPrompt).not.toContain(variation.hint);
    }
    expect(slimSetup.generationConfig.thinkingConfig.thinkingLevel).toBe('MINIMAL');
    expect(
      lockedSetup.tools[0]?.functionDeclarations.some(tool => tool.name === 'start_voice_session'),
    ).toBe(false);

    expect(unlocked).toMatchObject({
      uses: 1,
    });
    expect(unlocked).toHaveProperty('expireTime');
    expect(unlocked).toHaveProperty('newSessionExpireTime');
    expect(unlocked).not.toHaveProperty('authToken');
    expect(unlocked).not.toHaveProperty('liveConnectConstraints');
    expect(unlocked).not.toHaveProperty('bidiGenerateContentSetup');

    expect(locked).not.toHaveProperty('authToken');
    expect(locked).not.toHaveProperty('liveConnectConstraints');
    expect(locked.bidiGenerateContentSetup).toEqual(lockedSetup);

    expect(slim).not.toHaveProperty('authToken');
    expect(slim).not.toHaveProperty('liveConnectConstraints');
    expect(slim.bidiGenerateContentSetup).toEqual(slimSetup);
    expect(wrapVoiceAuthTokenRequest(unlocked)).toEqual({ authToken: unlocked });
  });

  it('retries a later auth token URL after a 404 and returns the minted name', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: 'secret google detail' } }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'token-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const minted = await mintVoiceSession({ lowNetwork: false });
    expect(minted).toMatchObject({
      token: 'token-1',
      setup: {
        modelLabel: 'native-live',
        voiceLabel: 'male',
        greetOnConnect: true,
        lowNetwork: false,
      },
    });
    expect(VOICE_WELCOME_VARIATIONS.some(variation => variation.greeting === minted.setup.welcomeGreeting)).toBe(true);
    expect(VOICE_WELCOME_VARIATIONS.some(variation => variation.hint === minted.setup.welcomeHint)).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const [url, init] of fetchMock.mock.calls) {
      expectHeaderAuth(url, init as RequestInit);
      expect(String(url)).toMatch(/auth_tokens|authTokens/);
      const body = parseRequestBody(init as RequestInit);
      expect(body).not.toHaveProperty('authToken');
      expect(body).not.toHaveProperty('liveConnectConstraints');
      expect(body).not.toHaveProperty('bidiGenerateContentSetup');
    }

    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1beta/auth_tokens');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1alpha/auth_tokens');
  });

  it('reuses the first successful body+url recipe on later mints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: 'missing' } }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'token-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'token-2' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: false })).resolves.toMatchObject({ token: 'token-1' });
    await expect(mintVoiceSession({ lowNetwork: true })).resolves.toMatchObject({ token: 'token-2' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/v1alpha/auth_tokens');
    const cachedBody = parseRequestBody(fetchMock.mock.calls[2]?.[1] as RequestInit);
    expect(cachedBody).not.toHaveProperty('authToken');
    expect(cachedBody).not.toHaveProperty('bidiGenerateContentSetup');
  });

  it('posts the unwrapped locked body from mintFromUrl with header auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { name: 'token-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      mintFromUrl(VOICE_AUTH_TOKEN_URLS[0], 'test-voice-key', buildLockedLiveSetup(true)),
    ).resolves.toEqual({ name: 'token-1' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(VOICE_AUTH_TOKEN_URLS[0]);
    expectHeaderAuth(url, init as RequestInit);
    const body = parseRequestBody(init as RequestInit);
    expect(body).not.toHaveProperty('authToken');
    expect(body).not.toHaveProperty('liveConnectConstraints');
    expect(isRecord(body.bidiGenerateContentSetup)).toBe(true);
    const setup = body.bidiGenerateContentSetup;
    if (isRecord(setup) && isRecord(setup.generationConfig)) {
      const thinking = setup.generationConfig.thinkingConfig;
      expect(isRecord(thinking) && thinking.thinkingLevel).toBe('MINIMAL');
    }
  });

  it('tries unlocked first and can succeed later with bidiGenerateContentSetup', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBody(init);
      if (body.authToken || body.liveConnectConstraints) {
        return jsonResponse(400, { error: { message: 'wrapped rejected' } });
      }
      if (!('bidiGenerateContentSetup' in body)) {
        return jsonResponse(400, { error: { message: 'unlocked rejected' } });
      }
      return jsonResponse(200, { name: 'token-1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: true })).resolves.toMatchObject({
      token: 'token-1',
      setup: { lowNetwork: true },
    });

    const firstBody = parseRequestBody(fetchMock.mock.calls[0]?.[1] as RequestInit);
    expect(firstBody).not.toHaveProperty('authToken');
    expect(firstBody).not.toHaveProperty('liveConnectConstraints');
    expect(firstBody).not.toHaveProperty('bidiGenerateContentSetup');

    const successCall = fetchMock.mock.calls.find(([, init]) => {
      const body = parseRequestBody(init as RequestInit);
      return isRecord(body.bidiGenerateContentSetup) && !('authToken' in body);
    });
    expect(successCall).toBeTruthy();
    const successBody = parseRequestBody(successCall?.[1] as RequestInit);
    const setup = successBody.bidiGenerateContentSetup;
    expect(isRecord(setup)).toBe(true);
    if (isRecord(setup) && isRecord(setup.generationConfig)) {
      const thinking = setup.generationConfig.thinkingConfig;
      expect(isRecord(thinking) && thinking.thinkingLevel).toBe('MINIMAL');
    }

    for (const [url, init] of fetchMock.mock.calls) {
      expectHeaderAuth(url, init as RequestInit);
    }
  });

  it('accepts wrapped authToken only after official unwrapped bodies fail', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBody(init);
      if (isRecord(body.authToken)) {
        return jsonResponse(200, { name: 'token-1' });
      }
      return jsonResponse(400, { error: { message: 'unwrapped rejected' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintVoiceSession({ lowNetwork: false })).resolves.toMatchObject({
      token: 'token-1',
    });

    const firstBody = parseRequestBody(fetchMock.mock.calls[0]?.[1] as RequestInit);
    expect(firstBody).not.toHaveProperty('authToken');
    expect(firstBody).not.toHaveProperty('liveConnectConstraints');

    const wrappedCall = fetchMock.mock.calls.find(([, init]) => {
      const body = parseRequestBody(init as RequestInit);
      return isRecord(body.authToken);
    });
    expect(wrappedCall).toBeTruthy();
    expect(fetchMock.mock.calls.indexOf(wrappedCall!)).toBeGreaterThan(0);
  });

  it('never forwards Google error.message in thrown mint errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: { message: 'secret google detail' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(mintFromUrl(VOICE_AUTH_TOKEN_URLS[0], 'test-voice-key', null))
      .rejects
      .toThrow('Token mint failed (403)');

    let sessionError: unknown;
    try {
      await mintVoiceSession({ lowNetwork: false });
    } catch (error) {
      sessionError = error;
    }

    expect(sessionError).toBeInstanceOf(Error);
    expect((sessionError as Error).message).toBe('Unable to mint a voice session.');
    expect((sessionError as Error).message).not.toContain('secret google detail');
    expect(String(sessionError)).not.toContain('secret google detail');
  });
});
