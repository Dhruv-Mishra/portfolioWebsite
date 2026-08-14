import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import MatrixNotesWall from '@/components/matrix/MatrixNotesWall';
import {
  MATRIX_NOTES_ACCESS_COOKIE,
  verifyMatrixNotesAccessToken,
} from '@/lib/matrixNotesAccess.server';

export const dynamic = 'force-dynamic';

/**
 * `/matrix-notes` — the secret post-escape notes wall.
 *
 * ACCESS CONTROL
 * --------------
 * This route is a SECRET. Locked users (anyone who has never clicked the
 * ESCAPE THE MATRIX button inside the matrix overlay) must see the site's
 * normal 404 page — indistinguishable from any other invalid URL.
 *
 * The real escape flow redeems a short-lived server challenge for a signed,
 * HttpOnly access cookie. This server component verifies that cookie before
 * rendering any wall UI and calls `notFound()` for missing, expired, or
 * forged credentials. Client localStorage and query parameters are never
 * treated as authorization.
 *
 * LEAK SURFACE CHECKLIST
 *   - Route not listed in `app/sitemap.ts` (verified — do not add).
 *   - Entry points shown after escape do not grant access; the server cookie
 *     remains authoritative on every page and API request.
 *   - `robots: { index: false }` on this page so crawlers don't index it.
 *   - No open graph / canonical pointing here.
 *
 * PERFORMANCE
 *   This page's initial bundle cost is zero for anyone who never visits it.
 *   Authorized visitors receive the wall only after server verification.
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

export default async function MatrixNotesPage(): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const token = cookieStore.get(MATRIX_NOTES_ACCESS_COOKIE)?.value;
  if (!verifyMatrixNotesAccessToken(token)) {
    notFound();
  }

  return <MatrixNotesWall />;
}
