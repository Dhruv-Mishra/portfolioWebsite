"use client";

/**
 * StickerToastListener — the one component that:
 *   1. Subscribes to stickerBus events and calls unlockSticker(id).
 *   2. Renders the bottom-left sticky-note toast when a new sticker is
 *      earned, with auto-dismiss and tap-to-open-album behavior.
 *
 * Mounted once by EagerEnhancements so the bus listener is always live.
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { stickerBus } from '@/lib/stickerBus';
import { getSticker, StickerSvg, SUPERUSER_STICKER } from '@/lib/stickers';
import {
  useActiveStickerToast,
  unlockSticker,
  dismissActiveToast,
} from '@/hooks/useStickers';
import { useAdminPrefs } from '@/hooks/useAdminPrefs';
import { useIsMobile } from '@/hooks/useIsMobile';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { useAppHaptics } from '@/lib/haptics';
import { soundManager } from '@/lib/soundManager';
import { Z_INDEX, STICKER_TOKENS } from '@/lib/designTokens';

const TOAST_INITIAL = { opacity: 0, y: 40, rotate: -4, scale: 0.9 } as const;
const TOAST_ANIMATE = { opacity: 1, y: 0, rotate: -2, scale: 1 } as const;
const TOAST_EXIT = { opacity: 0, y: 40, rotate: -4, scale: 0.9 } as const;
const TOAST_SPRING = { type: 'spring' as const, stiffness: 400, damping: 15 };
const TOAST_AUTO_DISMISS_MS = 4500;

export default function StickerToastListener(): React.ReactElement | null {
  // Narrow subscription: only re-renders when the active toast slot itself
  // changes. Sticker unlocks, album-seen marks, and visitedRoute mutations
  // do NOT trigger a re-render of this component.
  const activeToast = useActiveStickerToast();
  const { success, navigate } = useAppHaptics();
  const { stickerToastsEnabled } = useAdminPrefs();
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const timerRef = useRef<number | null>(null);

  // Bridge bus -> store. Always run so the underlying unlock fires even
  // when the toast UI is suppressed (glance badge stays in sync).
  useEffect(() => {
    const off = stickerBus.on((evt) => {
      if (evt.type === 'earn') {
        unlockSticker(evt.id);
      }
    });
    return off;
  }, []);

  // Suppress toast UI on /chat on mobile (chat owns the bottom of the
  // viewport there) or when the user has muted sticker toasts.
  const suppressUi = isMobile && pathname?.startsWith('/chat');
  const renderToast = stickerToastsEnabled && !suppressUi;

  // Fire haptic + sound only when the toast actually renders.
  useEffect(() => {
    if (!activeToast) return;
    if (!renderToast) return;
    success();
    if (activeToast !== SUPERUSER_STICKER.id) {
      soundManager.play('sticker-ding');
    }
  }, [activeToast, success, renderToast]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      dismissActiveToast();
      timerRef.current = null;
    }, TOAST_AUTO_DISMISS_MS);
  }, [clearTimer]);

  // Auto-dismiss after 4500ms whenever a toast becomes visible.
  useEffect(() => {
    if (!activeToast || !renderToast) {
      clearTimer();
      return;
    }
    scheduleDismiss();
    return clearTimer;
  }, [activeToast, renderToast, scheduleDismiss, clearTimer]);

  const handleTap = useCallback(() => {
    navigate();
    clearTimer();
    dismissActiveToast();
  }, [navigate, clearTimer]);

  // Pause-on-hover (desktop only).
  const handleMouseEnter = useCallback(() => {
    if (isMobile) return;
    clearTimer();
  }, [isMobile, clearTimer]);
  const handleMouseLeave = useCallback(() => {
    if (isMobile) return;
    if (activeToast && renderToast) scheduleDismiss();
  }, [isMobile, activeToast, renderToast, scheduleDismiss]);

  if (!renderToast) return null;

  return (
    <div
      className="fixed left-3 md:left-8 right-3 md:right-auto pointer-events-none bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
      style={{ zIndex: Z_INDEX.sidebar }}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {activeToast && (
          <ToastCard
            id={activeToast}
            onTap={handleTap}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface ToastCardProps {
  id: ReturnType<typeof getSticker>['id'];
  onTap: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const ToastCard = memo(function ToastCard({ id, onTap, onMouseEnter, onMouseLeave }: ToastCardProps) {
  const sticker = getSticker(id);
  return (
    <m.div
      initial={TOAST_INITIAL}
      animate={TOAST_ANIMATE}
      exit={TOAST_EXIT}
      transition={TOAST_SPRING}
      data-sticker-toast
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="pointer-events-auto relative w-full max-w-[260px] md:max-w-[280px] bg-[var(--note-user)] text-[var(--note-user-ink)] shadow-lg rounded-sm font-hand opacity-95 backdrop-blur-[2px] scale-[0.96] md:scale-100"
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
