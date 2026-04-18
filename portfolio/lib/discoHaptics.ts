/**
 * discoHaptics — module-level singleton that drives beat-synced haptic
 * pulses while disco mode is active. Paired with `DiscoHapticsBridge` in
 * `components/DiscoMediaLayer.tsx` so the interval lives exactly as long
 * as the heavy disco media tree.
 *
 * Behavior:
 *   - One vibration every 500 ms (120 BPM, matching `discoAudio.ts`). The
 *     pulse itself is a light-tap via the caller-supplied `fire` function,
 *     which is expected to be one of the channels from `useAppHaptics()`
 *     (typically `subtle`). Using the existing hook means our visual +
 *     auditory vocabulary keeps a single source of truth for intensity.
 *   - `setInterval` drives the beat. rAF was considered and rejected — we
 *     don't need frame-perfect timing, and rAF would tick 30×/s even when
 *     we only pulse 2×/s, wasting work for no benefit.
 *   - Visibility-aware: when the tab goes hidden we clear the interval,
 *     when it returns we restart it. This avoids wasted wakeups on
 *     suspended tabs AND aligns with the existing `canUseRuntimeHaptics()`
 *     gate in `lib/haptics.ts` (which returns false while hidden anyway,
 *     but the interval suspension saves the gate check entirely).
 *   - Idempotent: calling `startDiscoHaptics` while already running is a
 *     no-op (only the most recent `fire` reference is kept).
 *
 * Platform notes:
 *   - Android devices: `navigator.vibrate` fires through web-haptics
 *     Vibration API path. Full beat pulse works.
 *   - Desktop with touchscreen (Surface, touch laptops): also Vibration
 *     API — same coverage as Android.
 *   - iOS Safari: web-haptics routes Taptic Engine pulses through a hidden
 *     `<input type="switch">` toggle, which the library flips programmatically
 *     to trick Safari into producing haptic feedback. That trick only
 *     produces output when the toggle happens during a genuine user-gesture
 *     frame (Safari won't emit haptics from a timer). A free-running
 *     setInterval cannot reliably replay this path, so iOS users get
 *     **silent** beat haptics in disco. They still receive haptics for
 *     their taps/toggles/navigations (those ARE in-gesture), just not the
 *     passive disco beat. This is a platform limitation, not a bug — and
 *     fixing it would require engineering a hidden form element that the
 *     user has to keep interacting with, which isn't a real solution.
 *   - Desktop with mouse only: `canUseRuntimeHaptics()` returns false
 *     because the last pointer mode is 'mouse'. The caller's fire()
 *     short-circuits. Zero work each tick beyond the (cheap) gate.
 *
 * Design goal: no re-render churn. The bridge subscribes to nothing new;
 * `useAppHaptics()` is a stable-ish reference (it is re-allocated on every
 * render of its owner but we pin the interval to whichever `fire` we
 * received most recently). Since the owner (`DiscoHapticsBridge`) re-renders
 * only when the sound-muted state flips — and that's already at most a
 * handful of times per session — the re-start cost is negligible.
 */

/** Tempo — a 120 BPM loop produces one beat every 500 ms. */
const DISCO_BEAT_INTERVAL_MS = 500 as const;

/**
 * Module-level singleton state. Lives for the tab's lifetime but is gated
 * by startDiscoHaptics / stopDiscoHaptics so we only actually schedule
 * timers while disco is active.
 */
interface HapticsState {
  intervalId: number | null;
  visibilityListener: (() => void) | null;
  pulse: (() => void) | null;
}

const state: HapticsState = {
  intervalId: null,
  visibilityListener: null,
  pulse: null,
};

/**
 * Is the tab currently visible? setInterval is suspended while hidden.
 * A missing document (SSR) is treated as "not visible" → no timer.
 */
function isTabVisible(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'visible';
}

/** Schedule the beat interval if we have a pulse and the tab is visible. */
function scheduleInterval(): void {
  if (typeof window === 'undefined') return;
  if (state.intervalId !== null) return;
  if (!state.pulse) return;
  if (!isTabVisible()) return;
  // The tick reads state.pulse on every fire — so a later startDiscoHaptics
  // call that swaps in a fresh `fire` reference takes effect on the NEXT
  // beat without us needing to clear + reschedule the interval. This matters
  // because the haptics hook returns a new `subtle` reference on every
  // render of its owner; we want to consume the latest one but we don't
  // want to reset the 500ms cadence on every render.
  state.intervalId = window.setInterval(() => {
    const fire = state.pulse;
    if (!fire) return;
    // The caller's `fire` already gates on canUseRuntimeHaptics() via the
    // haptics hook, so we don't need to re-check here. Wrap in a try/catch
    // because vibration throws in some odd environments (private mode,
    // policy-blocked pages).
    try {
      fire();
    } catch {
      /* best-effort */
    }
  }, DISCO_BEAT_INTERVAL_MS);
}

/** Tear down the interval. Idempotent. */
function clearIntervalOnly(): void {
  if (state.intervalId !== null) {
    if (typeof window !== 'undefined') {
      window.clearInterval(state.intervalId);
    }
    state.intervalId = null;
  }
}

/**
 * Begin the disco beat. If already running, swap in the new `fire` (so a
 * fresh haptic reference from the hook is always used) and keep the
 * interval alive. Attaches a single visibilitychange listener on first
 * call; cleaning up in `stopDiscoHaptics` detaches it.
 */
export function startDiscoHaptics(fire: () => void): void {
  state.pulse = fire;
  if (typeof document !== 'undefined' && state.visibilityListener === null) {
    state.visibilityListener = (): void => {
      if (isTabVisible()) {
        scheduleInterval();
      } else {
        clearIntervalOnly();
      }
    };
    document.addEventListener('visibilitychange', state.visibilityListener);
  }
  scheduleInterval();
}

/**
 * Stop the disco beat. Safe to call multiple times; each extra call is a
 * no-op. Removes the visibilitychange listener so the module goes back to
 * zero cost once disco exits.
 */
export function stopDiscoHaptics(): void {
  clearIntervalOnly();
  if (state.visibilityListener !== null && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', state.visibilityListener);
  }
  state.visibilityListener = null;
  state.pulse = null;
}

/** @internal — exposed for unit tests. */
export const __test = {
  DISCO_BEAT_INTERVAL_MS,
  isRunning: (): boolean => state.intervalId !== null,
  hasVisibilityListener: (): boolean => state.visibilityListener !== null,
  hasPulse: (): boolean => state.pulse !== null,
};
