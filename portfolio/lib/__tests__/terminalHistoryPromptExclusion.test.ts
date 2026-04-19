/**
 * Tests for the terminal-history exclusion path — verifies that inline-prompt
 * submissions (passwords, usernames) do NOT end up in the ↑/↓ history ring.
 *
 * We test `computeNextHistory` — a pure helper exported from
 * `context/TerminalContext.tsx` that mirrors the reducer's history-decision
 * logic. Keeping a pure function means vitest (node env) can exercise the
 * rules without mounting the full provider via a DOM harness.
 *
 * Why this matters: the `sudo cat adminTerminal.txt` password prompt and
 * the `sudo admin` username+password pair route through the same
 * inline-prompt machinery. Before the fix, their submissions were
 * appended to `commandHistory`, so pressing Up arrow at the main prompt
 * would surface passwords in plaintext (well, mask-text — the raw value
 * was captured via addToHistory). The fix is surgical: `addCommand`
 * now accepts `{ skipHistory: true }` which suppresses history capture
 * while still writing to the visible transcript.
 */
import { describe, it, expect } from 'vitest';
import { computeNextHistory } from '@/context/TerminalContext';

describe('computeNextHistory (inline-prompt history exclusion)', () => {
  it('appends normal commands to the history ring', () => {
    expect(computeNextHistory([], 'help')).toEqual(['help']);
    expect(computeNextHistory(['ls'], 'help')).toEqual(['ls', 'help']);
  });

  it('skips history when skipHistory is true', () => {
    // Password-mask echo from `sudo cat adminTerminal.txt`.
    expect(computeNextHistory(['ls'], '•••••', { skipHistory: true })).toEqual(['ls']);
    // Username echo from `sudo admin`.
    expect(computeNextHistory(['ls'], 'dhruv@root', { skipHistory: true })).toEqual(['ls']);
    // Password-mask echo from `sudo admin` second step.
    expect(computeNextHistory(['ls'], '•••••••••••••', { skipHistory: true })).toEqual(['ls']);
  });

  it('skips empty / whitespace commands even without skipHistory', () => {
    expect(computeNextHistory(['ls'], '')).toEqual(['ls']);
    expect(computeNextHistory(['ls'], '   ')).toEqual(['ls']);
    expect(computeNextHistory(['ls'], '\t\n')).toEqual(['ls']);
  });

  it('preserves history-ring order when mixing normal + skipped commands', () => {
    // Simulate the realistic flow:
    //   1) user runs `sudo cat adminTerminal.txt`     → goes in history
    //   2) password prompt → user types wrong pass    → SKIPPED
    //   3) user runs `help`                           → goes in history
    //   Pressing ↑ at the main prompt should cycle between (1) and (3),
    //   never surfacing the masked password.
    let ring: string[] = [];
    ring = computeNextHistory(ring, 'sudo cat adminTerminal.txt');
    ring = computeNextHistory(ring, '•••••', { skipHistory: true });
    ring = computeNextHistory(ring, 'help');
    expect(ring).toEqual(['sudo cat adminTerminal.txt', 'help']);
  });

  it('covers the sudo admin flow (username + password, both skipped)', () => {
    // `sudo admin` uses two inline prompts: username, then password.
    let ring: string[] = [];
    ring = computeNextHistory(ring, 'sudo admin');
    ring = computeNextHistory(ring, 'dhruv@root', { skipHistory: true });
    ring = computeNextHistory(ring, '•••••••••••••', { skipHistory: true });
    ring = computeNextHistory(ring, 'whoami');
    expect(ring).toEqual(['sudo admin', 'whoami']);
  });

  it('defaults skipHistory to false when options are omitted', () => {
    expect(computeNextHistory([], 'ls', undefined)).toEqual(['ls']);
    expect(computeNextHistory([], 'ls', {})).toEqual(['ls']);
  });

  it('returns a fresh array (does not mutate the input)', () => {
    const input = ['help'];
    const out = computeNextHistory(input, 'ls');
    expect(out).not.toBe(input);
    expect(input).toEqual(['help']);
  });
});
