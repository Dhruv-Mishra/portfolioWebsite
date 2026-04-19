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
  CLOSE_SECURITY_HAZARD,
  drawDeniedFillerLines,
  drawRevealFillerLines,
  interceptMatrixPrompt,
  INTERROGATION_APPROVAL,
  INTERROGATION_QUESTIONS,
  INTERROGATION_RELEASE_PREAMBLE,
  INTERROGATION_STEPS,
  isInterrogationActive,
  MATRIX_KEY_REVEAL_CONTENT,
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

describe('interrogation step definitions', () => {
  it('has exactly 4 steps', () => {
    expect(INTERROGATION_STEPS).toHaveLength(4);
  });

  it('carries mixed polarity — at least two expected NO', () => {
    const noSteps = INTERROGATION_STEPS.filter((s) => s.expected === 'no');
    expect(noSteps.length).toBeGreaterThanOrEqual(2);
  });

  it('each step has non-empty question text', () => {
    for (const step of INTERROGATION_STEPS) {
      expect(step.question.length).toBeGreaterThan(0);
      expect(step.expected === 'yes' || step.expected === 'no').toBe(true);
    }
  });

  it('INTERROGATION_QUESTIONS legacy export matches INTERROGATION_STEPS order', () => {
    expect(INTERROGATION_QUESTIONS).toEqual(INTERROGATION_STEPS.map((s) => s.question));
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
    expect(transition.question).toBe(INTERROGATION_STEPS[0].question);
    expect(transition.expected).toBe(INTERROGATION_STEPS[0].expected);
    expect(transition.preamble.length).toBeGreaterThan(0);
  });

  it('advances when the user answers with the expected polarity', () => {
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    const transition = advanceInterrogation(first.expected);
    expect(transition.kind).toBe('ask-next');
    if (transition.kind !== 'ask-next') throw new Error('type narrow');
    expect(transition.question).toBe(INTERROGATION_STEPS[1].question);
    expect(transition.expected).toBe(INTERROGATION_STEPS[1].expected);
    expect(isInterrogationActive()).toBe(true);
  });

  it('finishes with the reveal once every step is answered correctly', () => {
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    let transition = advanceInterrogation(first.expected);
    for (let i = 1; i < INTERROGATION_STEPS.length - 1; i++) {
      if (transition.kind !== 'ask-next') throw new Error('expected ask-next');
      transition = advanceInterrogation(transition.expected);
    }
    // Final answer — should produce the reveal.
    if (transition.kind !== 'ask-next') throw new Error('expected ask-next');
    const finish = advanceInterrogation(transition.expected);
    expect(finish.kind).toBe('finish-reveal');
    if (finish.kind !== 'finish-reveal') throw new Error('type narrow');
    expect(finish.approval).toBe(INTERROGATION_APPROVAL);
    expect(finish.releasePreamble).toBe(INTERROGATION_RELEASE_PREAMBLE);
    expect(finish.revealContent).toBe(MATRIX_KEY_REVEAL_CONTENT);
    expect(finish.revealContent).toContain('followTheWhiteRabbit');
    expect(isInterrogationActive()).toBe(false);
  });

  it('aborts with finish-hazard when the user answers the OPPOSITE of step 1', () => {
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    const opposite = first.expected === 'yes' ? 'no' : 'yes';
    const finish = advanceInterrogation(opposite);
    expect(finish.kind).toBe('finish-hazard');
    if (finish.kind !== 'finish-hazard') throw new Error('type narrow');
    expect(finish.closing).toBe(CLOSE_SECURITY_HAZARD);
    expect(isInterrogationActive()).toBe(false);
  });

  it('aborts with finish-hazard on the opposite polarity at a later step', () => {
    // Pass step 1, fail step 2 with wrong polarity.
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    const second = advanceInterrogation(first.expected);
    if (second.kind !== 'ask-next') throw new Error('expected ask-next');
    const wrong = second.expected === 'yes' ? 'no' : 'yes';
    const finish = advanceInterrogation(wrong);
    expect(finish.kind).toBe('finish-hazard');
    expect(isInterrogationActive()).toBe(false);
  });

  it('aborts with finish-hazard on the LAST step with wrong polarity (no reveal)', () => {
    // Walk to the last step correctly then blow it.
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    let transition = advanceInterrogation(first.expected);
    for (let i = 1; i < INTERROGATION_STEPS.length - 1; i++) {
      if (transition.kind !== 'ask-next') throw new Error('expected ask-next');
      transition = advanceInterrogation(transition.expected);
    }
    if (transition.kind !== 'ask-next') throw new Error('expected ask-next');
    const wrong = transition.expected === 'yes' ? 'no' : 'yes';
    const finish = advanceInterrogation(wrong);
    expect(finish.kind).toBe('finish-hazard');
    expect(isInterrogationActive()).toBe(false);
  });

  it('aborts with finish-invalid when the user types something that is not yes/no', () => {
    startInterrogation();
    const finish = advanceInterrogation('maybe so');
    expect(finish.kind).toBe('finish-invalid');
    if (finish.kind !== 'finish-invalid') throw new Error('type narrow');
    expect(finish.closing.length).toBeGreaterThan(0);
    expect(isInterrogationActive()).toBe(false);
  });

  it('invalid abort also fires mid-flow (not just at step 1)', () => {
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    advanceInterrogation(first.expected);
    const finish = advanceInterrogation('yeah');
    expect(finish.kind).toBe('finish-invalid');
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
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    const wrong = first.expected === 'yes' ? 'no' : 'yes';
    advanceInterrogation(wrong);
    expect(isInterrogationActive()).toBe(false);

    const t2 = startInterrogation();
    expect(isInterrogationActive()).toBe(true);
    expect(t2.kind).toBe('ask-next');
    if (t2.kind !== 'ask-next') throw new Error('type narrow');
    // Back to question zero.
    expect(t2.question).toBe(INTERROGATION_STEPS[0].question);
  });

  it('rejects wrong-polarity answer on a YES-expected step without revealing the key', () => {
    // Find a YES-expected step; answer with NO — must finish-hazard.
    const yesStep = INTERROGATION_STEPS.findIndex((s) => s.expected === 'yes');
    expect(yesStep).toBeGreaterThanOrEqual(0);

    // Walk up to that step answering correctly.
    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    let transition: ReturnType<typeof advanceInterrogation> = first;
    for (let i = 0; i < yesStep; i++) {
      if (transition.kind !== 'ask-next') throw new Error('walk broke');
      transition = advanceInterrogation(transition.expected);
    }
    if (transition.kind !== 'ask-next') throw new Error('expected ask-next at yes step');
    expect(transition.expected).toBe('yes');
    const finish = advanceInterrogation('no');
    expect(finish.kind).toBe('finish-hazard');
  });

  it('rejects wrong-polarity answer on a NO-expected step without revealing the key', () => {
    const noStep = INTERROGATION_STEPS.findIndex((s) => s.expected === 'no');
    expect(noStep).toBeGreaterThanOrEqual(0);

    const first = startInterrogation();
    if (first.kind !== 'ask-next') throw new Error('expected ask-next');
    let transition: ReturnType<typeof advanceInterrogation> = first;
    for (let i = 0; i < noStep; i++) {
      if (transition.kind !== 'ask-next') throw new Error('walk broke');
      transition = advanceInterrogation(transition.expected);
    }
    if (transition.kind !== 'ask-next') throw new Error('expected ask-next at no step');
    expect(transition.expected).toBe('no');
    const finish = advanceInterrogation('yes');
    expect(finish.kind).toBe('finish-hazard');
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
