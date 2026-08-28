'use client';

/**
 * SoundToggleButton — global mute pill for the sitewide sound system.
 *
 * Placement: docks next to the ThemeToggle in the Navigation header. Visually
 * matches the theme toggle — rough hand-drawn circle, sketchbook ink.
 *
 * Behaviour:
 *   - Subscribes to `useSoundsMuted()` / `useMasterVolume()` for a narrow re-render.
 *   - Click → `setSoundsMutedImperative(!muted)`; mute never overwrites volume.
 *   - Hover / keyboard focus opens a minimal vertical volume slider popover.
 *     Dragging is an explicit user volume set: positive values unmute.
 *   - Collapses when hover/focus leaves. Absolute popover — no layout shift.
 *   - Accessible: `aria-pressed` reflects the mute state, explicit label.
 */

import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  setSoundsMutedImperative,
  useMasterVolume,
  useSoundsMuted,
} from '@/hooks/useStickers';
import { commitUserMasterVolume, soundManager } from '@/lib/soundManager';
import { useAppHaptics } from '@/lib/haptics';
import { useDesktopOnly } from '@/hooks/useDesktopOnly';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

function SoundToggleButton(): React.ReactElement {
  const muted = useSoundsMuted();
  const masterVolume = useMasterVolume();
  const { toggle: toggleHaptic } = useAppHaptics();
  const isDesktop = useDesktopOnly();
  const sliderId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [sliderOpen, setSliderOpen] = useState(false);
  const percent = Math.round(masterVolume * 100);

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

  const handleVolumeChange = useCallback((nextPercent: number) => {
    commitUserMasterVolume(nextPercent / 100);
  }, []);

  const openSlider = useCallback(() => {
    if (!isDesktop) return;
    setSliderOpen(true);
  }, [isDesktop]);

  const closeSliderIfLeft = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      setSliderOpen(false);
      return;
    }
    const active = document.activeElement;
    if (active instanceof Node && root.contains(active)) return;
    setSliderOpen(false);
  }, []);

  useEffect(() => {
    if (!sliderOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setSliderOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [sliderOpen]);

  return (
    <div
      ref={rootRef}
      className="relative inline-flex h-11 w-11 items-center justify-center"
      onMouseEnter={openSlider}
      onMouseLeave={closeSliderIfLeft}
      onFocusCapture={openSlider}
      onBlurCapture={() => {
        window.setTimeout(closeSliderIfLeft, 0);
      }}
    >
    <Tooltip label={muted ? 'Unmute sound effects' : 'Mute sound effects'}>
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-200/20 dark:hover:bg-gray-700/20 transition-colors group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/50"
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
    </Tooltip>
      {isDesktop && sliderOpen ? (
        <div
          className={cn(
            'absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2',
            'flex flex-col items-center gap-1 rounded-md px-2 py-2',
            'border border-[var(--c-ink)]/25 bg-[var(--c-paper)]/95',
            'shadow-[1px_2px_4px_rgba(0,0,0,0.16)]',
          )}
        >
          <span className="font-hand text-[11px] font-bold text-[var(--c-ink)]/75">
            {percent}%
          </span>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            aria-label="Master volume"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent} percent`}
            onChange={(event) => handleVolumeChange(Number(event.target.value))}
            className="master-volume-slider master-volume-slider--vertical"
          />
        </div>
      ) : null}
    </div>
  );
}

export default memo(SoundToggleButton);
