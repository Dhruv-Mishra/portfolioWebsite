/**
 * discoHaptics — unit tests for the 500ms beat pulse driver.
 *
 * Vitest runs in a node environment. We install minimal window + document
 * shims before importing the module so its `setInterval` / `visibilitychange`
 * paths can be exercised. Real timers are replaced with fake timers so we
 * can step forward by a known number of milliseconds and count fires.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let visibilityState: DocumentVisibilityState = 'visible';
let visibilityListeners: Array<() => void> = [];

function installShims(): void {
  Object.defineProperty(globalThis, 'window', {
    value: {
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms) as unknown as number,
      clearInterval: (id: number) => clearInterval(id as unknown as NodeJS.Timeout),
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: {
      get visibilityState(): DocumentVisibilityState {
        return visibilityState;
      },
      addEventListener: (type: string, handler: () => void): void => {
        if (type === 'visibilitychange') visibilityListeners.push(handler);
      },
      removeEventListener: (type: string, handler: () => void): void => {
        if (type === 'visibilitychange') {
          visibilityListeners = visibilityListeners.filter((h) => h !== handler);
        }
      },
    },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibilityState = 'visible';
  visibilityListeners = [];
  installShims();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

async function load() {
  return import('@/lib/discoHaptics');
}

describe('discoHaptics — lifecycle', () => {
  it('exports the correct beat interval constant (500ms = 120 BPM)', async () => {
    const { __test } = await load();
    expect(__test.DISCO_BEAT_INTERVAL_MS).toBe(500);
  });

  it('startDiscoHaptics schedules an interval that fires the pulse every 500ms', async () => {
    const { startDiscoHaptics, stopDiscoHaptics, __test } = await load();
    const pulse = vi.fn();

    startDiscoHaptics(pulse);
    expect(__test.isRunning()).toBe(true);
    expect(__test.hasPulse()).toBe(true);

    // No fires before the first 500ms elapse.
    vi.advanceTimersByTime(499);
    expect(pulse).not.toHaveBeenCalled();

    // First beat at t=500.
    vi.advanceTimersByTime(1);
    expect(pulse).toHaveBeenCalledTimes(1);

    // Next beat at t=1000.
    vi.advanceTimersByTime(500);
    expect(pulse).toHaveBeenCalledTimes(2);

    // And another at t=1500.
    vi.advanceTimersByTime(500);
    expect(pulse).toHaveBeenCalledTimes(3);

    stopDiscoHaptics();
    expect(__test.isRunning()).toBe(false);
  });

  it('stopDiscoHaptics clears the interval — no more fires afterwards', async () => {
    const { startDiscoHaptics, stopDiscoHaptics } = await load();
    const pulse = vi.fn();
    startDiscoHaptics(pulse);
    vi.advanceTimersByTime(500);
    expect(pulse).toHaveBeenCalledTimes(1);

    stopDiscoHaptics();
    vi.advanceTimersByTime(5000);
    // No additional fires after stop.
    expect(pulse).toHaveBeenCalledTimes(1);
  });

  it('stopDiscoHaptics is idempotent — calling twice is safe', async () => {
    const { startDiscoHaptics, stopDiscoHaptics, __test } = await load();
    const pulse = vi.fn();
    startDiscoHaptics(pulse);
    stopDiscoHaptics();
    expect(__test.isRunning()).toBe(false);
    // A second stop must not throw.
    expect(() => stopDiscoHaptics()).not.toThrow();
  });

  it('calling startDiscoHaptics twice swaps the pulse but keeps a single interval', async () => {
    const { startDiscoHaptics, stopDiscoHaptics, __test } = await load();
    const firstPulse = vi.fn();
    const secondPulse = vi.fn();

    startDiscoHaptics(firstPulse);
    vi.advanceTimersByTime(500);
    expect(firstPulse).toHaveBeenCalledTimes(1);
    expect(secondPulse).toHaveBeenCalledTimes(0);

    // Start with the new pulse — the module should keep one interval and
    // only call the new reference.
    startDiscoHaptics(secondPulse);
    expect(__test.isRunning()).toBe(true);

    vi.advanceTimersByTime(500);
    // firstPulse count is unchanged (the interval now points at secondPulse).
    expect(firstPulse).toHaveBeenCalledTimes(1);
    expect(secondPulse).toHaveBeenCalledTimes(1);

    stopDiscoHaptics();
  });

  it('continues to fire the pulse unchanged even if the consumer re-supplies the same reference', async () => {
    const { startDiscoHaptics, stopDiscoHaptics } = await load();
    const pulse = vi.fn();
    startDiscoHaptics(pulse);
    startDiscoHaptics(pulse);
    startDiscoHaptics(pulse);
    vi.advanceTimersByTime(500);
    expect(pulse).toHaveBeenCalledTimes(1);
    stopDiscoHaptics();
  });
});

describe('discoHaptics — visibility handling', () => {
  it('clears the interval when the tab goes hidden and restores when visible again', async () => {
    const { startDiscoHaptics, stopDiscoHaptics, __test } = await load();
    const pulse = vi.fn();
    startDiscoHaptics(pulse);
    expect(__test.hasVisibilityListener()).toBe(true);

    // One fire at t=500.
    vi.advanceTimersByTime(500);
    expect(pulse).toHaveBeenCalledTimes(1);

    // Tab goes hidden — manually fire the handler our shim captured.
    visibilityState = 'hidden';
    for (const h of visibilityListeners) h();
    expect(__test.isRunning()).toBe(false);

    // 10 beats pass while hidden — no pulses should fire.
    vi.advanceTimersByTime(5000);
    expect(pulse).toHaveBeenCalledTimes(1);

    // Tab becomes visible — interval restarts.
    visibilityState = 'visible';
    for (const h of visibilityListeners) h();
    expect(__test.isRunning()).toBe(true);

    // And the pulse fires again at the next beat.
    vi.advanceTimersByTime(500);
    expect(pulse).toHaveBeenCalledTimes(2);

    stopDiscoHaptics();
  });

  it('stopDiscoHaptics removes the visibility listener', async () => {
    const { startDiscoHaptics, stopDiscoHaptics, __test } = await load();
    startDiscoHaptics(vi.fn());
    expect(__test.hasVisibilityListener()).toBe(true);
    stopDiscoHaptics();
    expect(__test.hasVisibilityListener()).toBe(false);
    // And the captured listener array reflects the removal.
    expect(visibilityListeners.length).toBe(0);
  });

  it('starting while the tab is hidden does not schedule an interval', async () => {
    const { startDiscoHaptics, stopDiscoHaptics, __test } = await load();
    visibilityState = 'hidden';
    const pulse = vi.fn();
    startDiscoHaptics(pulse);
    expect(__test.isRunning()).toBe(false);
    // No fires at all.
    vi.advanceTimersByTime(5000);
    expect(pulse).not.toHaveBeenCalled();
    stopDiscoHaptics();
  });
});

describe('discoHaptics — error handling', () => {
  it('swallows exceptions thrown by the pulse function (best-effort)', async () => {
    const { startDiscoHaptics, stopDiscoHaptics } = await load();
    const pulse = vi.fn(() => {
      throw new Error('haptics blocked');
    });
    startDiscoHaptics(pulse);
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(pulse).toHaveBeenCalledTimes(1);
    // The module keeps scheduling — one exception doesn't kill the loop.
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(pulse).toHaveBeenCalledTimes(2);
    stopDiscoHaptics();
  });
});
