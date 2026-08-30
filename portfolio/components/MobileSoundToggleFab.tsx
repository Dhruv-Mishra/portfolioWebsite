'use client';

/**
 * MobileSoundToggleFab — mobile-only floating circular FAB above MiniChat.
 * Tap opens a horizontal master-volume popover; it never mutes. Mute stays
 * on Settings. Hidden on md+; desktop uses `SoundToggleButton`.
 */

import { memo, useCallback, useId, useRef } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import {
  useMasterVolume,
  useSoundsMuted,
} from '@/hooks/useStickers';
import { useFloatingVolumePopover } from '@/hooks/useFloatingVolumePopover';
import { commitUserMasterVolume } from '@/lib/soundManager';
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

const POPOVER_TRANSITION = { duration: ANIMATION_TOKENS.duration.fast } as const;
const POPOVER_INITIAL = { opacity: 0, y: 8 } as const;
const POPOVER_ANIMATE = { opacity: 1, y: 0 } as const;
const POPOVER_EXIT = { opacity: 0, y: 8 } as const;

function MobileSoundToggleFabImpl(): React.ReactElement | null {
  const muted = useSoundsMuted();
  const masterVolume = useMasterVolume();
  const { toggle: toggleHaptic } = useAppHaptics();
  const pathname = usePathname();
  const sliderId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { open: sliderOpen, togglePopover, onDragStart } = useFloatingVolumePopover(rootRef);
  const percent = Math.round(masterVolume * 100);
  const volumeLabel = sliderOpen ? 'Close master volume' : 'Adjust master volume';

  const handleClick = useCallback(() => {
    togglePopover();
    toggleHaptic();
  }, [togglePopover, toggleHaptic]);

  const handleVolumeChange = useCallback((nextPercent: number) => {
    commitUserMasterVolume(nextPercent / 100);
  }, []);

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
      <AnimatePresence>
        {sliderOpen ? (
          <m.div
            key="mobile-master-volume-popover"
            id={sliderId}
            role="group"
            aria-label="Master volume"
            initial={POPOVER_INITIAL}
            animate={POPOVER_ANIMATE}
            exit={POPOVER_EXIT}
            transition={POPOVER_TRANSITION}
            className={cn(
              'absolute bottom-full right-0 mb-2 w-44 rounded-md px-3 py-2',
              'border-2 border-dashed border-[var(--c-grid)]/60 bg-[var(--c-paper)]',
              'shadow-lg',
            )}
          >
            <span className="absolute top-full left-0 h-2 w-full" aria-hidden="true" />
            <label htmlFor={`${sliderId}-slider`} className="mb-1 block font-hand text-xs font-bold text-[var(--c-ink)]/75">
              Volume {percent}%
            </label>
            <input
              id={`${sliderId}-slider`}
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
              onPointerDown={onDragStart}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              className="master-volume-slider floating-volume-slider w-full"
            />
          </m.div>
        ) : null}
      </AnimatePresence>
      <m.button
        type="button"
        onClick={handleClick}
        aria-expanded={sliderOpen}
        aria-controls={sliderId}
        aria-label={volumeLabel}
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
        data-disco-bounce="3"
      >
        {muted ? <VolumeX size={22} strokeWidth={2.2} /> : <Volume2 size={22} strokeWidth={2.2} />}
      </m.button>
    </div>
  );
}

export default memo(MobileSoundToggleFabImpl);
