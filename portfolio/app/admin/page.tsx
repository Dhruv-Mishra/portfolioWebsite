/**
 * /admin — the matrix puzzle's admin console.
 *
 * AUTH
 *   Gated on the httpOnly `dhruv_admin_unlock` cookie. We read the cookie
 *   on the server, validate the HMAC signature, and call `notFound()` if
 *   invalid or missing. Locked visitors see the site's normal 404 page —
 *   no leak that /admin exists.
 *
 * BUNDLE SPLIT
 *   The actual console UI (toggles, logout, state-writers) lives in a
 *   client component dynamically imported only for verified users. Anyone
 *   who never earns the credentials never fetches this chunk.
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ADMIN_COOKIE_NAME, verifyAdminToken } from '@/lib/adminAuth.server';

export const metadata: Metadata = {
  title: '404 Not Found | Dhruv Mishra',
  description: 'Page not found.',
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

// Dynamically import the console body so the chunk isn't tree-attached to
// any other entry. SSR is enabled because we want the shell to be stable
// even when JS is slow, but the console only runs for verified users.
const AdminConsole = dynamic(() => import('@/components/admin/AdminConsole'));

export default async function AdminPage(): Promise<React.ReactElement> {
  // `cookies()` is async in Next.js 15+/16. Await before touching it.
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminToken(token)) {
    // Not signed in (or token expired / tampered) → identical 404 as any
    // other invalid URL. No hint that /admin is real.
    notFound();
  }

  return <AdminConsole />;
}
