"use client";

/**
 * EscapeToastListener — global listener that renders the Escape-the-Matrix
 * achievement toast when `matrixToastBus.emitEscape()` fires.
 *
 * Mount ONCE at the app level (via EagerEnhancements). The listener is
 * cheap (one subscription) and only creates a toast element when the
 * event fires — users who never escape pay nothing.
 *
 * VISUAL
 *   Reuses the same bottom-left sticky-note slot as the regular sticker
 *   toast, but with an emerald ESCAPED-THE-MATRIX treatment that mirrors
 *   the `/stickers` EscapeBanner's palette (so the achievement feels
 *   unified across surfaces).
 *
 * LINK
 *   Tapping the toast routes to `/stickers` so the user can inspect the
 *   full EscapeBanner. Same pattern as the existing sticker toast.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { m, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { matrixToastBus } from '@/lib/matrixToastBus';
import { useMatrixEscaped } from '@/hooks/useStickers';
import { MATRIX_PUZZLE_KEYS, readSessionFlag, writeSessionFlag } from '@/lib/matrixPuzzle';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { useAppHaptics } from '@/lib/haptics';
import { soundManager } from '@/lib/soundManager';
import { Z_INDEX } from '@/lib/designTokens';

const TOAST_INITIAL = { opacity: 0, y: 40, rotate: -4, scale: 0.9 } as const;
const TOAST_ANIMATE = { opacity: 1, y: 0, rotate: -2, scale: 1 } as const;
const TOAST_EXIT = { opacity: 0, y: 40, rotate: -4, scale: 0.9 } as const;
const TOAST_SPRING = { type: 'spring' as const, stiffness: 400, damping: 15 };
const TOAST_AUTO_DISMISS_MS = 4200;

function EscapeToastListenerImpl(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);
  const { success, navigate } = useAppHaptics();
  const pathname = usePathname();
  const escaped = useMatrixEscaped();

  // Subscribe to the bus for explicit emits (e.g. manual re-trigger from
  // debug / future flows).
  useEffect(() => {
    const off = matrixToastBus.on(() => {
      setVisible(true);
      try {
        success();
      } catch {
        /* haptics best-effort */
      }
      try {
        soundManager.play('sticker-ding');
      } catch {
        /* sound best-effort */
      }
    });
    return off;
  }, [success]);

  // On home mount, if the user has escaped and we haven't shown the home
  // toast this session yet, show it directly. Colocating the detection
  // with the listener avoids a race with the event bus (the listener
  // chunk loads async; the emitter used to race it).
  useEffect(() => {
    if (pathname !== '/') return;
    if (!escaped) return;
    if (readSessionFlag(MATRIX_PUZZLE_KEYS.homeToastShown)) return;
    writeSessionFlag(MATRIX_PUZZLE_KEYS.homeToastShown, true);
    setVisible(true);
    try {
      success();
    } catch {
      /* haptics best-effort */
    }
    try {
      soundManager.play('sticker-ding');
    } catch {
      /* sound best-effort */
    }
  }, [pathname, escaped, success]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => setVisible(false), TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [visible]);

  const onTap = useCallback(() => {
    navigate();
    setVisible(false);
  }, [navigate]);

  return (
    <div
      className="fixed bottom-20 md:bottom-24 left-4 md:left-8 pointer-events-none"
      style={{ zIndex: Z_INDEX.sidebar }}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {visible ? (
          <m.div
            key="escape-achievement-toast"
            initial={TOAST_INITIAL}
            animate={TOAST_ANIMATE}
            exit={TOAST_EXIT}
            transition={TOAST_SPRING}
            className="pointer-events-auto relative w-[300px] rounded-sm bg-[#02180e] text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.35)] border border-emerald-400/70 font-hand"
          >
            <TapeStrip size="sm" />
            <Link
              href="/stickers"
              onClick={onTap}
              className="flex items-start gap-3 px-4 pt-5 pb-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
              aria-label="Achievement unlocked: Escape the Matrix. Open the sticker drawer."
            >
              <EscapeSigil size={48} />
              <div className="flex-1 min-w-0">
                <p className="italic text-[11px] leading-tight opacity-80 font-code tracking-[0.18em] uppercase">
                  Achievement · Unlocked
                </p>
                <p className="font-bold text-base md:text-lg leading-tight mt-0.5 truncate">
                  Escaped the Matrix
                </p>
                <p className="text-[11px] leading-tight opacity-70 mt-1">
                  Tap to open the sticker drawer →
                </p>
              </div>
            </Link>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Emerald "ESC" sigil — mini version of the EscapeBanner's medal so the
 * toast and banner share the same visual motif.
 */
const EscapeSigil = memo(function EscapeSigil({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="esc-toast-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#052e23" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <linearGradient id="esc-toast-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="none" stroke="url(#esc-toast-ring)" strokeWidth="2" />
      <circle cx="24" cy="24" r="17" fill="url(#esc-toast-bg)" stroke="#10b981" strokeWidth="1" />
      <rect x="16" y="20" width="16" height="10" rx="2" fill="#020d08" stroke="#10b981" strokeWidth="1" />
      <text
        x="24"
        y="27.5"
        textAnchor="middle"
        fontFamily="'Fira Code', monospace"
        fontSize="6.2"
        fontWeight="bold"
        fill="#6ee7b7"
        letterSpacing="1.2"
      >
        ESC
      </text>
    </svg>
  );
});

export default memo(EscapeToastListenerImpl);
