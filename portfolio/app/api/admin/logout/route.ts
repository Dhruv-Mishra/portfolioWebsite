/**
 * POST /api/admin/logout
 *
 * Clears the admin auth cookie. The client-side sessionStorage mirror is
 * cleared by the caller. Both have to go for a full sign-out.
 */

import { NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAME } from '@/lib/adminAuth.server';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  return new Response(
    JSON.stringify({ ok: true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': [
          `${ADMIN_COOKIE_NAME}=`,
          'Path=/',
          'Max-Age=0',
          'HttpOnly',
          'SameSite=Lax',
          process.env.NODE_ENV === 'production' ? 'Secure' : '',
        ].filter(Boolean).join('; '),
      },
    },
  );
}
