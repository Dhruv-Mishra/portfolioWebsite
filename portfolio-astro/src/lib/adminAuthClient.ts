/**
 * Client-side admin auth helpers.
 *
 * The actual HMAC signing happens on the server; the client's job is to:
 *   1. Post credentials to /api/admin/unlock.
 *   2. Mirror the returned token into sessionStorage so the terminal's
 *      puzzle-stage detector can tell "user is currently authed" without
 *      an extra server call.
 *   3. Clear both on logout.
 *
 * The source of truth for access to /admin remains the httpOnly cookie,
 * validated server-side on every request.
 */

import { MATRIX_PUZZLE_KEYS } from '@/lib/matrixPuzzle';

export interface AdminUnlockResult {
  ok: boolean;
  error?: string;
}

/**
 * Post credentials. Returns `{ ok: true }` on success (token also
 * stashed into sessionStorage). Returns `{ ok: false, error }` on any
 * failure — rate-limited, wrong creds, server down.
 */
export async function unlockAdmin(
  username: string,
  password: string,
): Promise<AdminUnlockResult> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Cannot call unlockAdmin on the server.' };
  }
  try {
    const res = await fetch('/api/admin/unlock', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 401) {
      return { ok: false, error: 'Authentication failure' };
    }
    if (res.status === 429) {
      return { ok: false, error: 'Too many attempts — wait a moment.' };
    }
    if (!res.ok) {
      return { ok: false, error: `Unexpected status ${res.status}` };
    }
    const data = await res.json() as { token?: string };
    if (data.token) {
      try {
        window.sessionStorage.setItem(MATRIX_PUZZLE_KEYS.adminAuthToken, data.token);
      } catch {
        /* ignore — token still lives in the httpOnly cookie */
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/** Clear the client-side sessionStorage mirror of the admin token. */
export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MATRIX_PUZZLE_KEYS.adminAuthToken);
  } catch {
    /* ignore */
  }
}

/** Full logout: clears cookie via server + client session mirror. */
export async function logoutAdmin(): Promise<void> {
  clearAdminSession();
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    /* best-effort — cookie deletion is cheap on next request anyway */
  }
}

/**
 * Synchronous read of the session mirror. Used only for terminal's
 * puzzle-stage detection — NOT for access control. Any real access
 * decision goes through the server-verified cookie.
 */
export function hasClientAdminTokenSync(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.sessionStorage.getItem(MATRIX_PUZZLE_KEYS.adminAuthToken);
  } catch {
    return false;
  }
}
