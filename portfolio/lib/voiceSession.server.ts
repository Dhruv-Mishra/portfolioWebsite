import 'server-only';

import { SITE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
import {
  VOICE_AGENT_MODEL_ID,
  VOICE_AGENT_VOICE_NAME,
  VOICE_AUTH_TOKEN_URLS,
  VOICE_NEW_SESSION_TTL_MS,
  VOICE_TOKEN_TTL_MS,
  VOICE_TOKEN_USES,
  resolveVoiceAgentApiKey,
} from '@/lib/voiceAgentConfig';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';
import type { VoiceHealthStatus, VoiceSessionHandle } from '@/lib/voiceAgentProtocol';

function toIso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

export function getVoiceHealthStatus(): VoiceHealthStatus {
  const configured = Boolean(resolveVoiceAgentApiKey());
  return {
    ok: configured,
    configured,
    reason: configured ? undefined : 'Voice agent API key is not configured.',
  };
}

export function buildLockedLiveSetup(lowNetwork: boolean) {
  return {
    model: `models/${VOICE_AGENT_MODEL_ID}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: VOICE_AGENT_VOICE_NAME,
          },
        },
      },
      thinkingConfig: {
        thinkingLevel: 'MINIMAL',
      },
    },
    systemInstruction: {
      parts: [{ text: buildVoiceSystemInstruction() }],
    },
    tools: [{ functionDeclarations: SITE_TOOL_DECLARATIONS }],
    sessionResumption: {},
    contextWindowCompression: {
      slidingWindow: {},
    },
    inputAudioTranscription: lowNetwork ? undefined : {},
    outputAudioTranscription: lowNetwork ? undefined : {},
  };
}

interface GeminiAuthTokenResponse {
  name?: string;
  expireTime?: string;
  newSessionExpireTime?: string;
}

function tokenLifetimeFields() {
  return {
    uses: VOICE_TOKEN_USES,
    expireTime: toIso(VOICE_TOKEN_TTL_MS),
    newSessionExpireTime: toIso(VOICE_NEW_SESSION_TTL_MS),
  };
}

export function buildSlimLiveSetup() {
  return {
    model: `models/${VOICE_AGENT_MODEL_ID}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: VOICE_AGENT_VOICE_NAME,
          },
        },
      },
      thinkingConfig: {
        thinkingLevel: 'MINIMAL',
      },
    },
    sessionResumption: {},
  };
}

export function buildVoiceAuthTokenRequest(
  setup: ReturnType<typeof buildLockedLiveSetup> | ReturnType<typeof buildSlimLiveSetup> | null,
) {
  return {
    ...tokenLifetimeFields(),
    ...(setup ? { bidiGenerateContentSetup: setup } : {}),
  };
}

export function wrapVoiceAuthTokenRequest(
  body: ReturnType<typeof buildVoiceAuthTokenRequest>,
) {
  return { authToken: body };
}

function authTokenUrlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '/auth_tokens';
  }
}

async function postAuthToken(url: string, apiKey: string, body: unknown): Promise<GeminiAuthTokenResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({})) as GeminiAuthTokenResponse;
  if (!response.ok || !payload.name) {
    throw new Error(`Token mint failed (${response.status})`);
  }
  return payload;
}

export async function mintFromUrl(
  url: string,
  apiKey: string,
  setup: ReturnType<typeof buildLockedLiveSetup> | ReturnType<typeof buildSlimLiveSetup> | null,
): Promise<GeminiAuthTokenResponse> {
  return postAuthToken(url, apiKey, buildVoiceAuthTokenRequest(setup));
}

function toSessionHandle(token: GeminiAuthTokenResponse, lowNetwork: boolean): VoiceSessionHandle {
  return {
    token: token.name as string,
    expiresAt: token.expireTime ?? toIso(VOICE_TOKEN_TTL_MS),
    newSessionExpiresAt: token.newSessionExpireTime ?? toIso(VOICE_NEW_SESSION_TTL_MS),
    setup: {
      modelLabel: 'native-live',
      voiceLabel: 'male',
      inputSampleRate: 16_000,
      outputSampleRate: 24_000,
      greetOnConnect: true,
      lowNetwork,
    },
  };
}

async function mintAcrossUrls(
  apiKey: string,
  body: unknown,
): Promise<{ token: GeminiAuthTokenResponse } | { status: number; path: string }> {
  let lastFailure = { status: 0, path: '/auth_tokens' };
  for (const url of VOICE_AUTH_TOKEN_URLS) {
    try {
      return { token: await postAuthToken(url, apiKey, body) };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const statusMatch = /Token mint failed \((\d+)\)/.exec(message);
      lastFailure = {
        status: statusMatch ? Number(statusMatch[1]) : 0,
        path: authTokenUrlPath(url),
      };
    }
  }
  return lastFailure;
}

export async function mintVoiceSession(options: {
  lowNetwork: boolean;
}): Promise<VoiceSessionHandle> {
  const apiKey = resolveVoiceAgentApiKey();
  if (!apiKey) {
    throw new Error('Voice agent API key is not configured.');
  }

  const unlockedBody = buildVoiceAuthTokenRequest(null);
  const lockedBody = buildVoiceAuthTokenRequest(buildLockedLiveSetup(options.lowNetwork));
  const slimBody = buildVoiceAuthTokenRequest(buildSlimLiveSetup());
  const mintBodies = [
    unlockedBody,
    lockedBody,
    slimBody,
    wrapVoiceAuthTokenRequest(unlockedBody),
    wrapVoiceAuthTokenRequest(lockedBody),
    wrapVoiceAuthTokenRequest(slimBody),
  ];

  let lastFailure = { status: 0, path: '/auth_tokens' };
  for (const body of mintBodies) {
    const result = await mintAcrossUrls(apiKey, body);
    if ('token' in result) {
      return toSessionHandle(result.token, options.lowNetwork);
    }
    lastFailure = result;
  }

  console.error('[voice-session] mint failed', lastFailure);
  throw new Error('Unable to mint a voice session.');
}
