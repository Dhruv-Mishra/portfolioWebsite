'use client';

/**
 * SuperuserBanner — the premium gold-foil celebration card that sits above
 * the sticker grid on `/stickers` once the superuser sticker has been earned.
 *
 * Passive display mode (post-refactor):
 *   - This component is ALWAYS rendered in persistent / quiet mode. It shows
 *     the foil card, the medal, the shimmer streak — but it no longer plays
 *     the reveal fanfare, fires confetti, or writes `superuserRevealedAt`.
 *   - Those side effects moved to `SuperuserToast` (a sitewide portal that
 *     mounts wherever the user earns superuser, including `/projects`,
 *     `/about`, etc.). The toast owns the reveal moment exactly once.
 *   - When the user navigates to `/stickers` AFTER dismissing the toast,
 *     the banner fades in quietly — no scale-spring, no confetti.
 *
 * The banner is **only** rendered on `/stickers`. No sitewide presence.
 */

import { memo, useEffect, useState } from 'react';
import { m } from 'framer-motion';
import SuperuserCard from '@/components/superuser/SuperuserCard';

interface SuperuserBannerProps {
  /** Timestamp the superuser sticker was earned (from store `unlockedAt.superuser`). */
  earnedAt: number | undefined;
}

/**
 * Detect `prefers-reduced-motion: reduce`. Only used to gate the quiet
 * entrance (fade + small slide up). The persistent shimmer on the card is
 * controlled entirely by CSS and always runs — it's a premium treatment
 * rather than a motion cue.
 */
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

function SuperuserBannerImpl({ earnedAt }: SuperuserBannerProps): React.ReactElement {
  const reducedMotion = usePrefersReducedMotion();

  // Persistent quiet entrance — a subtle fade + small slide up. The toast
  // already played the scale-spring + confetti elsewhere (or is about to).
  const initialEntrance = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 };
  const animateTarget = { opacity: 1, y: 0 };
  const entranceTransition = { duration: 0.3, ease: 'easeOut' as const };

  return (
    <m.div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Superuser sticker unlocked. Every sticker collected."
      className="superuser-banner relative mx-auto mb-6 md:mb-10 max-w-xl w-full"
      initial={initialEntrance}
      animate={animateTarget}
      transition={entranceTransition}
      data-fresh-reveal="false"
    >
      <SuperuserCard earnedAt={earnedAt} showConfetti={false} showGlow={false} />
    </m.div>
  );
}

export default memo(SuperuserBannerImpl);
