'use client';

/**
 * SuperuserToastController — tiny always-mounted controller that decides
 * whether to render the heavy `SuperuserToast` component.
 *
 * Design principle: near-zero cost for users who haven't earned superuser.
 * This controller is intentionally THIN — it subscribes to two narrow
 * store snapshots (`hasSuperuser` via useSuperuserUnlocked, earned/revealed
 * timestamps via useStickers) and only invokes the heavy dynamic import
 * when `earnedAt > revealedAt`.
 *
 * Re-render hygiene: the controller re-renders when `hasSuperuser` or
 * either timestamp changes, but those are three scalar fields that only
 * mutate at milestone moments (earn + dismiss). It NEVER re-renders on
 * other sticker unlocks, route changes, or theme toggles.
 *
 * Bundle contract: this file is ~1 KB and is eagerly mounted via
 * EagerEnhancements. The heavy `SuperuserToast` chunk ships only when the
 * dynamic import fires — i.e., when the user has just earned superuser.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  useSuperuserUnlocked,
  useSuperuserRevealedAt,
  getSuperuserEarnedAtSync,
} from '@/hooks/useStickers';

type ToastModule = typeof import('./SuperuserToast');
type ToastComponent = ToastModule['default'];

export default function SuperuserToastController(): React.ReactElement | null {
  const hasSuperuser = useSuperuserUnlocked();
  const revealedAt = useSuperuserRevealedAt();

  if (!hasSuperuser) return null;

  return <SuperuserToastSession revealedAt={revealedAt} />;
}

interface SuperuserToastSessionProps {
  revealedAt: number;
}

function SuperuserToastSession({
  revealedAt,
}: SuperuserToastSessionProps): React.ReactElement | null {
  const [reveal] = useState(() => {
    const earnedAt = getSuperuserEarnedAtSync();
    return {
      earnedAt,
      shouldShow: earnedAt > 0 && earnedAt > revealedAt,
    };
  });
  const [dismissed, setDismissed] = useState(false);

  const [Toast, setToast] = useState<ToastComponent | null>(null);

  // When we should show, dynamically import the heavy component. Keep the
  // chunk resolved across re-renders so if the user re-earns (post-reset)
  // in the same session, the toast shows instantly.
  useEffect(() => {
    if (!reveal.shouldShow || Toast) return;
    let cancelled = false;
    void import('./SuperuserToast').then((mod) => {
      if (cancelled) return;
      setToast(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [reveal.shouldShow, Toast]);

  const handleDismissed = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!reveal.shouldShow || dismissed || !Toast) return null;

  return (
    <Toast
      earnedAt={reveal.earnedAt}
      onDismissed={handleDismissed}
    />
  );
}
