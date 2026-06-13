import type { APIRoute } from 'astro';
import { ADMIN_COOKIE_NAME } from '@/lib/adminAuth.server';
import { validateOrigin } from '@/lib/validateOrigin';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const originError = validateOrigin(request, { requireOrigin: true });
  if (originError) return originError;

  return new Response(JSON.stringify({ ok: true }), {
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
  });
};