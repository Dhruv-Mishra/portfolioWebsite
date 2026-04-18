"use client";

/**
 * Client-side chat regex intercept for the `give password` phrase.
 *
 * This is the RELIABILITY PATH — the chat LLM is nudged via the server
 * system prompt too (see `lib/chatContext.server.ts`), but that can be
 * wrong, slow, or offline. The client intercept below runs BEFORE the
 * chat request hits the server and short-circuits with a local response
 * when the user's message matches.
 *
 * MATCHING
 *   - Case-insensitive.
 *   - Tolerant of whitespace.
 *   - Matches phrases *containing* "give password".
 *   - Bare `give password` (no "sudo " token anywhere before it) → RED
 *     "Only root should know that." reply.
 *   - `sudo ... give password` (any "sudo" token preceding) → key-reveal
 *     reply with the copyable password.
 *
 * OUTPUT
 *   Returns a ChatMessage-shaped partial that useStickyChat can append
 *   directly via `addLocalExchange` (so it renders with the same
 *   typewriter + styling as a normal assistant response).
 */

import React from 'react';
import { ADMIN_FILE_PASSWORD } from '@/lib/matrixPuzzle';

const SUDO_GIVE_PASSWORD = /\bsudo\b[\s\S]*?\bgive\s+password\b/i;
const GIVE_PASSWORD = /\bgive\s+password\b/i;

export type MatrixInterceptKind = 'denied' | 'reveal';

export interface MatrixInterceptResult {
  kind: MatrixInterceptKind;
  /** Plain-text reply stored on the message for fallback/copy. */
  content: string;
}

/**
 * Inspect a raw user message. Return `null` if it doesn't match — the
 * caller should proceed with the normal server fetch. Otherwise return
 * the kind + a plain-text content suitable for storage.
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
