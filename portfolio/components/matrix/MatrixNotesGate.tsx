'use client';

/**
 * MatrixNotesGate — the client-side access gate for `/matrix-notes`.
 *
 * Gating strategy (see also `app/matrix-notes/page.tsx`):
 *
 *   1. The initial server-rendered HTML is just the site's 404 shell. Locked
 *      users view-source and see nothing but a 404 page; they cannot tell
 *      `/matrix-notes` is special.
 *   2. On hydrate, we read `matrixEscaped` from the sticker store. Until
 *      we've read it (brief frame), keep rendering the 404 — this avoids a
 *      content flash for locked users, who vastly outnumber unlocked users.
 *   3. If unlocked, dynamically fetch the wall content (`MatrixNotesWall`
 *      chunk). The chunk itself contains the form + notes list. No prefetch
 *      link / `<Link>` exists anywhere pointing at this route, so the chunk
 *      isn't in the initial bundle for any page.
 *
 * Why not use Next's `notFound()` from a server component?
 *   `notFound()` is only callable during render. The unlock signal lives in
 *   localStorage (a client-only API). A server component can't read it, and
 *   there's no server-side session to tell us whether the visitor is
 *   unlocked. So the server renders the 404, and the client upgrades to
 *   the wall only when it sees the flag.
 *
 * Auto-unlock on successful escape
 *   The matrix overlay's escape transition navigates here with a
 *   `?from=escape` query param. If present AND the flag is not yet set,
 *   we flip it here (belt-and-suspenders — the overlay also sets the flag
 *   before navigation, but the query param covers a race where the flag
 *   hasn't flushed to storage by the time the nav completes).
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import NotFound from '@/app/not-found';
import {
  getMatrixEscapedSync,
  setMatrixEscapedImperative,
  useMatrixEscaped,
} from '@/hooks/useStickers';

/**
 * Lazy-load the wall body. Keeps it out of the initial bundle AND out of
 * the static chunk graph that a locked user would see via network panel.
 * `ssr: false` is critical: we never want the server to render wall HTML.
 */
const MatrixNotesWall = dynamic(() => import('./MatrixNotesWall'), {
  ssr: false,
  loading: () => null,
});

type GateStatus = 'pending' | 'locked' | 'unlocked';

export default function MatrixNotesGate(): React.ReactElement {
  const searchParams = useSearchParams();
  const escaped = useMatrixEscaped();
  const [status, setStatus] = useState<GateStatus>('pending');

  // Auto-unlock when arriving from the escape transition. The overlay sets
  // the flag before it navigates, but there's a tiny race window where the
  // localStorage write hasn't flushed yet by the time this component's
  // effects run. The `?from=escape` query param is a belt-and-suspenders
  // signal from the transition that also triggers the flag set here.
  useEffect(() => {
    if (searchParams?.get('from') === 'escape') {
      if (!getMatrixEscapedSync()) {
        setMatrixEscapedImperative(true);
      }
    }
  }, [searchParams]);

  // Resolve the gate once after hydration. Using `getMatrixEscapedSync` here
  // (instead of just reading the `escaped` hook value) guarantees we read
  // the freshest localStorage snapshot even if the store hasn't finished
  // rehydrating yet.
  useEffect(() => {
    const fromEscape = searchParams?.get('from') === 'escape';
    const isEscaped = fromEscape || getMatrixEscapedSync() || escaped;
    setStatus(isEscaped ? 'unlocked' : 'locked');
  }, [escaped, searchParams]);

  // Before hydration resolves, render the 404 shell. This is the same HTML
  // the server sent — no layout shift for locked users, and no flash of
  // secret content if hydration races ahead.
  if (status === 'pending' || status === 'locked') {
    return <NotFound />;
  }

  return <MatrixNotesWall />;
}
