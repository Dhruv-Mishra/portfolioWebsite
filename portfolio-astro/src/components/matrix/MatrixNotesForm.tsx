'use client';

/**
 * MatrixNotesForm — submission form for `/matrix-notes`.
 *
 * Mirrors `GuestbookForm` in contract (same POST shape, same sanitization,
 * same honeypot, same rate-limit responses) but renders with the matrix-
 * themed visual identity (emerald on dark) instead of the paper + tape look.
 *
 * iOS Safari notes:
 *   - All inputs use `fontSize: 16px` (or larger) to avoid the automatic
 *     zoom-on-focus that fires on anything below 16px.
 *   - Submit button min-height 44px for Apple HIG tap-target compliance.
 *   - After a successful submission we use `router.refresh()` to re-run
 *     the server component chain — not `window.location` which iOS can
 *     sometimes block inside async handlers.
 *
 * State machine:
 *   idle → submitting → success (brief confirmation) → idle
 *   idle → submitting → error (display, allow retry)
 *
 * The form does NOT redirect to `/` after posting — the task brief says
 * "redirect to homepage after posting" for the ESCAPE flow (which this
 * form is part of), but the brief also asks the wall to work as a
 * persistent destination for return visits. Compromise: first-time posts
 * (arrived via `?from=escape`) redirect to `/` after a brief success
 * beat; subsequent posts stay on the page. This matches the user's intent
 * (celebrate the escape once, then let the wall behave normally).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GUESTBOOK_LIMITS } from '@/lib/designTokens';
import type {
  GuestbookErrorResponse,
  GuestbookSubmitResponse,
} from '@/lib/guestbook';

interface MatrixNotesFormProps {
  /** Called after a successful submission so the parent can refresh the list. */
  onSubmitted?: () => void;
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

// Hoisted style objects — avoid per-render allocation. iOS Safari's zoom
// behavior is triggered by the computed font-size in px, so we set it
// explicitly rather than relying on a Tailwind class.
const INPUT_BASE_STYLE: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: '1.5',
};

export default function MatrixNotesForm({
  onSubmitted,
}: MatrixNotesFormProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const arrivedFromEscape = searchParams?.get('from') === 'escape';

  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const successRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successRedirectTimerRef.current) clearTimeout(successRedirectTimerRef.current);
      if (successResetTimerRef.current) clearTimeout(successResetTimerRef.current);
    };
  }, []);

  const handleMessageChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value.slice(0, GUESTBOOK_LIMITS.maxMessageLength);
      setMessage(next);
      // Auto-grow up to max-height. Read scrollHeight AFTER resetting so the
      // textarea can both grow AND shrink on deletions.
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      }
    },
    [],
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value.slice(0, GUESTBOOK_LIMITS.maxNameLength));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent<HTMLFormElement>) => {
      if (e) e.preventDefault();
      if (state === 'submitting') return;

      const trimmed = message.trim();
      if (trimmed.length < 5) {
        setErrorMsg('at least 5 characters, please.');
        setState('error');
        return;
      }

      setState('submitting');
      setErrorMsg('');

      try {
        const res = await fetch('/api/matrix-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            message: trimmed,
            name: name.trim() || undefined,
            website,
          }),
        });

        const data = (await res
          .json()
          .catch(() => ({} as Partial<GuestbookSubmitResponse & GuestbookErrorResponse>))) as Partial<
          GuestbookSubmitResponse & GuestbookErrorResponse
        >;

        if (!res.ok) {
          const copy =
            res.status === 429
              ? (data.error ?? 'slow down — the signal is noisy. try again in a bit.')
              : (data.error ?? 'transmission failed. try again.');
          setState('error');
          setErrorMsg(copy);
          return;
        }

        setState('success');
        setMessage('');
        setName('');
        setWebsite('');
        onSubmitted?.();

        // If the user arrived from the escape transition, honor the brief's
        // "redirect to homepage" requirement — but wait long enough for the
        // success confirmation to read. Otherwise reset to idle after a beat
        // so they can post another note.
        if (arrivedFromEscape) {
          successRedirectTimerRef.current = setTimeout(() => {
            // `router.push` — iOS Safari sometimes blocks `window.location`
            // when it's called inside an async handler. `router.push` uses
            // the Next.js client navigation which isn't subject to that
            // heuristic.
            router.push('/');
          }, 1600);
        } else {
          successResetTimerRef.current = setTimeout(() => {
            setState('idle');
          }, 2400);
        }
      } catch (err) {
        console.error('[matrix-notes] submit failed:', err);
        setState('error');
        setErrorMsg('network error — try again.');
      }
    },
    [state, message, name, website, onSubmitted, arrivedFromEscape, router],
  );

  const disabled = state === 'submitting' || state === 'success';
  const charCount = message.length;
  const charCountDanger = charCount > GUESTBOOK_LIMITS.maxMessageLength - 20;

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Post a note to the matrix wall"
      noValidate
      className="relative mx-auto max-w-xl rounded-md border border-emerald-500/30 bg-emerald-950/30 p-5 md:p-6 shadow-[0_12px_36px_-20px_rgba(16,185,129,0.45)]"
    >
      <label
        htmlFor="matrix-note-message"
        className="block font-code text-[11px] tracking-[0.28em] uppercase text-emerald-300/75 mb-2"
      >
        &gt; transmit
      </label>

      <textarea
        id="matrix-note-message"
        ref={textareaRef}
        value={message}
        onChange={handleMessageChange}
        placeholder="leave a note for the next person who escapes…"
        rows={3}
        maxLength={GUESTBOOK_LIMITS.maxMessageLength}
        disabled={disabled}
        aria-invalid={state === 'error' && errorMsg ? true : undefined}
        aria-describedby={state === 'error' ? 'matrix-note-error' : undefined}
        style={INPUT_BASE_STYLE}
        className={cn(
          'w-full resize-none rounded-sm bg-black/40 border border-emerald-500/25',
          'font-hand text-emerald-100 placeholder:text-emerald-400/35',
          'p-3 leading-relaxed',
          'focus:outline-none focus:border-emerald-400/70 focus-visible:outline-none',
          'disabled:opacity-60',
        )}
      />

      <div className="mt-1 flex items-center justify-between">
        <span
          aria-live="polite"
          className={cn(
            'font-code text-[10px]',
            charCountDanger ? 'text-rose-300' : 'text-emerald-400/50',
          )}
        >
          {charCount}/{GUESTBOOK_LIMITS.maxMessageLength}
        </span>
      </div>

      <div className="mt-4">
        <label
          htmlFor="matrix-note-name"
          className="block font-code text-[11px] tracking-[0.28em] uppercase text-emerald-300/75 mb-2"
        >
          &gt; signed
        </label>
        <input
          id="matrix-note-name"
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="your name (optional)"
          maxLength={GUESTBOOK_LIMITS.maxNameLength}
          disabled={disabled}
          autoComplete="name"
          style={INPUT_BASE_STYLE}
          className={cn(
            'w-full rounded-sm bg-black/40 border border-emerald-500/25',
            'font-hand text-emerald-100 placeholder:text-emerald-400/35',
            'px-3 py-2 min-h-[44px]',
            'focus:outline-none focus:border-emerald-400/70 focus-visible:outline-none',
            'disabled:opacity-60',
          )}
        />
      </div>

      {/* Honeypot — out of tab order, offscreen */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="absolute -left-[9999px] w-0 h-0 opacity-0"
      />

      <div className="mt-5 flex items-center justify-end">
        <button
          type="submit"
          disabled={disabled}
          className={cn(
            'min-h-[44px] px-5 rounded-md font-code text-sm tracking-[0.2em] uppercase',
            'bg-emerald-500/15 text-emerald-200 border border-emerald-400/60',
            'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
            'transition-[background-color,box-shadow] duration-200',
            'hover:bg-emerald-400/25 hover:shadow-[0_0_30px_rgba(16,185,129,0.45)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {state === 'submitting' ? 'transmitting…' : state === 'success' ? 'received ✓' : 'transmit'}
        </button>
      </div>

      {state === 'error' && errorMsg && (
        <p
          id="matrix-note-error"
          role="alert"
          className="mt-3 font-code text-xs text-rose-300"
        >
          {errorMsg}
        </p>
      )}

      {state === 'success' && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 font-code text-xs text-emerald-300"
        >
          pending review. thanks for leaving something behind{arrivedFromEscape ? ' — returning home…' : ''}.
        </p>
      )}
    </form>
  );
}
