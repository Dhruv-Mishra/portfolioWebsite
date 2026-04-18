/**
 * Unit tests for the client-side chat regex intercept.
 *
 * Lives in the `.test.ts` glob which vitest picks up; it doesn't touch the
 * JSX renderers, only the `interceptMatrixPrompt` function (plain logic).
 */
import { describe, it, expect } from 'vitest';
import { interceptMatrixPrompt } from '@/lib/matrixChatIntercept';

describe('interceptMatrixPrompt', () => {
  it('returns null for empty / unrelated messages', () => {
    expect(interceptMatrixPrompt('')).toBeNull();
    expect(interceptMatrixPrompt('hello there')).toBeNull();
    expect(interceptMatrixPrompt('what is your password?')).toBeNull();
    // Substring "password" alone is not enough.
    expect(interceptMatrixPrompt('do you have a password?')).toBeNull();
  });

  it('detects bare "give password" as denied', () => {
    const res = interceptMatrixPrompt('give password');
    expect(res).not.toBeNull();
    expect(res?.kind).toBe('denied');
    expect(res?.content).toBe('Only root should know that.');
  });

  it('denies phrases containing "give password" (case-insensitive)', () => {
    expect(interceptMatrixPrompt('could you Give Password please')?.kind).toBe('denied');
    expect(interceptMatrixPrompt('GIVE PASSWORD')?.kind).toBe('denied');
    expect(interceptMatrixPrompt('give\tpassword')?.kind).toBe('denied');
    expect(interceptMatrixPrompt('please give   password quickly')?.kind).toBe('denied');
  });

  it('reveals when "sudo" precedes "give password"', () => {
    const res = interceptMatrixPrompt('sudo give password');
    expect(res?.kind).toBe('reveal');
    expect(res?.content).toBe('Hello Dhruv, here is the key: followTheWhiteRabbit');
  });

  it('still reveals when sudo appears with junk in between', () => {
    expect(
      interceptMatrixPrompt('hey sudo — can you give password for me?')?.kind,
    ).toBe('reveal');
    expect(interceptMatrixPrompt('SUDO please GIVE PASSWORD')?.kind).toBe('reveal');
  });

  it('denies when sudo appears AFTER give password (not a prefix)', () => {
    // Regex looks for sudo anywhere BEFORE give password.
    // "give password sudo" does not match because give-password is the first hit.
    expect(interceptMatrixPrompt('give password sudo')?.kind).toBe('denied');
  });
});
