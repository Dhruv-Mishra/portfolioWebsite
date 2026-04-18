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

import { memo, useCallback } from 'react';
import { m } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { useSoundsMuted, setSoundsMutedImperative } from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';
import { useAppHaptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { INTERACTION_TOKENS, ANIMATION_TOKENS, Z_INDEX } from '@/lib/designTokens';

/**
 * Position anchored to the MiniChat FAB:
 *   - MiniChat sits at `bottom-20` (5rem) on mobile with size `--c-fab-size`.
 *   - We sit above it: 5rem + fab height + 0.75rem gap.
 *   - Right edge matches MiniChat (`right-4`).
 */
const FAB_POSITION_STYLE = {
  right: '1rem',
  bottom: 'calc(5rem + var(--c-fab-size) + 0.75rem)',
  transform: 'rotate(-2deg)',
} as const;

const FAB_ANIMATE = {
  opacity: 1,
  scale: 1,
  transition: { type: 'spring' as const, ...ANIMATION_TOKENS.spring.bouncy },
};

function MobileSoundToggleFabImpl(): React.ReactElement {
  const muted = useSoundsMuted();
  const { toggle: toggleHaptic } = useAppHaptics();

  const handleClick = useCallback(() => {
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

  return (
    <m.button
      type="button"
      onClick={handleClick}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      data-sound-toggle
      whileHover={INTERACTION_TOKENS.hover.scaleUp}
      whileTap={INTERACTION_TOKENS.tap.press}
      initial={{ opacity: 0, scale: 0 }}
      animate={FAB_ANIMATE}
      className={cn(
        'md:hidden fixed',
        'w-[var(--c-fab-size)] h-[var(--c-fab-size)] rounded-full',
        'flex items-center justify-center shadow-lg',
        'bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/60',
        'transition-colors duration-200',
        muted
          ? 'text-gray-400 dark:text-gray-500'
          : 'text-emerald-600 dark:text-emerald-400',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
      )}
      style={{ ...FAB_POSITION_STYLE, zIndex: Z_INDEX.nav }}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
      data-disco-bounce="3"
    >
      {muted ? <VolumeX size={22} strokeWidth={2.2} /> : <Volume2 size={22} strokeWidth={2.2} />}
    </m.button>
  );
}

export default memo(MobileSoundToggleFabImpl);
