// lib/llmConfig.ts — Centralized LLM timeouts and configuration (single source of truth)
// All timeouts derive from LLM_BASE_TIMEOUT_MS. Change that one value to scale everything.

// ── Base timeout ─────────────────────────────────────────────────────
/** The fundamental server-side timeout (ms) per LLM provider fetch. Everything else derives from this. */
export const LLM_BASE_TIMEOUT_MS = 25_000;

/** Buffer (ms) added on top of the server timeout to account for network overhead. */
const NETWORK_BUFFER_MS = 5_000;

// ── Derived timeouts ─────────────────────────────────────────────────
/** Server-side timeout (ms) per LLM provider before aborting the fetch (= base). */
export const LLM_PROVIDER_TIMEOUT_MS = LLM_BASE_TIMEOUT_MS;

/** Server-side timeout (ms) for suggestion LLM calls (lighter, faster — ~32% of base). */
export const LLM_SUGGESTIONS_TIMEOUT_MS = Math.round(LLM_BASE_TIMEOUT_MS * 0.32);

/** Client-side timeout (ms): abort the fetch to /api/chat after this duration (base + network buffer). */
export const LLM_CLIENT_TIMEOUT_MS = LLM_BASE_TIMEOUT_MS + NETWORK_BUFFER_MS;

/** External API call timeout, e.g. joke API (~20% of base). */
export const EXTERNAL_API_TIMEOUT_MS = Math.round(LLM_BASE_TIMEOUT_MS * 0.2);

// ── Filler text tier delays (derived from client timeout) ────────────
// Show progressively funnier filler messages while waiting for the LLM.
// Tiers are spaced as fractions of the client timeout so they scale automatically.
/** Filler tier delays (ms) — when to swap in each progressively funnier filler message. */
export const FILLER_DELAYS = {
  tier1: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.067),  // ~2 000ms at 30s
  tier2: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.267),  // ~8 000ms at 30s
  tier3: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.467),  // ~14 000ms at 30s
  tier4: Math.round(LLM_CLIENT_TIMEOUT_MS * 0.667),  // ~20 000ms at 30s
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
