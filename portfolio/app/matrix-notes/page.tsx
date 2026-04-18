import type { Metadata } from 'next';
import { Suspense } from 'react';
import NotFound from '@/app/not-found';
import MatrixNotesGate from '@/components/matrix/MatrixNotesGate';

/**
 * `/matrix-notes` — the secret post-escape notes wall.
 *
 * ACCESS CONTROL
 * --------------
 * This route is a SECRET. Locked users (anyone who has never clicked the
 * ESCAPE THE MATRIX button inside the matrix overlay) must see the site's
 * normal 404 page — indistinguishable from any other invalid URL.
 *
 * Unlock state lives in localStorage (`matrixEscaped` on the sticker store),
 * which is a client-only signal. The server therefore cannot know whether
 * a given visitor is unlocked. Our strategy:
 *
 *   1. The server response is a CLIENT component that renders the site's
 *      normal `NotFound` shell by default. View-source on a locked user's
 *      first load shows nothing but the 404 HTML — no wall content, no
 *      form, no mention of matrix notes.
 *   2. On mount, the client reads `matrixEscaped` from the sticker store.
 *      If locked: the 404 stays. If unlocked: the component fetches
 *      `/api/matrix-notes` and swaps in the notes wall UI.
 *
 * LEAK SURFACE CHECKLIST
 *   - Route not listed in `app/sitemap.ts` (verified — do not add).
 *   - No Next.js `<Link>` references to `/matrix-notes` anywhere — entry
 *     point is an imperative `router.push()` from the escape transition.
 *     The post-unlock "open matrix notes" button uses `<Link>` deliberately
 *     because at that point the user already knows.
 *   - `robots: { index: false }` on this page so crawlers don't index it.
 *   - No open graph / canonical pointing here.
 *
 * PERFORMANCE
 *   This page's initial bundle cost is zero for anyone who never visits it.
 *   Unlocked users pay: the client gate + a lazy-loaded notes wall chunk
 *   (form + list) fetched only after the localStorage check succeeds.
 */

export const metadata: Metadata = {
  // Match the site's NotFound metadata exactly so crawlers/social scrapers
  // cannot distinguish this route from any other 404.
  title: '404 Not Found | Dhruv Mishra',
  description: "Page not found.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      'max-snippet': -1,
      'max-image-preview': 'none',
      'max-video-preview': -1,
    },
  },
};

export default function MatrixNotesPage() {
  // `MatrixNotesGate` uses `useSearchParams()`, which Next.js requires to sit
  // inside a Suspense boundary so the server can pre-render up to the
  // boundary and stream the rest. The fallback is our normal 404 shell so
  // locked users who see the suspense placeholder see nothing suspicious.
  return (
    <Suspense fallback={<NotFound />}>
      <MatrixNotesGate />
    </Suspense>
  );
}
