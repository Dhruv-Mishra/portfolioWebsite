import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined): void {
  Object.defineProperty(process.env, 'NODE_ENV', {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

describe('matrix notes access tokens', () => {
  beforeEach(() => {
    vi.resetModules();
    setNodeEnv('test');
    vi.stubEnv('MATRIX_NOTES_ACCESS_SECRET', 'matrix-notes-test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setNodeEnv(originalNodeEnv);
    vi.useRealTimers();
  });

  it('accepts a freshly issued signed token', async () => {
    const { issueMatrixNotesAccessToken, verifyMatrixNotesAccessToken } =
      await import('@/lib/matrixNotesAccess.server');

    expect(verifyMatrixNotesAccessToken(issueMatrixNotesAccessToken())).toBe(true);
  });

  it('rejects missing, malformed, and tampered tokens', async () => {
    const { issueMatrixNotesAccessToken, verifyMatrixNotesAccessToken } =
      await import('@/lib/matrixNotesAccess.server');
    const token = issueMatrixNotesAccessToken();
    const [timestamp, signature] = token.split('.');
    const tampered = `${timestamp}.${signature[0] === '0' ? '1' : '0'}${signature.slice(1)}`;

    expect(verifyMatrixNotesAccessToken(null)).toBe(false);
    expect(verifyMatrixNotesAccessToken('not-a-token')).toBe(false);
    expect(verifyMatrixNotesAccessToken(tampered)).toBe(false);
  });

  it('accepts an escape challenge only after the overlay delay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:00:00Z'));
    const { issueMatrixNotesChallengeToken, verifyMatrixNotesChallengeToken } =
      await import('@/lib/matrixNotesAccess.server');
    const challenge = issueMatrixNotesChallengeToken();

    expect(verifyMatrixNotesChallengeToken(challenge)).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(verifyMatrixNotesChallengeToken(challenge)).toBe(true);
  });

  it('fails closed in production without a dedicated secret', async () => {
    setNodeEnv('production');
    vi.stubEnv('MATRIX_NOTES_ACCESS_SECRET', '');
    const { issueMatrixNotesAccessToken, verifyMatrixNotesAccessToken } =
      await import('@/lib/matrixNotesAccess.server');

    expect(verifyMatrixNotesAccessToken('anything')).toBe(false);
    expect(() => issueMatrixNotesAccessToken()).toThrow(/MATRIX_NOTES_ACCESS_SECRET/);
  });
});