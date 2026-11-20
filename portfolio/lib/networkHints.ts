/**
 * Save-Data / slow-connection gate for non-critical warmup (route prefetch, superuser chunks, sounds).
 * Dependency-free so lazily loaded modules can share it without importing each other.
 * Without the Network Information API (Safari, Firefox) warmup stays allowed.
 */
interface NetworkInformation {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g']);

export function canWarmNoncriticalAssets(): boolean {
  if (typeof navigator === 'undefined') return true;
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!conn) return true;
  if (conn.saveData === true) return false;
  return !SLOW_EFFECTIVE_TYPES.has(conn.effectiveType ?? '');
}
