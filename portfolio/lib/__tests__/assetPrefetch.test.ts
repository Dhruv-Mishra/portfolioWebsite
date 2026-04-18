/**
 * Tests for the non-critical asset prefetch scheduler.
 *
 * Guarantees:
 *   - Idempotent — second call is a no-op even if the first is still in
 *     flight.
 *   - Respects Data Saver (`connection.saveData === true`) — skips entirely.
 *   - Respects slow-connection hints (`effectiveType` of `2g` / `slow-2g`)
 *     — skips entirely.
 *   - Fires a `requestIdleCallback` (or `setTimeout` fallback) when it does
 *     run.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type WindowShim = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

let idleCalls: Array<() => void> = [];
let timeoutCalls: Array<{ fn: () => void; ms: number }> = [];

beforeEach(() => {
  idleCalls = [];
  timeoutCalls = [];

  const windowShim: WindowShim = {
    requestIdleCallback: (cb) => {
      idleCalls.push(cb);
      return 1;
    },
    setTimeout: ((fn: () => void, ms: number) => {
      timeoutCalls.push({ fn, ms });
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout,
    clearTimeout: (() => undefined) as unknown as typeof clearTimeout,
  };

  Object.defineProperty(globalThis, 'window', {
    value: windowShim,
    configurable: true,
    writable: true,
  });

  // Navigator shim with no connection info by default → should prefetch.
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.resetModules();
});

async function loadPrefetch() {
  return import('@/lib/assetPrefetch');
}

describe('scheduleSuperuserPrefetch', () => {
  it('schedules a single idle callback on first call', async () => {
    const { scheduleSuperuserPrefetch, __resetAssetPrefetchForTest } = await loadPrefetch();
    __resetAssetPrefetchForTest();
    scheduleSuperuserPrefetch();
    expect(idleCalls.length).toBe(1);
  });

  it('is idempotent — a second call does not enqueue another idle callback', async () => {
    const { scheduleSuperuserPrefetch, __resetAssetPrefetchForTest } = await loadPrefetch();
    __resetAssetPrefetchForTest();
    scheduleSuperuserPrefetch();
    scheduleSuperuserPrefetch();
    scheduleSuperuserPrefetch();
    expect(idleCalls.length).toBe(1);
  });

  it('skips entirely when Data Saver is on', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { connection: { saveData: true } },
      configurable: true,
      writable: true,
    });
    const { scheduleSuperuserPrefetch, __resetAssetPrefetchForTest, __getPrefetchDebug } =
      await loadPrefetch();
    __resetAssetPrefetchForTest();
    expect(__getPrefetchDebug().shouldPrefetch).toBe(false);
    scheduleSuperuserPrefetch();
    // No idle callbacks queued — saveData short-circuit.
    expect(idleCalls.length).toBe(0);
  });

  it('skips entirely on slow-2g', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { connection: { effectiveType: 'slow-2g' } },
      configurable: true,
      writable: true,
    });
    const { scheduleSuperuserPrefetch, __resetAssetPrefetchForTest } = await loadPrefetch();
    __resetAssetPrefetchForTest();
    scheduleSuperuserPrefetch();
    expect(idleCalls.length).toBe(0);
  });

  it('skips entirely on 2g', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { connection: { effectiveType: '2g' } },
      configurable: true,
      writable: true,
    });
    const { scheduleSuperuserPrefetch, __resetAssetPrefetchForTest } = await loadPrefetch();
    __resetAssetPrefetchForTest();
    scheduleSuperuserPrefetch();
    expect(idleCalls.length).toBe(0);
  });

  it('prefetches normally on 4g', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { connection: { effectiveType: '4g' } },
      configurable: true,
      writable: true,
    });
    const { scheduleSuperuserPrefetch, __resetAssetPrefetchForTest } = await loadPrefetch();
    __resetAssetPrefetchForTest();
    scheduleSuperuserPrefetch();
    expect(idleCalls.length).toBe(1);
  });

  it('falls back to setTimeout when requestIdleCallback is not available', async () => {
    const windowShim: WindowShim = {
      setTimeout: ((fn: () => void, ms: number) => {
        timeoutCalls.push({ fn, ms });
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout,
      clearTimeout: (() => undefined) as unknown as typeof clearTimeout,
    };
    Object.defineProperty(globalThis, 'window', {
      value: windowShim,
      configurable: true,
      writable: true,
    });
    const { scheduleSuperuserPrefetch, __resetAssetPrefetchForTest } = await loadPrefetch();
    __resetAssetPrefetchForTest();
    scheduleSuperuserPrefetch();
    expect(timeoutCalls.length).toBeGreaterThan(0);
  });
});
