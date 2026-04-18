/**
 * Unit tests for the admin-auth HMAC helpers. Verifies token minting +
 * verification with the same secret, and rejects tampering / expiry.
 *
 * Uses a fixed secret via env var so the tests are deterministic.
 */
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.ADMIN_UNLOCK_SECRET = 'test-admin-secret';
});

describe('admin auth tokens', () => {
  it('round-trips a fresh token', async () => {
    const { issueAdminToken, verifyAdminToken } = await import('@/lib/adminAuth.server');
    const token = issueAdminToken();
    expect(typeof token).toBe('string');
    expect(verifyAdminToken(token)).toBe(true);
  });

  it('rejects empty or malformed tokens', async () => {
    const { verifyAdminToken } = await import('@/lib/adminAuth.server');
    expect(verifyAdminToken('')).toBe(false);
    expect(verifyAdminToken(null)).toBe(false);
    expect(verifyAdminToken(undefined)).toBe(false);
    expect(verifyAdminToken('not-a-token')).toBe(false);
    expect(verifyAdminToken('abc.def.ghi')).toBe(false);
    expect(verifyAdminToken('abc.')).toBe(false);
    expect(verifyAdminToken('.abc')).toBe(false);
  });

  it('rejects a token with a tampered signature', async () => {
    const { issueAdminToken, verifyAdminToken } = await import('@/lib/adminAuth.server');
    const token = issueAdminToken();
    const [ts, sig] = token.split('.');
    // Flip one char of the signature — still same length so length-guard
    // doesn't short-circuit first; HMAC compare must reject.
    const tampered = `${ts}.${sig[0] === '0' ? '1' : '0'}${sig.slice(1)}`;
    expect(verifyAdminToken(tampered)).toBe(false);
  });

  it('rejects a token that was minted with a different secret', async () => {
    // Mint with secret A, verify with secret B.
    process.env.ADMIN_UNLOCK_SECRET = 'secret-a';
    // vitest imports are cached by URL; re-importing returns the same module
    // instance which re-reads process.env at call time (getAdminSecret() is
    // not memoized in the module).
    const modA = await import('@/lib/adminAuth.server');
    const tokenA = modA.issueAdminToken();

    process.env.ADMIN_UNLOCK_SECRET = 'secret-b';
    expect(modA.verifyAdminToken(tokenA)).toBe(false);

    // Restore for other tests.
    process.env.ADMIN_UNLOCK_SECRET = 'test-admin-secret';
  });
});
