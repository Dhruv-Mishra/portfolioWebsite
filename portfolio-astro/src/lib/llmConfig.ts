// lib/llmConfig.ts — Centralized LLM timeouts and configuration (single source of truth)

// ── Main chat timeouts ───────────────────────────────────────────────
/** Server-side timeout (ms) for the main chat completion request. */
export const LLM_MAIN_RESPONSE_TIMEOUT_MS = 40_000;

/** Buffer (ms) added on top of the server timeout to account for network overhead. */
const LLM_MAIN_RESPONSE_NETWORK_BUFFER_MS = 6_000;

/** Server-side timeout (ms) per main LLM provider before aborting the fetch. */
export const LLM_PROVIDER_TIMEOUT_MS = LLM_MAIN_RESPONSE_TIMEOUT_MS;

/** Client-side timeout (ms): abort the fetch to /api/chat after this duration. */
export const LLM_CLIENT_TIMEOUT_MS = LLM_MAIN_RESPONSE_TIMEOUT_MS + LLM_MAIN_RESPONSE_NETWORK_BUFFER_MS;

// ── Secondary timeouts ───────────────────────────────────────────────
/** Server-side timeout (ms) for suggestion LLM calls. Keep this shorter than main chat. */
export const LLM_SUGGESTIONS_TIMEOUT_MS = 12_000;

/** External API call timeout, e.g. joke API. */
export const EXTERNAL_API_TIMEOUT_MS = 5_000;

// ── Filler text tier delays (derived from client timeout) ────────────
// Show progressively funnier filler messages while waiting for the LLM.
// Tiers are spaced as fractions of the client timeout so they scale automatically.
/** Filler tier delays (ms) — when to swap in each progressively more human filler message. */
export const FILLER_DELAYS = {
  tier1: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.07),
  tier2: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.2),
  tier3: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.37),
  tier4: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.54),
  tier5: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.72),
  tier6: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.88),
} as const;

// ── Rate limit configuration (shared between client & server) ─────────
export const RATE_LIMIT_CONFIG = {
  chat: { maxRequests: 20, windowMs: 300_000 },
  suggestions: { maxRequests: 10, windowMs: 300_000 },
  feedback: { maxRequests: 3, windowMs: 3_600_000 },
  jokeApi: { maxRequests: 5, windowMs: 60_000 },
} as const;

// ── LLM suggestion parameters ────────────────────────────────────────
export const LLM_SUGGESTIONS_PARAMS = {
  temperature: 0.9,
  topP: 0.95,
  maxTokens: 80,
} as const;

// ── External API config ──────────────────────────────────────────────
export const GITHUB_API_VERSION = '2022-11-28';
export const GITHUB_API_TIMEOUT_MS = 10_000;

/**
 * Whether to log raw LLM responses to the server console.
 * Reads LOG_RAW env var. Always disabled in production.
 */
export function isRawLogEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.LOG_RAW === 'true';
}

/**
 * Strip `<think>...</think>` tags from LLM responses.
 * Some models (DeepSeek, etc.) include thinking blocks that shouldn't be shown to users.
 */
export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
