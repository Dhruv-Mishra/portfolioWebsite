// lib/validateOrigin.ts — Origin validation for API routes.
// Blocks cross-origin browser requests to prevent LLM credit abuse and feedback spam.
// Requests with no Origin header (curl, Postman, server-to-server) are allowed —
// browsers always send Origin on cross-origin POST, so absent = non-browser = safe.
import 'server-only';

import { SITE } from '@/lib/links';

/** Production origin derived from the central SITE config. */
const PRODUCTION_ORIGIN = SITE.url.replace(/\/+$/, '');

/** Dev-only origins — extends allowedDevOrigins in next.config.ts. */
const DEV_ORIGINS = ['http://localhost:3000', 'http://192.168.1.38:3000'] as const;

/** Additional explicitly configured production origins for previews/staging/custom hosts. */
const EXTRA_CONFIGURED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.SITE_URL,
  ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
];

function toOrigin(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Full allowed origins set, built from trusted configuration only. */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  [
    PRODUCTION_ORIGIN,
    ...(process.env.NODE_ENV === 'development' ? DEV_ORIGINS : []),
    ...EXTRA_CONFIGURED_ORIGINS,
  ]
    .map(origin => toOrigin(origin ?? null))
    .filter((origin): origin is string => origin !== null),
);

/**
 * Validate the Origin header on an incoming request.
 *
 * Returns `null` if the request is allowed, or a 403 `Response` to return early.
 *
 * Policy:
 * - Origin present & in allowed set → allow
 * - Origin present & NOT in allowed set → block (403)
 * - Origin absent → allow (non-browser clients: curl, cron, server-to-server)
 */
export function validateOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');

  // No Origin header → non-browser client (curl, Postman, etc.) → allow
  if (!origin) return null;

  // Origin matches an allowed value → allow
  if (ALLOWED_ORIGINS.has(origin)) return null;

  // Cross-origin browser request → block
  return Response.json(
    { error: 'Forbidden' },
    { status: 403 },
  );
}
