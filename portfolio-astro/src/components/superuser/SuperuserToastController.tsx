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

import { useEffect, useState } from 'react';
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
  const [earnedAt, setEarnedAt] = useState<number>(0);

  // When superuser becomes true (including on subsequent sessions where the
  // store hydrates from localStorage), read the earned timestamp once.
  useEffect(() => {
    if (!hasSuperuser) {
      setEarnedAt(0);
      return;
    }
    setEarnedAt(getSuperuserEarnedAtSync());
  }, [hasSuperuser]);

  const shouldShow = hasSuperuser && earnedAt > 0 && earnedAt > revealedAt;

  const [Toast, setToast] = useState<ToastComponent | null>(null);
  const [shouldMount, setShouldMount] = useState<boolean>(false);

  // When we should show, dynamically import the heavy component. Keep the
  // chunk resolved across re-renders so if the user re-earns (post-reset)
  // in the same session, the toast shows instantly.
  useEffect(() => {
    if (!shouldShow) {
      setShouldMount(false);
      return;
    }
    if (Toast) {
      setShouldMount(true);
      return;
    }
    let cancelled = false;
    void import('./SuperuserToast').then((mod) => {
      if (cancelled) return;
      setToast(() => mod.default);
      setShouldMount(true);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldShow, Toast]);

  if (!shouldMount || !Toast || earnedAt <= 0) return null;

  return (
    <Toast
      earnedAt={earnedAt}
      onDismissed={() => {
        // The toast itself has already written `superuserRevealedAt` — that
        // triggers a revealedAt update via the store, which makes shouldShow
        // false on the next render and unmounts the Toast. We just need a
        // no-op here to satisfy the callback signature and let the exit
        // animation complete cleanly.
        setShouldMount(false);
      }}
    />
  );
}
