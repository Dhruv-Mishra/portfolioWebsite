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

function toOrigin(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Additional explicitly configured production origins for previews/staging/custom hosts. */
const EXTRA_CONFIGURED_ORIGINS = (process.env.ALLOWED_ORIGINS?.split(',') ?? [])
  .map(origin => {
    const trimmed = origin.trim();
    if (!trimmed) return null;
    const parsed = toOrigin(trimmed);
    if (!parsed) {
      console.warn(`[validateOrigin] Skipping invalid origin: ${trimmed}`);
    }
    return parsed;
  })
  .filter((origin): origin is string => origin !== null);

/** Full allowed origins set, built from trusted configuration only. */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  [
    PRODUCTION_ORIGIN,
    ...(process.env.NODE_ENV === 'development' ? DEV_ORIGINS : []),
    ...[process.env.NEXT_PUBLIC_SITE_URL, process.env.SITE_URL]
      .map(origin => toOrigin(origin ?? null))
      .filter((origin): origin is string => origin !== null),
    ...EXTRA_CONFIGURED_ORIGINS,
  ]
    .map(origin => toOrigin(origin ?? null))
    .filter((origin): origin is string => origin !== null),
);

export interface ValidateOriginOptions {
  /**
   * When true (recommended for write/state-changing endpoints), requests with
   * NO `Origin` header are rejected unless `Sec-Fetch-Site: same-origin` is
   * present. This blocks scripted abuse from non-browser tooling that strips
   * the Origin header. When false, header-less requests are allowed for
   * compatibility with curl/cron/server-to-server callers (read-only routes).
   */
  requireOrigin?: boolean;

  /**
   * When true, an allowed explicit `Origin` header is mandatory. This is for
   * endpoints that must only accept browser requests; `Sec-Fetch-Site` is not
   * an authentication signal and cannot satisfy this requirement.
   */
  requireExplicitOrigin?: boolean;
}

/**
 * Validate the Origin header on an incoming request.
 *
 * Returns `null` if the request is allowed, or a 403 `Response` to return early.
 *
 * Policy (default — read-only callers):
 * - Origin present & in allowed set → allow
 * - Origin present & NOT in allowed set → block (403)
 * - Origin absent → allow (non-browser clients: curl, cron, server-to-server)
 *
 * Policy (`requireOrigin: true` — write/state-changing endpoints):
 * - Origin present & in allowed set → allow
 * - Origin absent BUT `Sec-Fetch-Site: same-origin` → allow (modern browsers
 *   strip Origin on certain same-origin requests but always send Sec-Fetch-Site)
 * - Anything else → block (403)
 */
export function validateOrigin(
  request: Request,
  options: ValidateOriginOptions = {},
): Response | null {
  const origin = request.headers.get('origin');
  const requireOrigin = options.requireOrigin === true;
  const requireExplicitOrigin = options.requireExplicitOrigin === true;

  if (origin) {
    if (ALLOWED_ORIGINS.has(origin)) return null;
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // No Origin header.
  if (!requireOrigin && !requireExplicitOrigin) return null;

  if (requireExplicitOrigin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Strict mode: accept Sec-Fetch-Site: same-origin as a fallback for
  // browser-initiated same-origin requests that omit Origin.
  if (request.headers.get('sec-fetch-site') === 'same-origin') return null;

  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
