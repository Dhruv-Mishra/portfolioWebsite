'use client';

/**
 * SoundToggleButton — global mute pill for the sitewide sound system.
 *
 * Placement: docks next to the ThemeToggle in the Navigation header. Visually
 * matches the theme toggle — rough hand-drawn circle, sketchbook ink.
 *
 * Behaviour:
 *   - Subscribes to `useSoundsMuted()` for a narrow re-render.
 *   - Click → `setSoundsMutedImperative(!muted)`; the store write propagates
 *     to `soundManager.setMuted()` via the global `useSounds` hook in the
 *     Navigation scope.
 *   - Respects the sketchbook aesthetic: rough circle hover, swapping speaker
 *     / speaker-slashed doodles.
 *   - Accessible: `aria-pressed` reflects the mute state, explicit label.
 */

import { memo, useCallback } from 'react';
import { useSoundsMuted, setSoundsMutedImperative } from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';
import { useAppHaptics } from '@/lib/haptics';

function SoundToggleButton(): React.ReactElement {
  const muted = useSoundsMuted();
  const { toggle: toggleHaptic } = useAppHaptics();

  const handleClick = useCallback(() => {
    const next = !muted;
    setSoundsMutedImperative(next);
    // Mirror into the manager immediately so the user gesture counts as the
    // "first gesture" for autoplay — if they're unmuting, play a subtle ack
    // tick so the AudioContext warms up.
    soundManager.setMuted(next);
    toggleHaptic();
    if (!next) {
      // Unmuting — warm up with a tiny click so the autoplay policy is
      // satisfied and subsequent triggers work on the very next event.
      soundManager.play('button-click');
    }
  }, [muted, toggleHaptic]);

  return (
    <button
      onClick={handleClick}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      className="relative p-2 rounded-full hover:bg-gray-200/20 dark:hover:bg-gray-700/20 transition-colors group"
      data-sound-toggle
    >
      <div key={muted ? 'muted' : 'unmuted'} className="animate-theme-icon">
        {muted ? (
          /* Speaker with X (muted) doodle */
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </svg>
        ) : (
          /* Speaker with sound waves doodle */
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </div>

      {/* Rough hand-drawn hover ring — matches ThemeToggle */}
      <div
        className="absolute inset-0 border-2 border-gray-400/0 group-hover:border-gray-400/30 rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-[border-color,opacity] duration-150 pointer-events-none"
        style={{ borderRadius: '50% 40% 60% 50% / 50% 60% 40% 50%' }}
      />
    </button>
  );
}

export default memo(SoundToggleButton);
