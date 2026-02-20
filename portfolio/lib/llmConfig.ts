// lib/llmConfig.ts — Centralized LLM timeouts and configuration (single source of truth)

/** Server-side timeout (ms) per LLM provider before aborting the fetch. */
export const LLM_PROVIDER_TIMEOUT_MS = 25_000;

/** Server-side timeout (ms) for suggestion LLM calls (lighter, faster model). */
export const LLM_SUGGESTIONS_TIMEOUT_MS = 8_000;

/** Client-side timeout (ms): abort the fetch to /api/chat after this duration. */
export const LLM_CLIENT_TIMEOUT_MS = 30_000;

/** Additional client-side buffer (ms) on top of server timeout for network overhead. */
export const LLM_CLIENT_BUFFER_MS = 5_000;

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
