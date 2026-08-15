export const VOICE_AGENT_MODEL_ID = 'gemini-3.1-flash-live-preview';
export const VOICE_AGENT_VOICE_NAME = 'Charon';
export const VOICE_AGENT_INPUT_RATE = 16_000;
export const VOICE_AGENT_OUTPUT_RATE = 24_000;
export const VOICE_TOKEN_USES = 1;
export const VOICE_TOKEN_TTL_MS = 30 * 60 * 1000;
export const VOICE_NEW_SESSION_TTL_MS = 60 * 1000;
export const VOICE_FACTS_LIMIT = 3;
export const VOICE_AUDIO_FRAME_MS = 40;
export const VOICE_LOW_NETWORK_FRAME_MS = 60;

export const VOICE_LIVE_WS_PATH =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

export const VOICE_AUTH_TOKEN_URLS = [
  'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
  'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
  'https://generativelanguage.googleapis.com/v1alpha/authTokens',
  'https://generativelanguage.googleapis.com/v1beta/authTokens',
] as const;

export function resolveVoiceAgentApiKey(): string | null {
  const staged = process.env.STAGING_VOICE_AGENT_API_KEY?.trim();
  const production = process.env.PRODUCTION_VOICE_AGENT_API_KEY?.trim();
  const unified = process.env.VOICE_AGENT_API_KEY?.trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? '').toLowerCase();
  const isStaging = siteUrl.includes('staging.') || process.env.MODEL_HEALTH_ENVIRONMENT === 'staging';

  if (isStaging) return staged || unified || production || null;
  if (siteUrl.includes('whoisdhruv.com')) return production || unified || staged || null;
  return unified || staged || production || null;
}
