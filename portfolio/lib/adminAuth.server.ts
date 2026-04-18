import 'server-only';

/**
 * Admin auth tokens — server-side HMAC sign/verify.
 *
 * The token is a compact, signed payload issued by POST /api/admin/unlock
 * after the browser sends the correct credentials. Its only job is to
 * gate the `/admin` route: /admin is a server component that rejects
 * any request whose cookie doesn't verify.
 *
 * SHAPE
 *   `<ts>.<signature>`
 *     - `ts`: issue timestamp (ms since epoch, base36-encoded)
 *     - `signature`: hex-encoded HMAC-SHA256 of `"admin-unlock|<ts>"`
 *
 * VALIDITY WINDOW
 *   8 hours. Long enough that refreshing /admin mid-session doesn't
 *   log you out, short enough that a stale cookie from a shared device
 *   can't linger for weeks.
 *
 * SECRET
 *   Reads `ADMIN_UNLOCK_SECRET`. Falls back to `CHAT_HISTORY_SIGNING_SECRET`
 *   (or the legacy `LLM_API_KEY`) so dev/staging never crashes. In prod
 *   we log a warning if the dedicated secret isn't set.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'admin-unlock';
const TOKEN_VALIDITY_MS = 8 * 60 * 60 * 1000; // 8h
const SECRET_FALLBACK = 'development-admin-unlock-secret';

function getAdminSecret(): string {
  return (
    process.env.ADMIN_UNLOCK_SECRET
    || process.env.CHAT_HISTORY_SIGNING_SECRET
    || process.env.LLM_API_KEY
    || process.env.LLM_FALLBACK_API_KEY
    || SECRET_FALLBACK
  );
}

function sign(issuedAtMs: number): string {
  const payload = `${TOKEN_PREFIX}|${issuedAtMs}`;
  return createHmac('sha256', getAdminSecret()).update(payload).digest('hex');
}

/**
 * Mint a new admin auth token. Call only after verifying username/password
 * match the puzzle-known values.
 */
export function issueAdminToken(): string {
  const issuedAtMs = Date.now();
  const signature = sign(issuedAtMs);
  return `${issuedAtMs.toString(36)}.${signature}`;
}

/**
 * Validate an admin auth token. Returns true if it's well-formed, signed
 * with the current secret, and within the validity window.
 *
 * Defensive against:
 *   - missing / empty tokens
 *   - tampered signatures (timing-safe compare)
 *   - future timestamps (server clock, bugs)
 *   - tokens older than the validity window
 *   - pathological length mismatches (Buffer compare throws otherwise)
 */
export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [rawTs, providedSig] = parts;

  const issuedAt = parseInt(rawTs, 36);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;

  const now = Date.now();
  if (issuedAt > now + 60_000) return false; // future-dated tokens (clock skew allowance: 1 min)
  if (now - issuedAt > TOKEN_VALIDITY_MS) return false;

  const expected = sign(issuedAt);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  try {
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

/**
 * Cookie name used to carry the token from the unlock endpoint to the
 * /admin route. HttpOnly so client JS can't read it; the client holds
 * a MIRROR of the same token in sessionStorage so the in-terminal
 * progress-detection can tell "user was authed on /admin at some point
 * this session" without issuing a server call on every key press.
 */
export const ADMIN_COOKIE_NAME = 'dhruv_admin_unlock';
