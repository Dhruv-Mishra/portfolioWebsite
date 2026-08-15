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
        thinkingLevel: 'minimal',
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

async function mintFromUrl(url: string, apiKey: string, setup: ReturnType<typeof buildLockedLiveSetup>): Promise<GeminiAuthTokenResponse> {
  const response = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expireTime: toIso(VOICE_TOKEN_TTL_MS),
      newSessionExpireTime: toIso(VOICE_NEW_SESSION_TTL_MS),
      uses: VOICE_TOKEN_USES,
      bidiGenerateContentSetup: setup,
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({})) as GeminiAuthTokenResponse & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Token mint failed (${response.status})`);
  }
  return payload;
}

export async function mintVoiceSession(options: {
  lowNetwork: boolean;
}): Promise<VoiceSessionHandle> {
  const apiKey = resolveVoiceAgentApiKey();
  if (!apiKey) {
    throw new Error('Voice agent API key is not configured.');
  }

  const setup = buildLockedLiveSetup(options.lowNetwork);
  let lastError: unknown;
  for (const url of VOICE_AUTH_TOKEN_URLS) {
    try {
      const token = await mintFromUrl(url, apiKey, setup);
      if (!token.name) {
        throw new Error('Token mint returned no name.');
      }
      return {
        token: token.name,
        expiresAt: token.expireTime ?? toIso(VOICE_TOKEN_TTL_MS),
        newSessionExpiresAt: token.newSessionExpireTime ?? toIso(VOICE_NEW_SESSION_TTL_MS),
        setup: {
          modelLabel: 'native-live',
          voiceLabel: 'male',
          inputSampleRate: 16_000,
          outputSampleRate: 24_000,
          greetOnConnect: true,
          lowNetwork: options.lowNetwork,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to mint a voice session.');
}
