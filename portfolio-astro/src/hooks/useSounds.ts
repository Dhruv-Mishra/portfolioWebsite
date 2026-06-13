'use client';

/**
 * useSounds — thin React wrapper over the module-level `soundManager`.
 *
 * Responsibilities:
 *   - Mirror the persisted `soundsMuted` preference from the sticker store
 *     into the manager (so the manager can short-circuit without a React
 *     dependency).
 *   - Expose `play`, `enabled`, `toggle` for consumers.
 *   - Stay re-render-friendly. The mute state lives on the store behind a
 *     narrow selector (useSoundsMuted) so components reading `enabled`
 *     only re-render when the preference flips.
 *
 * The hook itself is just a shell — the heavy lifting lives in
 * `lib/soundManager.ts`.
 */

import { useCallback, useEffect } from 'react';
import { soundManager, type SoundId } from '@/lib/soundManager';
import {
  useSoundsMuted,
  setSoundsMutedImperative,
} from '@/hooks/useStickers';

export interface UseSoundsReturn {
  /** Fire a sound effect. Returns true if actually played. */
  play: (id: SoundId) => boolean;
  /** True if sounds are currently enabled (= not muted). */
  enabled: boolean;
  /** Toggle the global mute preference (persisted). */
  toggle: () => void;
}

export function useSounds(): UseSoundsReturn {
  const muted = useSoundsMuted();

  // Mirror the preference into the manager. No-op if already in sync.
  useEffect(() => {
    soundManager.setMuted(muted);
  }, [muted]);

  const play = useCallback((id: SoundId) => {
    return soundManager.play(id);
  }, []);

  const toggle = useCallback(() => {
    setSoundsMutedImperative(!soundManager.isMuted());
  }, []);

  return { play, enabled: !muted, toggle };
}

// ─── Tab visibility handling ────────────────────────────────────────────
/**
 * Install a visibilitychange listener once per module import. When the tab
 * goes hidden we tell the manager to mute (which smoothly ramps the master
 * gain) without touching the persisted preference. When the tab returns we
 * restore to the current preference. The manager also internally guards
 * against playback while hidden, so this is defence-in-depth.
 *
 * We install from the module scope rather than inside `useSounds` so that
 * the listener is attached even if no component is currently consuming the
 * hook (the manager still plays sounds triggered from non-hook call sites).
 */
let visibilityInstalled = false;
if (typeof document !== 'undefined' && !visibilityInstalled) {
  visibilityInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Don't overwrite the user preference — just temporarily mute the
      // audio graph. When we restore on visibilitychange back to visible,
      // the hook's effect (above) will push the persisted state back in.
      soundManager.setMuted(true);
    } else {
      // Re-read the preference from the store via the manager state. The
      // hook's effect sets this lazily on next render; but if no component
      // is currently mounted, we need to poll the store directly.
      // Importing the store accessor synchronously is cyclic-safe because
      // the hook module depends on useStickers, not the other way around.
      import('@/hooks/useStickers')
        .then((mod) => {
          soundManager.setMuted(mod.getSoundsMutedSync());
        })
        .catch(() => {
          /* best-effort */
        });
    }
  });
}
