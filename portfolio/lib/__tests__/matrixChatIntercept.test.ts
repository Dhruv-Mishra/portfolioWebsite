/**
 * Unit tests for the client-side chat regex intercept + interrogation state.
 *
 * Lives in the `.test.ts` glob which vitest picks up; it doesn't touch the
 * JSX renderers, only the pure `interceptMatrixPrompt` function plus the
 * interrogation state machine + answer normaliser.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetInterrogationForTests,
  advanceInterrogation,
  drawDeniedFillerLines,
  drawRevealFillerLines,
  interceptMatrixPrompt,
  INTERROGATION_QUESTIONS,
  isInterrogationActive,
  normalizeAnswer,
  startInterrogation,
} from '@/lib/matrixChatIntercept';

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

describe('normalizeAnswer', () => {
  it('accepts canonical yes forms', () => {
    expect(normalizeAnswer('yes')).toBe('yes');
    expect(normalizeAnswer('Yes')).toBe('yes');
    expect(normalizeAnswer('YES')).toBe('yes');
    expect(normalizeAnswer('y')).toBe('yes');
    expect(normalizeAnswer('Y')).toBe('yes');
  });

  it('accepts canonical no forms', () => {
    expect(normalizeAnswer('no')).toBe('no');
    expect(normalizeAnswer('No')).toBe('no');
    expect(normalizeAnswer('NO')).toBe('no');
    expect(normalizeAnswer('n')).toBe('no');
    expect(normalizeAnswer('N')).toBe('no');
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(normalizeAnswer('  yes  ')).toBe('yes');
    expect(normalizeAnswer('\tno\n')).toBe('no');
  });

  it('treats everything else as invalid', () => {
    expect(normalizeAnswer('')).toBe('invalid');
    expect(normalizeAnswer('maybe')).toBe('invalid');
    expect(normalizeAnswer('sure')).toBe('invalid');
    expect(normalizeAnswer('yeah')).toBe('invalid');
    expect(normalizeAnswer('nope')).toBe('invalid');
    expect(normalizeAnswer('0')).toBe('invalid');
    expect(normalizeAnswer('1')).toBe('invalid');
  });
});

describe('interrogation state machine', () => {
  beforeEach(() => {
    __resetInterrogationForTests();
  });

  it('is inactive by default', () => {
    expect(isInterrogationActive()).toBe(false);
  });

  it('startInterrogation activates the machine and returns the first question', () => {
    const transition = startInterrogation();
    expect(isInterrogationActive()).toBe(true);
    expect(transition.kind).toBe('ask-next');
    if (transition.kind !== 'ask-next') throw new Error('type narrow');
    expect(transition.question).toBe(INTERROGATION_QUESTIONS[0]);
    expect(transition.preamble.length).toBeGreaterThan(0);
  });

  it('advanceInterrogation on a YES advances to Q2', () => {
    startInterrogation();
    const transition = advanceInterrogation('yes');
    expect(transition.kind).toBe('ask-next');
    if (transition.kind !== 'ask-next') throw new Error('type narrow');
    expect(transition.question).toBe(INTERROGATION_QUESTIONS[1]);
    expect(isInterrogationActive()).toBe(true);
  });

  it('advanceInterrogation on 3 YES in a row finishes with blessing', () => {
    startInterrogation();
    advanceInterrogation('yes');
    advanceInterrogation('y');
    const finish = advanceInterrogation('YES');
    expect(finish.kind).toBe('finish-yes');
    if (finish.kind !== 'finish-yes') throw new Error('type narrow');
    expect(finish.closing.length).toBeGreaterThan(0);
    expect(isInterrogationActive()).toBe(false);
  });

  it('advanceInterrogation on NO at step 1 ends the flow', () => {
    startInterrogation();
    const finish = advanceInterrogation('no');
    expect(finish.kind).toBe('finish-no');
    if (finish.kind !== 'finish-no') throw new Error('type narrow');
    expect(finish.closing.length).toBeGreaterThan(0);
    expect(isInterrogationActive()).toBe(false);
  });

  it('advanceInterrogation on NO after some YES answers ends the flow', () => {
    startInterrogation();
    advanceInterrogation('yes');
    const finish = advanceInterrogation('no');
    expect(finish.kind).toBe('finish-no');
    expect(isInterrogationActive()).toBe(false);
  });

  it('advanceInterrogation on an invalid answer closes the channel', () => {
    startInterrogation();
    advanceInterrogation('yes');
    const finish = advanceInterrogation('maybe so');
    expect(finish.kind).toBe('finish-invalid');
    if (finish.kind !== 'finish-invalid') throw new Error('type narrow');
    expect(finish.closing.length).toBeGreaterThan(0);
    expect(isInterrogationActive()).toBe(false);
  });

  it('advanceInterrogation while idle returns finish-invalid without side-effects', () => {
    // Defensive path — callers should check isInterrogationActive() first.
    expect(isInterrogationActive()).toBe(false);
    const finish = advanceInterrogation('yes');
    expect(finish.kind).toBe('finish-invalid');
    expect(isInterrogationActive()).toBe(false);
  });

  it('re-running startInterrogation after a finish works (fresh flow each time)', () => {
    startInterrogation();
    advanceInterrogation('no');
    expect(isInterrogationActive()).toBe(false);

    const t2 = startInterrogation();
    expect(isInterrogationActive()).toBe(true);
    expect(t2.kind).toBe('ask-next');
    if (t2.kind !== 'ask-next') throw new Error('type narrow');
    // Back to question zero.
    expect(t2.question).toBe(INTERROGATION_QUESTIONS[0]);
  });
});

describe('filler draws', () => {
  it('returns 3 non-empty lines for the denied pool', () => {
    const lines = drawDeniedFillerLines(3);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
  });

  it('returns 3 non-empty lines for the reveal pool', () => {
    const lines = drawRevealFillerLines(3);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
  });

  it('distinct picks when pool is larger than N', () => {
    const lines = drawRevealFillerLines(3);
    const unique = new Set(lines);
    expect(unique.size).toBe(3);
  });
});
