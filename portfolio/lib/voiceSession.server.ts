import 'server-only';

import {
  VOICE_AUTH_TOKEN_URL,
  VOICE_NEW_SESSION_TTL_MS,
  VOICE_TOKEN_TTL_MS,
  VOICE_TOKEN_USES,
  resolveVoiceAgentApiKey,
} from '@/lib/voiceAgentConfig';
import {
  type VoiceHealthStatus,
  type VoiceSessionHandle,
} from '@/lib/voiceAgentProtocol';
import {
  buildVoiceClientStateParagraph,
  pickContextualVoiceWelcome,
  type VoiceClientSnapshot,
} from '@/lib/voiceClientSnapshot';

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

async function postAuthToken(apiKey: string): Promise<GeminiAuthTokenResponse> {
  const response = await fetch(VOICE_AUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(tokenLifetimeFields()),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({})) as GeminiAuthTokenResponse;
  if (!response.ok || !payload.name) {
    throw new Error('Token mint failed.');
  }
  return payload;
}

function toSessionHandle(
  token: GeminiAuthTokenResponse,
  lowNetwork: boolean,
  snapshot?: VoiceClientSnapshot,
): VoiceSessionHandle {
  const welcome = pickContextualVoiceWelcome(snapshot?.topic);
  const clientState = snapshot ? buildVoiceClientStateParagraph(snapshot) : '';
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
      ...(clientState ? { clientState } : {}),
    },
  };
}

export async function mintVoiceSession(options: {
  lowNetwork: boolean;
  snapshot?: VoiceClientSnapshot;
}): Promise<VoiceSessionHandle> {
  const apiKey = resolveVoiceAgentApiKey();
  if (!apiKey) {
    throw new Error('Voice agent API key is not configured.');
  }

  try {
    const token = await postAuthToken(apiKey);
    return toSessionHandle(token, options.lowNetwork, options.snapshot);
  } catch {
    console.error('[voice-session] mint failed');
    throw new Error('Unable to mint a voice session.');
  }
}
