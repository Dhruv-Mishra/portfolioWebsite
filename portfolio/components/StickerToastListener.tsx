"use client";

/**
 * StickerToastListener — the one component that:
 *   1. Subscribes to stickerBus events and calls unlockSticker(id).
 *   2. Renders the bottom-left sticky-note toast when a new sticker is
 *      earned, with auto-dismiss and tap-to-open-album behavior.
 *
 * Mounted once by EagerEnhancements so the bus listener is always live.
 */
import { memo, useCallback, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { stickerBus } from '@/lib/stickerBus';
import { getSticker, StickerSvg } from '@/lib/stickers';
import {
  useActiveStickerToast,
  unlockSticker,
  dismissActiveToast,
} from '@/hooks/useStickers';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { useAppHaptics } from '@/lib/haptics';
import { Z_INDEX, STICKER_TOKENS } from '@/lib/designTokens';

const TOAST_INITIAL = { opacity: 0, y: 40, rotate: -4, scale: 0.9 } as const;
const TOAST_ANIMATE = { opacity: 1, y: 0, rotate: -2, scale: 1 } as const;
const TOAST_EXIT = { opacity: 0, y: 40, rotate: -4, scale: 0.9 } as const;
const TOAST_SPRING = { type: 'spring' as const, stiffness: 400, damping: 15 };

export default function StickerToastListener(): React.ReactElement | null {
  // Narrow subscription: only re-renders when the active toast slot itself
  // changes. Sticker unlocks, album-seen marks, and visitedRoute mutations
  // do NOT trigger a re-render of this component.
  const activeToast = useActiveStickerToast();
  const { success, navigate } = useAppHaptics();

  // Bridge bus -> store. Do this once on mount.
  useEffect(() => {
    const off = stickerBus.on((evt) => {
      if (evt.type === 'earn') {
        unlockSticker(evt.id);
      }
    });
    return off;
  }, []);

  // Fire a haptic each time a new toast becomes active.
  useEffect(() => {
    if (activeToast) success();
  }, [activeToast, success]);

  const handleTap = useCallback(() => {
    navigate();
    dismissActiveToast();
  }, [navigate]);

  return (
    <div
      className="fixed bottom-20 md:bottom-24 left-4 md:left-8 pointer-events-none"
      style={{ zIndex: Z_INDEX.sidebar }}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {activeToast && <ToastCard id={activeToast} onTap={handleTap} />}
      </AnimatePresence>
    </div>
  );
}

interface ToastCardProps {
  id: ReturnType<typeof getSticker>['id'];
  onTap: () => void;
}

const ToastCard = memo(function ToastCard({ id, onTap }: ToastCardProps) {
  const sticker = getSticker(id);
  return (
    <m.div
      initial={TOAST_INITIAL}
      animate={TOAST_ANIMATE}
      exit={TOAST_EXIT}
      transition={TOAST_SPRING}
      className="pointer-events-auto relative w-[280px] bg-[var(--note-user)] text-[var(--note-user-ink)] shadow-lg rounded-sm font-hand"
    >
      <TapeStrip size="sm" />
      <Link
        href="/stickers"
        onClick={onTap}
        className="flex items-start gap-3 px-4 pt-5 pb-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ink)]/40"
        aria-label={`You unlocked: ${sticker.label}. Tap to open the sticker drawer.`}
      >
        <StickerSvg id={sticker.id} size={STICKER_TOKENS.size.toast} />
        <div className="flex-1 min-w-0">
          <p className="italic text-xs leading-tight opacity-70">You unlocked</p>
          <p className="font-bold text-base leading-tight mt-0.5 truncate">{sticker.label}</p>
        </div>
        <span className="text-xs opacity-60 whitespace-nowrap pl-1 pt-0.5" aria-hidden="true">tap &#x2197;</span>
      </Link>
    </m.div>
  );
});
