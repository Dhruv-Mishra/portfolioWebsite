'use client';

/**
 * SuperuserToast — sitewide, centered reveal overlay that appears EXACTLY
 * ONCE when the user first earns the superuser sticker, no matter which
 * page they were on at the time.
 *
 * Mount contract:
 *   - Rendered through a portal into `document.body` at z-index above
 *     navigation but below the custom cursor layer.
 *   - Entrance: spring scale + fade (reduced-motion: fade only).
 *   - Exit: fade + gentle scale-down.
 *   - Backdrop: soft dim + backdrop-blur, clickable to dismiss.
 *   - Auto-dismiss after 7 seconds.
 *   - Dismiss on ESC / click-outside / explicit close button.
 *   - On dismiss → write `superuserRevealedAt = earnedAt` so it never
 *     appears again.
 *   - Confetti + glow pulse inside the card (shared SuperuserCard).
 *
 * Sound:
 *   - On mount: plays `superuser-fanfare` (short procedural flourish).
 *   - 300ms later: plays `disco-start` (MP3). The gap avoids the one-shot
 *     pre-emption collision — the fanfare is ~1.2s, so at t=0.3s we're
 *     still mid-sustain but the perceived "victory hit" is already through.
 *     Pre-emption fades the fanfare cleanly; from the listener's perspective
 *     the two merge into a single layered celebration.
 *
 * Accessibility:
 *   - role="alert" + aria-live="assertive" for immediate SR announcement.
 *   - Focusable close button.
 *   - ESC handler.
 *   - Respect prefers-reduced-motion for entrance scale; shimmer stays on.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import SuperuserCard from '@/components/superuser/SuperuserCard';
import { setSuperuserRevealedAtImperative } from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';

interface SuperuserToastProps {
  /** Timestamp the superuser sticker was earned. Drives the confetti seed
   *  and the dismiss writeback. */
  earnedAt: number;
  /** Called when the toast has fully dismissed (after exit animation).
   *  Parent uses this to unmount the component from the tree. */
  onDismissed: () => void;
}

const AUTO_DISMISS_MS = 7000;
const FANFARE_TO_DISCO_DELAY_MS = 300;
const EXIT_ANIMATION_MS = 260;

/** Detect `prefers-reduced-motion: reduce`. Gates the scale-spring entrance
 *  only; the shimmer on the card stays on regardless (premium treatment). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function SuperuserToastImpl({ earnedAt, onDismissed }: SuperuserToastProps): React.ReactElement | null {
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState<boolean>(true);
  const dismissedRef = useRef<boolean>(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Guard so the two sound schedules + timestamp write fire exactly once
  // across the lifecycle, even under React 19 strict-mode double-mount.
  const firedSideEffectsRef = useRef<boolean>(false);

  /**
   * Dismiss the toast: write the revealed timestamp (so we never show again),
   * trigger exit animation, and call onDismissed after the animation completes.
   */
  const dismiss = useCallback((): void => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    // Persist the reveal timestamp immediately so a page navigation during
    // the exit animation still records the dismissal.
    setSuperuserRevealedAtImperative(earnedAt);
    setVisible(false);
    // Give the exit animation time to finish before telling the parent to
    // unmount us.
    window.setTimeout(() => {
      onDismissed();
    }, EXIT_ANIMATION_MS);
  }, [earnedAt, onDismissed]);

  // Sound playback on mount. Schedule two sounds separated by ~300ms so the
  // fanfare is audible before disco-start fades it out via pre-emption.
  useEffect(() => {
    if (firedSideEffectsRef.current) return;
    firedSideEffectsRef.current = true;
    soundManager.play('superuser-fanfare');
    const soundTimer = window.setTimeout(() => {
      soundManager.play('disco-start');
    }, FANFARE_TO_DISCO_DELAY_MS);
    return () => window.clearTimeout(soundTimer);
  }, []);

  // Auto-dismiss timer.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss]);

  // ESC to dismiss.
  useEffect(() => {
    const handler = (evt: KeyboardEvent): void => {
      if (evt.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismiss]);

  // Dismiss on route change. The Next.js App Router doesn't push a generic
  // route-change event, so we subscribe to the popstate event (back/forward)
  // AND listen for our own `sudo:navigate` custom event if present. To cover
  // internal Link clicks we also listen for any document-level click that
  // results in a different pathname on the next animation frame.
  useEffect(() => {
    let startPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const checkNav = (): void => {
      if (typeof window === 'undefined') return;
      if (window.location.pathname !== startPath) {
        startPath = window.location.pathname;
        dismiss();
      }
    };
    const popHandler = (): void => checkNav();
    const clickHandler = (): void => {
      // Defer one tick so navigation has a chance to update pathname.
      window.setTimeout(checkNav, 0);
    };
    window.addEventListener('popstate', popHandler);
    document.addEventListener('click', clickHandler, { capture: true });
    return () => {
      window.removeEventListener('popstate', popHandler);
      document.removeEventListener('click', clickHandler, { capture: true });
    };
  }, [dismiss]);

  // Autofocus the close button for keyboard users on first mount. We focus
  // with `preventScroll` so the page doesn't jump to the toast if it's
  // offscreen (it's centered — it shouldn't be, but we defend anyway).
  useEffect(() => {
    const el = closeButtonRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* best-effort */
    }
  }, []);

  // Backdrop click handler — any click on the backdrop (not inside the card)
  // dismisses. Prevent click bubbling inside the card from reaching the
  // backdrop via stopPropagation on the card's onClick.
  const handleBackdropClick = useCallback((): void => {
    dismiss();
  }, [dismiss]);

  const handleCardClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  // Entrance/exit transitions — reduced-motion users get a pure fade.
  const initialEntrance = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.75, y: 20 };
  const animateTarget = { opacity: 1, scale: 1, y: 0 };
  const exitTarget = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.95, y: -10 };
  const entranceTransition = reducedMotion
    ? { duration: 0.22, ease: 'easeOut' as const }
    : { type: 'spring' as const, stiffness: 220, damping: 16, mass: 0.9 };

  // Portal target. On SSR return null; `dynamic(ssr:false)` at the caller
  // already guards this but belt-and-suspenders.
  if (typeof document === 'undefined') return null;

  const content = (
    <AnimatePresence onExitComplete={onDismissed}>
      {visible && (
        <m.div
          // Backdrop — click-to-dismiss. Full-viewport fixed overlay with a
          // soft dim + backdrop-blur. Z-index sits between modal (100) and
          // the custom cursor (9999). Navigation header (50) is below us.
          key="superuser-toast-backdrop"
          data-superuser-toast
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          onClick={handleBackdropClick}
          className="fixed inset-0 flex items-center justify-center"
          style={{
            zIndex: 500,
            background: 'var(--superuser-toast-backdrop, rgba(0,0,0,0.4))',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <m.div
            onClick={handleCardClick}
            className="relative pointer-events-auto px-4 w-full max-w-[520px]"
            initial={initialEntrance}
            animate={animateTarget}
            exit={exitTarget}
            transition={entranceTransition}
          >
            {/* Close button — absolute top-right inside the card frame */}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={dismiss}
              aria-label="Dismiss superuser reveal"
              className="absolute top-2 right-2 z-30 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              data-clickable
              data-sound-toggle
            >
              <X size={16} aria-hidden="true" />
            </button>

            <SuperuserCard earnedAt={earnedAt} showConfetti={!reducedMotion} showGlow={!reducedMotion} />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

export default memo(SuperuserToastImpl);
