// lib/errorReporting.ts — Client-side error reporting stub.
// Real provider integration (Sentry, etc.) is intentionally NOT wired here.
// This module exists so call sites can call `reportError()` today and the
// surface area is in place when a provider is later picked. Respects the
// `NEXT_PUBLIC_ENABLE_ERROR_TRACKING` flag documented in README.

const ENABLED =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_ENABLE_ERROR_TRACKING === 'true';

interface ReportContext {
  digest?: string;
  source?: string;
  [key: string]: unknown;
}

/**
 * Report an error. No-op when error tracking is disabled. When enabled,
 * currently just logs to console with a stable prefix so server-side log
 * collectors can pick it up. Replace with a real provider when chosen.
 */
export function reportError(error: unknown, context: ReportContext = {}): void {
  if (!ENABLED) return;
  console.error('[reportError]', { error, context });
}
