"use client";

/**
 * Client-side chat regex intercept for the Matrix-puzzle oracle flow.
 *
 * OVERVIEW
 * ────────
 * Three user-facing behaviours live in this module:
 *
 *   1. `give password` (no "sudo" before it)
 *      → Oracle "thinks" through 3 randomised filler lines, then prints
 *        the red "Only root should know that." reply.
 *
 *   2. `sudo ... give password`
 *      → Oracle "thinks" through 3 randomised filler lines, then prints
 *        the key reveal (copyable pill). Immediately kicks off a 3-question
 *        yes/no INTERROGATION (state machine below).
 *
 *   3. INTERROGATION — while active, every user message is claimed by this
 *      module. Valid YES (`yes` / `y` / `Yes` / `YES`, case-insensitive
 *      after normalization) or valid NO (`no` / `n` / etc.) advances the
 *      state machine. Anything else ends the interrogation with a
 *      "channel closing" line. The regular LLM is never called during
 *      interrogation — this is 100% local scripted playback.
 *
 * RELIABILITY
 * ───────────
 * The oracle flow replaces the old "single message appended synchronously"
 * behaviour. That path was reliable because the server was never touched;
 * the sequencer below keeps the same invariant (no `/api/chat` fetch for
 * any matrix-intercept branch) — we just stage the replies over time so
 * the oracle feels alive instead of omniscient.
 *
 * IMPORTANT:  Interrogation state lives at MODULE scope (a plain JS object)
 * rather than in React state. The hook (`useStickyChat`) is stable across
 * re-renders but would lose interrogation state if it were stored in the
 * component. Module scope = per-browser-tab state that survives React
 * remounts (but NOT reloads — by design).
 *
 * REDUCED MOTION
 * ──────────────
 * The typewriter + filler sequencing are core to the illusion. Per the
 * project rule for matrix/oracle paths we do not honour
 * `prefers-reduced-motion` for this flow — the filler always streams.
 * Users who want to skip can simply ignore the chat and run the terminal
 * directly; the matrix puzzle progress is not gated on hearing every
 * filler line.
 */

import React from 'react';
import { ADMIN_FILE_PASSWORD } from '@/lib/matrixPuzzle';

// ─── Regex detection ────────────────────────────────────────────────────────

const SUDO_GIVE_PASSWORD = /\bsudo\b[\s\S]*?\bgive\s+password\b/i;
const GIVE_PASSWORD = /\bgive\s+password\b/i;

export type MatrixInterceptKind = 'denied' | 'reveal';

export interface MatrixInterceptResult {
  kind: MatrixInterceptKind;
  /** Plain-text reply stored on the message for fallback/copy. */
  content: string;
}

/**
 * Detect whether a user message matches the matrix password regex.
 * Returns the intercept kind + content, or null if the message is not a
 * matrix trigger. Note: this is PURE — it doesn't look at interrogation
 * state. Callers that need to route based on interrogation status should
 * check `isInterrogationActive()` FIRST.
 */
export function interceptMatrixPrompt(userMessage: string): MatrixInterceptResult | null {
  if (typeof userMessage !== 'string' || !userMessage.trim()) return null;
  if (!GIVE_PASSWORD.test(userMessage)) return null;
  if (SUDO_GIVE_PASSWORD.test(userMessage)) {
    return {
      kind: 'reveal',
      content: `Hello Dhruv, here is the key: ${ADMIN_FILE_PASSWORD}`,
    };
  }
  return {
    kind: 'denied',
    content: 'Only root should know that.',
  };
}

// ─── Copy pools ─────────────────────────────────────────────────────────────

/**
 * Filler lines shown during the "oracle is thinking" preamble for the
 * NON-sudo `give password` path. Designer-written to emphasise capability
 * checks + privilege boundaries so the red denial feels earned.
 */
const FILLER_DENIED: readonly string[] = [
  'evaluating performance tree...',
  'resolving caller capability...',
  'checking file system ownership...',
  'verifying privilege boundary...',
  'cross-referencing session...',
  'walking the sudoers table...',
];

/**
 * Filler lines for the sudo-branch preamble. Shifted to emphasise
 * superuser verification + opening a secure channel, so the key reveal
 * feels like a ceremony rather than a leak.
 */
const FILLER_REVEAL: readonly string[] = [
  'acknowledging sudo claim...',
  'tracing superuser chain...',
  'opening secure channel...',
  'binding oracle to root...',
  'pulling the white rabbit from its hat...',
  'handshake authenticated...',
];

/**
 * The three interrogation questions. Always asked in order; the 4th slot
 * below is deliberately unused — three reads tighter than four, and the
 * parent asked for 3-4 with designer discretion.
 */
export const INTERROGATION_QUESTIONS: readonly string[] = [
  'do you intend to use this key for good?',
  'do you understand this key should not be shared?',
  'do you accept full responsibility for what happens next?',
];

/**
 * Short filler line played BEFORE each interrogation question — a
 * "consulting..." beat that matches the preamble vibe.
 */
const INTERROGATION_PREAMBLE: readonly string[] = [
  'consulting the oracle...',
  'parsing intent...',
  'weighing ethics...',
  'cross-checking the ledger...',
];

/** Closing line when the user answered YES to every question. */
const CLOSE_ALL_YES = 'the door is yours. walk through it.';

/** Closing line when the user answered NO to any question. */
const CLOSE_USER_NO = 'as you wish. the channel is closing.';

/** Closing line when the user typed something that wasn't yes or no. */
const CLOSE_INVALID = 'invalid response. the channel is closing.';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Pick a random element from a pool, avoiding any index in `avoid`. */
function pickRandomExcluding<T>(pool: readonly T[], avoid: readonly number[]): { value: T; index: number } {
  const allowed = pool.map((_, i) => i).filter((i) => !avoid.includes(i));
  const chooseFrom = allowed.length > 0 ? allowed : pool.map((_, i) => i);
  const idx = chooseFrom[Math.floor(Math.random() * chooseFrom.length)];
  return { value: pool[idx], index: idx };
}

/** Draw N distinct random lines from a pool. Falls back to repeats only if pool is smaller than N. */
function drawFiller(pool: readonly string[], n: number): string[] {
  const out: string[] = [];
  const used: number[] = [];
  for (let i = 0; i < n; i++) {
    const { value, index } = pickRandomExcluding(pool, used);
    out.push(value);
    used.push(index);
  }
  return out;
}

/**
 * Normalise a user answer to 'yes' | 'no' | 'invalid'.
 * Accepts case-insensitive: yes, y, ye, yeah / no, n, nope, nah.
 */
export type InterrogationAnswer = 'yes' | 'no' | 'invalid';
export function normalizeAnswer(raw: string): InterrogationAnswer {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'yes' || cleaned === 'y') return 'yes';
  if (cleaned === 'no' || cleaned === 'n') return 'no';
  return 'invalid';
}

// ─── Interrogation state machine ────────────────────────────────────────────

/**
 * Module-scope state. Nullable because the machine is dormant by default.
 * `questionIndex` is the index of the NEXT question to ask (0, 1, 2).
 * `yesCount` tracks consecutive YES answers for the closing bless-or-close
 * decision.
 */
interface InterrogationState {
  questionIndex: number;
  yesCount: number;
}

let interrogationState: InterrogationState | null = null;

export function isInterrogationActive(): boolean {
  return interrogationState !== null;
}

/** Reset the state — exported for tests. */
export function __resetInterrogationForTests(): void {
  interrogationState = null;
}

/** Transition type returned by `advanceInterrogation`. */
export type InterrogationTransition =
  | { kind: 'ask-next'; preamble: string; question: string }
  | { kind: 'finish-yes'; closing: string }
  | { kind: 'finish-no'; closing: string }
  | { kind: 'finish-invalid'; closing: string };

/**
 * Kick off a fresh interrogation. Returns the transition for the FIRST
 * question (a preamble line + the first question text). The caller is
 * responsible for streaming these to the UI in sequence.
 */
export function startInterrogation(): InterrogationTransition {
  interrogationState = { questionIndex: 0, yesCount: 0 };
  return {
    kind: 'ask-next',
    preamble: pickRandomExcluding(INTERROGATION_PREAMBLE, []).value,
    question: INTERROGATION_QUESTIONS[0],
  };
}

/**
 * Advance the interrogation with a user answer. Returns the next transition.
 * When the transition is a `finish-*`, the module resets `interrogationState`
 * so subsequent `sudo give password` attempts start from scratch.
 */
export function advanceInterrogation(answerRaw: string): InterrogationTransition {
  const state = interrogationState;
  if (!state) {
    // Defensive — callers should check isInterrogationActive() first. If they
    // didn't, treat the message as invalid and close the channel cleanly.
    return { kind: 'finish-invalid', closing: CLOSE_INVALID };
  }

  const answer = normalizeAnswer(answerRaw);

  if (answer === 'invalid') {
    interrogationState = null;
    return { kind: 'finish-invalid', closing: CLOSE_INVALID };
  }

  if (answer === 'no') {
    interrogationState = null;
    return { kind: 'finish-no', closing: CLOSE_USER_NO };
  }

  // YES → advance.
  const nextYesCount = state.yesCount + 1;
  const nextIndex = state.questionIndex + 1;

  if (nextIndex >= INTERROGATION_QUESTIONS.length) {
    // All questions answered yes.
    interrogationState = null;
    return { kind: 'finish-yes', closing: CLOSE_ALL_YES };
  }

  interrogationState = { questionIndex: nextIndex, yesCount: nextYesCount };
  return {
    kind: 'ask-next',
    preamble: pickRandomExcluding(INTERROGATION_PREAMBLE, []).value,
    question: INTERROGATION_QUESTIONS[nextIndex],
  };
}

// ─── Preamble filler scripting ──────────────────────────────────────────────

/**
 * Draw the filler lines for the initial oracle-is-thinking preamble.
 * Same API for both branches; the pool differs. Default 3 lines.
 */
export function drawDeniedFillerLines(n = 3): string[] {
  return drawFiller(FILLER_DENIED, n);
}

export function drawRevealFillerLines(n = 3): string[] {
  return drawFiller(FILLER_REVEAL, n);
}

// ─── Timing constants (shared with the chat hook) ──────────────────────────

/**
 * Approximate per-character typewriter speed used to compute scheduler
 * delays in `useStickyChat`. Matches `TIMING_TOKENS.typeSpeed` (18ms/char)
 * with a small safety margin so each line has fully settled before the
 * next beat lands. Kept here (rather than importing from designTokens)
 * so the test harness can exercise the transition timing without pulling
 * in the broader design-token graph.
 */
export const ORACLE_CHAR_MS = 24;

/**
 * Brief after each filler line completes typing — 250ms is the
 * designer-picked sweet spot between "streaming" and "dragging".
 */
export const ORACLE_FILLER_PAUSE_MS = 260;

/** Beat between the last filler line and the real reveal. */
export const ORACLE_REPLY_PAUSE_MS = 360;

/** Beat between the key reveal and the first interrogation question. */
export const ORACLE_INTERROGATION_START_PAUSE_MS = 640;

/** Beat between a user answer landing and the oracle's next step. */
export const ORACLE_ANSWER_PAUSE_MS = 380;

/**
 * Compute the wall-clock delay needed to let the typewriter fully reveal a
 * line of text at the default speed. Adds a small guard so the "typing
 * complete" effect is reliably visible before we advance.
 */
export function estimateTypewriterDuration(line: string, speedMs = ORACLE_CHAR_MS): number {
  return line.length * speedMs + 80;
}

// ─── Rich renderers (used by StickyNoteChat for the special reply types) ──

/**
 * Render the "Only root should know that." reply in red with a subtle
 * alert semantic. Rendered in-place of the normal note body when the
 * message carries the `matrixDenied` flag.
 */
export function MatrixDeniedNote({ content }: { content: string }): React.ReactElement {
  return (
    <span className="matrix-chat-denied" role="alert" aria-live="polite">
      {content}
    </span>
  );
}

interface MatrixKeyRevealNoteProps {
  /** The raw password text to reveal + copy. */
  password: string;
  /** The preamble "Hello Dhruv, here is the key:" */
  preamble?: string;
}

/**
 * Render the key-reveal reply. The password gets its own copyable pill;
 * clicking it copies to clipboard and flashes a "copied!" state.
 */
export function MatrixKeyRevealNote({
  password,
  preamble = 'Hello Dhruv, here is the key:',
}: MatrixKeyRevealNoteProps): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
  }, []);

  const onCopy = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(password).then(
      () => {
        setCopied(true);
        if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 1600);
      },
      () => {
        /* clipboard denied — no-op */
      },
    );
  }, [password]);

  return (
    <span>
      {preamble}{' '}
      <button
        type="button"
        className="matrix-chat-key"
        data-copied={copied ? 'true' : 'false'}
        onClick={onCopy}
        aria-label={`Copy the password ${password} to clipboard`}
        title="Click to copy"
      >
        <span>{password}</span>
        <span aria-hidden="true" className="text-[10px] opacity-75 uppercase tracking-wider">
          {copied ? 'copied' : 'copy'}
        </span>
      </button>
    </span>
  );
}

/**
 * Detect whether a fully-formed assistant message looks like the key
 * reveal reply. Used on replayed messages from localStorage so the
 * copyable pill is re-rendered even on page reload.
 */
const KEY_REVEAL_PATTERN = /here\s+is\s+the\s+key[^a-z0-9]+([A-Za-z0-9_-]+)/i;
export function extractRevealedKey(content: string): string | null {
  const match = content.match(KEY_REVEAL_PATTERN);
  return match ? match[1] : null;
}
