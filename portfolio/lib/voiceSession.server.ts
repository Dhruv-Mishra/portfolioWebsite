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
    expireTime: toIso(VOICE_TOKEN_TTL_MS),
    newSessionExpireTime: toIso(VOICE_NEW_SESSION_TTL_MS),
    uses: VOICE_TOKEN_USES,
  };
}

export function buildVoiceAuthTokenRequest(setup: ReturnType<typeof buildLockedLiveSetup> | null) {
  return {
    authToken: {
      ...tokenLifetimeFields(),
      ...(setup ? { bidiGenerateContentSetup: setup } : {}),
    },
  };
}

function buildLiveConnectConstraintsRequest() {
  return {
    ...tokenLifetimeFields(),
    liveConnectConstraints: {
      model: `models/${VOICE_AGENT_MODEL_ID}`,
      config: {
        responseModalities: ['AUDIO'],
        sessionResumption: {},
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: VOICE_AGENT_VOICE_NAME,
            },
          },
        },
      },
    },
  };
}

async function postAuthToken(url: string, apiKey: string, body: unknown): Promise<GeminiAuthTokenResponse> {
  const response = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({})) as GeminiAuthTokenResponse;
  if (!response.ok) {
    throw new Error(`Token mint failed (${response.status})`);
  }
  if (!payload.name) {
    throw new Error('Token mint returned no name.');
  }
  return payload;
}

export async function mintFromUrl(
  url: string,
  apiKey: string,
  setup: ReturnType<typeof buildLockedLiveSetup> | null,
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

async function mintAcrossUrls(apiKey: string, body: unknown): Promise<GeminiAuthTokenResponse | null> {
  for (const url of VOICE_AUTH_TOKEN_URLS) {
    try {
      return await postAuthToken(url, apiKey, body);
    } catch {
      // Try the next discovery path or mint body before failing closed.
    }
  }
  return null;
}

export async function mintVoiceSession(options: {
  lowNetwork: boolean;
}): Promise<VoiceSessionHandle> {
  const apiKey = resolveVoiceAgentApiKey();
  if (!apiKey) {
    throw new Error('Voice agent API key is not configured.');
  }

  const setup = buildLockedLiveSetup(options.lowNetwork);
  const locked = await mintAcrossUrls(apiKey, buildVoiceAuthTokenRequest(setup));
  if (locked) return toSessionHandle(locked, options.lowNetwork);

  const unlocked = await mintAcrossUrls(apiKey, buildVoiceAuthTokenRequest(null));
  if (unlocked) return toSessionHandle(unlocked, options.lowNetwork);

  const constrained = await mintAcrossUrls(apiKey, buildLiveConnectConstraintsRequest());
  if (constrained) return toSessionHandle(constrained, options.lowNetwork);

  throw new Error('Unable to mint a voice session.');
}
