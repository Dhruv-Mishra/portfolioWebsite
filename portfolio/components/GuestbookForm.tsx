"use client";

import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Pin, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppHaptics } from '@/lib/haptics';
import { TapeStrip } from '@/components/ui/TapeStrip';
import {
  ANIMATION_TOKENS,
  GUESTBOOK_ANIMATION,
  GUESTBOOK_LIMITS,
  Z_INDEX,
} from '@/lib/designTokens';
import type {
  GuestbookErrorResponse,
  GuestbookSubmitResponse,
} from '@/lib/guestbook';

/** Lined-notebook textarea style — hoisted to avoid per-render allocation. */
const TEXTAREA_LINED_STYLE = {
  backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, var(--c-grid) 23px, var(--c-grid) 24px)',
  backgroundAttachment: 'local',
  backgroundPosition: '0 26px',
  lineHeight: '24px',
  paddingTop: '26px',
} as const;

const FORM_INITIAL = { opacity: 0, scale: 0.9 } as const;
const FORM_ANIMATE = { opacity: 1, scale: 1 } as const;
const FORM_REFRESH_TRANSITION = { duration: 0.35, delay: 0.4 } as const;

const SUBMIT_BUTTON_HOVER = { scale: 1.05, rotate: -1 } as const;
const SUBMIT_BUTTON_TAP = { scale: 0.92 } as const;

type FormState = 'idle' | 'submitting' | 'flying' | 'error';

export default function GuestbookForm() {
  const router = useRouter();
  const { submit, success, warning } = useAppHaptics();

  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — real humans leave this blank
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [inlineError, setInlineError] = useState<string>('');
  const [showToast, setShowToast] = useState(false);
  const [formKey, setFormKey] = useState(0); // bump → remount form after success animation

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (flyingTimerRef.current) clearTimeout(flyingTimerRef.current);
  }, []);

  // Auto-grow textarea up to max-h.
  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value.slice(0, GUESTBOOK_LIMITS.maxMessageLength);
    setMessage(next);
    if (inlineError) setInlineError('');
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [inlineError]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value.slice(0, GUESTBOOK_LIMITS.maxNameLength));
  }, []);

  const handleSubmit = useCallback(async (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (state === 'submitting' || state === 'flying') return;

    const trimmedMessage = message.trim();
    if (!trimmedMessage || trimmedMessage.length < 5) {
      warning();
      setInlineError('Add at least 5 characters before pinning.');
      return;
    }

    submit();
    setState('submitting');
    setErrorMsg('');
    setInlineError('');

    try {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedMessage,
          name: name.trim() || undefined,
          website,
        }),
      });

      const data = (await res.json().catch(() => ({} as Partial<GuestbookSubmitResponse & GuestbookErrorResponse>))) as Partial<GuestbookSubmitResponse & GuestbookErrorResponse>;

      if (!res.ok) {
        const copy = res.status === 429
          ? (data.error ?? 'Whoa, let Dhruv catch up. Try again in a bit.')
          : 'the pin fell out — try again ~';
        warning();
        setState('error');
        setErrorMsg(copy);
        return;
      }

      // Fly-to-wall animation, then toast, then fresh form.
      success();
      setState('flying');
      setShowToast(true);

      // Dispatch sticker earn event on the global bus — Agent D's listener handles storage.
      try {
        window.dispatchEvent(new CustomEvent('sticker:earn', { detail: { id: 'signed-guestbook' } }));
      } catch { /* no-op for non-browser paths */ }

      // Refresh server component so the new entry appears (after moderation → approval).
      router.refresh();

      // After the fly animation, reset form state and remount with fade-in.
      flyingTimerRef.current = setTimeout(() => {
        setMessage('');
        setName('');
        setWebsite('');
        setState('idle');
        setFormKey((k) => k + 1);
      }, Math.round(GUESTBOOK_ANIMATION.flyToWall.duration * 1000));

      // Auto-dismiss toast.
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setShowToast(false);
      }, GUESTBOOK_ANIMATION.toastAutoDismissMs);
    } catch {
      warning();
      setState('error');
      setErrorMsg('the pin fell out — try again ~');
    }
  }, [state, message, name, website, submit, success, warning, router]);

  const charCount = message.length;
  const charCountDanger = charCount > 280;
  const isDisabled = state === 'submitting' || state === 'flying';

  const flyingAnim = state === 'flying'
    ? {
        y: GUESTBOOK_ANIMATION.flyToWall.y,
        rotate: GUESTBOOK_ANIMATION.flyToWall.rotate,
        scale: GUESTBOOK_ANIMATION.flyToWall.scale,
        opacity: GUESTBOOK_ANIMATION.flyToWall.opacity,
      }
    : { y: 0, rotate: -1, scale: 1, opacity: 1 };

  return (
    <div className="relative max-w-md md:max-w-lg mx-auto">
      <AnimatePresence mode="wait">
        <m.form
          key={formKey}
          onSubmit={handleSubmit}
          initial={FORM_INITIAL}
          animate={state === 'flying' ? flyingAnim : FORM_ANIMATE}
          transition={state === 'flying'
            ? { duration: GUESTBOOK_ANIMATION.flyToWall.duration, ease: ANIMATION_TOKENS.easing.bounce }
            : FORM_REFRESH_TRANSITION}
          className={cn(
            'relative bg-[var(--note-yellow)] -rotate-1 shadow-md',
            'p-5 pt-7 md:p-6 md:pt-9 pb-9 md:pb-10',
            'border border-yellow-300/40 dark:border-yellow-400/20',
            'font-hand text-[var(--c-ink)]',
          )}
          aria-label="Sign the guestbook"
          noValidate
        >
          <TapeStrip size="md" />

          {/* Message textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              placeholder="Leave a note on the wall ~"
              rows={3}
              maxLength={GUESTBOOK_LIMITS.maxMessageLength}
              disabled={isDisabled}
              aria-label="Your guestbook message"
              aria-invalid={inlineError ? 'true' : undefined}
              aria-describedby={inlineError ? 'guestbook-inline-error' : undefined}
              className={cn(
                'w-full bg-transparent resize-none',
                'font-hand text-[var(--c-ink)] text-base md:text-lg',
                'placeholder:text-[var(--c-ink)]/35',
                'focus:outline-none focus-visible:outline-none',
                'max-h-[160px] overflow-y-auto',
                'disabled:opacity-60',
              )}
              style={TEXTAREA_LINED_STYLE}
            />

            {/* Character counter */}
            <span
              aria-live="polite"
              className={cn(
                'absolute bottom-2 right-4 font-code text-[10px]',
                charCountDanger ? 'text-rose-500 opacity-80' : 'opacity-40',
              )}
            >
              {charCount}/{GUESTBOOK_LIMITS.maxMessageLength}
            </span>
          </div>

          {inlineError && (
            <p
              id="guestbook-inline-error"
              role="alert"
              className="flex items-center gap-1 mt-1 font-hand text-xs text-rose-600 dark:text-rose-400"
            >
              <AlertTriangle size={12} aria-hidden="true" />
              {inlineError}
            </p>
          )}

          {/* Name input row */}
          <div className="mt-4 flex items-baseline gap-2">
            <label htmlFor="guestbook-name" className="font-hand text-sm opacity-50 shrink-0">
              — signed,
            </label>
            <input
              id="guestbook-name"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="your name (optional)"
              maxLength={GUESTBOOK_LIMITS.maxNameLength}
              disabled={isDisabled}
              autoComplete="name"
              className={cn(
                'flex-1 bg-transparent border-0 border-b border-dashed border-[var(--c-ink)]/30',
                'font-hand text-sm md:text-base text-[var(--c-ink)]',
                'placeholder:text-[var(--c-ink)]/35',
                'focus:outline-none focus:border-[var(--c-ink)]/60 focus-visible:border-[var(--c-ink)]/80',
                'disabled:opacity-60',
              )}
            />
          </div>

          {/* Honeypot — visually hidden, out of tab order, bots will fill it */}
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

          {/* Submit row */}
          <div className="flex items-center justify-end mt-4">
            <m.button
              type="submit"
              whileHover={isDisabled ? undefined : SUBMIT_BUTTON_HOVER}
              whileTap={isDisabled ? undefined : SUBMIT_BUTTON_TAP}
              disabled={isDisabled}
              className={cn(
                'flex items-center gap-1.5 px-4 min-h-[44px] rounded-md shadow-sm',
                'bg-[var(--c-ink)] text-[var(--c-paper)]',
                'font-hand font-bold text-sm',
                'transition-opacity disabled:opacity-40 disabled:cursor-not-allowed',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/60',
                state === 'submitting' && 'animate-pulse',
              )}
              aria-label="Pin your note to the wall"
            >
              <Pin size={14} aria-hidden="true" />
              {state === 'submitting' ? 'Pinning...' : 'Pin to wall'}
            </m.button>
          </div>

          {/* Error note — coral sticky */}
          {state === 'error' && errorMsg && (
            <m.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className={cn(
                'relative mt-4 p-3 shadow-sm',
                'bg-[#ffccbc] dark:bg-[#3e2723]',
                'text-orange-900 dark:text-orange-200',
                'font-hand text-sm',
              )}
            >
              <TapeStrip size="sm" />
              <span className="block pt-1">{errorMsg}</span>
            </m.div>
          )}
        </m.form>
      </AnimatePresence>

      {/* Success toast — fixed top-right */}
      <AnimatePresence>
        {showToast && (
          <m.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -16, rotate: 8 }}
            animate={{ opacity: 1, y: 0, rotate: 3 }}
            exit={{ opacity: 0, y: -12, rotate: 8 }}
            transition={{ duration: 0.25 }}
            style={{ zIndex: Z_INDEX.nav }}
            className={cn(
              'fixed top-4 right-4 md:top-6 md:right-6',
              'max-w-[220px] p-3 pt-4',
              'bg-[var(--note-orange)]',
              'font-hand text-sm text-[var(--c-ink)] shadow-md',
              'border border-orange-300/30',
            )}
          >
            <TapeStrip size="sm" />
            pinned! pending Dhruv&apos;s review ✎
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
