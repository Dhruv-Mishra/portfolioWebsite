import 'server-only';

import { VOICE_LIVE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
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
import {
  pickVoiceWelcome,
  VOICE_LIVE_REALTIME_INPUT_CONFIG,
  type VoiceHealthStatus,
  type VoiceSessionHandle,
} from '@/lib/voiceAgentProtocol';

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
    tools: [{ functionDeclarations: VOICE_LIVE_TOOL_DECLARATIONS }],
    sessionResumption: {},
    contextWindowCompression: {
      slidingWindow: {},
    },
    realtimeInputConfig: VOICE_LIVE_REALTIME_INPUT_CONFIG,
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
    realtimeInputConfig: VOICE_LIVE_REALTIME_INPUT_CONFIG,
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
  const welcome = pickVoiceWelcome();
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
      welcomeGreeting: welcome.greeting,
      welcomeHint: welcome.hint,
    },
  };
}

type VoiceMintRecipeKind = 'unlocked' | 'locked' | 'slim';

interface VoiceMintRecipe {
  kind: VoiceMintRecipeKind;
  wrapped: boolean;
  url: string;
}

let cachedMintRecipe: VoiceMintRecipe | null = null;

export function resetVoiceMintRecipeCache(): void {
  cachedMintRecipe = null;
}

function buildMintBody(
  kind: VoiceMintRecipeKind,
  lowNetwork: boolean,
  wrapped: boolean,
) {
  const setup = kind === 'unlocked'
    ? null
    : kind === 'locked'
      ? buildLockedLiveSetup(lowNetwork)
      : buildSlimLiveSetup();
  const body = buildVoiceAuthTokenRequest(setup);
  return wrapped ? wrapVoiceAuthTokenRequest(body) : body;
}

function recipeCandidates(): Array<Omit<VoiceMintRecipe, 'url'>> {
  const kinds: VoiceMintRecipeKind[] = ['unlocked', 'locked', 'slim'];
  return [
    ...kinds.map(kind => ({ kind, wrapped: false })),
    ...kinds.map(kind => ({ kind, wrapped: true })),
  ];
}

export async function mintVoiceSession(options: {
  lowNetwork: boolean;
}): Promise<VoiceSessionHandle> {
  const apiKey = resolveVoiceAgentApiKey();
  if (!apiKey) {
    throw new Error('Voice agent API key is not configured.');
  }

  let lastFailure = { status: 0, path: '/auth_tokens' };

  const tryRecipe = async (recipe: VoiceMintRecipe): Promise<GeminiAuthTokenResponse | null> => {
    try {
      const token = await postAuthToken(
        recipe.url,
        apiKey,
        buildMintBody(recipe.kind, options.lowNetwork, recipe.wrapped),
      );
      cachedMintRecipe = recipe;
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const statusMatch = /Token mint failed \((\d+)\)/.exec(message);
      lastFailure = {
        status: statusMatch ? Number(statusMatch[1]) : 0,
        path: authTokenUrlPath(recipe.url),
      };
      return null;
    }
  };

  if (cachedMintRecipe) {
    const cached = await tryRecipe(cachedMintRecipe);
    if (cached) return toSessionHandle(cached, options.lowNetwork);
    cachedMintRecipe = null;
  }

  for (const candidate of recipeCandidates()) {
    for (const url of VOICE_AUTH_TOKEN_URLS) {
      const token = await tryRecipe({ ...candidate, url });
      if (token) return toSessionHandle(token, options.lowNetwork);
    }
  }

  console.error('[voice-session] mint failed', lastFailure);
  throw new Error('Unable to mint a voice session.');
}
