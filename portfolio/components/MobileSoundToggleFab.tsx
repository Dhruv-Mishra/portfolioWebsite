'use client';

/**
 * MobileSoundToggleFab — a mobile-only floating circular FAB that lives in
 * the bottom-right stack, directly above the MiniChat quick-chat FAB. It
 * wraps the same `soundsMuted` store slice that the desktop
 * `SoundToggleButton` uses, so toggling this toggles the sitewide mute —
 * one source of truth for every sound the site makes (including the disco
 * loop in v5+).
 *
 * Placement contract:
 *   - Fixed to the viewport, right edge aligned with the MiniChat FAB's
 *     right edge (`right-4`, matching MiniChat on mobile).
 *   - Vertically parked just above the MiniChat FAB, with a `0.75rem` gap
 *     so the two controls visually stack without overlapping. The exact
 *     math uses the shared `--c-fab-size` CSS variable so any size-preset
 *     change (small / medium / large) keeps the gap correct.
 *   - Z-index tracks `Z_INDEX.nav` so it sits above the sidebar pill but
 *     below modals and the cursor.
 *   - Hidden on md+ viewports — desktop keeps the inline
 *     `SoundToggleButton` in the bottom-left chrome.
 *
 * Visual parity with the MiniChat FAB:
 *   - Matching `w-[var(--c-fab-size)]` footprint.
 *   - Rounded square silhouette, paper background, dashed-sketch border —
 *     keeps the "sketchbook sticker" aesthetic consistent.
 *   - Slight rotation + whileTap so it feels like a hand-placed note.
 */

import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import {
  setSoundsMutedImperative,
  useMasterVolume,
  useSoundsMuted,
} from '@/hooks/useStickers';
import { commitUserMasterVolume, soundManager } from '@/lib/soundManager';
import { useAppHaptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { INTERACTION_TOKENS, ANIMATION_TOKENS, Z_INDEX } from '@/lib/designTokens';

/**
 * Position anchored to the MiniChat FAB:
 *   - MiniChat sits at calc(env(safe-area-inset-bottom,0px)+5rem) on mobile
 *     with size --c-fab-size (~3.5rem). We park ~1rem above it.
 *   - Right edge matches MiniChat (`right-4`).
 */
const FAB_POSITION_STYLE = {
  right: 'max(1rem, env(safe-area-inset-right, 0px))',
  bottom: 'var(--c-mobile-floating-upper-bottom)',
  transform: 'rotate(-2deg)',
} as const;

const FAB_ANIMATE = {
  opacity: 1,
  scale: 1,
  transition: { type: 'spring' as const, ...ANIMATION_TOKENS.spring.bouncy },
};

const LONG_PRESS_MS = 420;

function MobileSoundToggleFabImpl(): React.ReactElement | null {
  const muted = useSoundsMuted();
  const masterVolume = useMasterVolume();
  const { toggle: toggleHaptic } = useAppHaptics();
  const pathname = usePathname();
  const sliderId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const [sliderOpen, setSliderOpen] = useState(false);
  const percent = Math.round(masterVolume * 100);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current === null) return;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, []);

  const handleClick = useCallback(() => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const next = !muted;
    setSoundsMutedImperative(next);
    // Mirror into the manager immediately so the user gesture counts as the
    // "first gesture" for autoplay — if they're unmuting, play a subtle ack
    // tick so the AudioContext warms up for subsequent sounds.
    soundManager.setMuted(next);
    toggleHaptic();
    if (!next) {
      soundManager.play('button-click');
    }
  }, [muted, toggleHaptic]);

  const handleVolumeChange = useCallback((nextPercent: number) => {
    commitUserMasterVolume(nextPercent / 100);
  }, []);

  const beginLongPress = useCallback(() => {
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      suppressClick.current = true;
      setSliderOpen(true);
    }, LONG_PRESS_MS);
  }, [clearLongPress]);

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

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  // Hide on dedicated chat and guestbook routes — those pages own the
  // bottom-right corner (chat input / Pin to wall). Gate AFTER hooks so
  // React's hook-call order stays stable across renders. Keep the FAB on
  // /settings so the model picker uses a content gutter instead.
  if (pathname.startsWith('/chat') || pathname === '/guestbook' || pathname.startsWith('/guestbook/')) return null;

  return (
    <div
      ref={rootRef}
      className="md:hidden fixed"
      style={{ ...FAB_POSITION_STYLE, zIndex: Z_INDEX.nav }}
    >
      {sliderOpen ? (
        <div
          className={cn(
            'absolute bottom-full right-0 mb-2 w-44 rounded-md px-3 py-2',
            'border-2 border-dashed border-[var(--c-grid)]/60 bg-[var(--c-paper)]',
            'shadow-lg',
          )}
        >
          <label htmlFor={sliderId} className="mb-1 block font-hand text-xs font-bold text-[var(--c-ink)]/75">
            Volume {percent}%
          </label>
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
            className="master-volume-slider w-full"
          />
        </div>
      ) : null}
      <m.button
        type="button"
        onClick={handleClick}
        onPointerDown={beginLongPress}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        aria-pressed={muted}
        aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
        aria-expanded={sliderOpen}
        data-sound-toggle
        whileHover={INTERACTION_TOKENS.hover.scaleUp}
        whileTap={INTERACTION_TOKENS.tap.press}
        initial={{ opacity: 0, scale: 0 }}
        animate={FAB_ANIMATE}
        className={cn(
          'h-[max(var(--c-fab-size),44px)] w-[max(var(--c-fab-size),44px)] rounded-full',
          'flex items-center justify-center shadow-lg',
          'bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/60',
          'transition-colors duration-200',
          muted
            ? 'text-gray-400 dark:text-gray-500'
            : 'text-emerald-600 dark:text-emerald-400',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
        )}
        title={muted ? 'Unmute sounds' : 'Mute sounds'}
        data-disco-bounce="3"
      >
        {muted ? <VolumeX size={22} strokeWidth={2.2} /> : <Volume2 size={22} strokeWidth={2.2} />}
      </m.button>
    </div>
  );
}

export default memo(MobileSoundToggleFabImpl);
