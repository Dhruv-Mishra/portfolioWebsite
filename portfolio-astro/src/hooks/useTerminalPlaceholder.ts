"use client";

/**
 * useTerminalPlaceholder — cycles a typewritten placeholder string through
 * terminal-themed command hints. Returns a ref for a `<span>` overlay that
 * renders the animated text; hide the span when the input is non-empty.
 *
 * Mirrors `usePlaceholderTypewriter` in StickyNoteChat, but with phrases
 * tuned for the terminal command surface (help / projects / skills / etc.).
 *
 * Cycling runs whenever `isActive` is true (typically `!input` — i.e. the
 * field is empty). As soon as the user types, `isActive` becomes false, the
 * overlay unmounts, and the real caret takes over without a visual jump.
 */

import { useEffect, useRef } from 'react';
import { TIMING_TOKENS } from '@/lib/designTokens';

const PHRASES = [
  'type "help" to start…',
  'try "projects"…',
  'try "skills"…',
  'try "joke"…',
  '"about" me?',
  'type a command…',
] as const;

export function useTerminalPlaceholder(isActive: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      if (ref.current) ref.current.textContent = PHRASES[0];
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const setDOM = (s: string) => {
      if (ref.current) ref.current.textContent = s;
    };

    const cycle = () => {
      if (cancelled) return;
      const text = PHRASES[idxRef.current % PHRASES.length];
      let i = 0;

      // Type phase
      interval = setInterval(() => {
        if (cancelled) {
          if (interval) clearInterval(interval);
          return;
        }
        i++;
        setDOM(text.slice(0, i));
        if (i >= text.length) {
          if (interval) clearInterval(interval);
          // Pause, then erase
          timer = setTimeout(() => {
            if (cancelled) return;
            let len = text.length;
            interval = setInterval(() => {
              if (cancelled) {
                if (interval) clearInterval(interval);
                return;
              }
              len--;
              setDOM(text.slice(0, len));
              if (len <= 0) {
                if (interval) clearInterval(interval);
                idxRef.current++;
                timer = setTimeout(cycle, TIMING_TOKENS.pauseShort);
              }
            }, TIMING_TOKENS.placeholderEraseSpeed);
          }, TIMING_TOKENS.pauseExtra);
        }
      }, TIMING_TOKENS.placeholderTypeSpeed);
    };

    timer = setTimeout(cycle, TIMING_TOKENS.initialDelay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

  return ref;
}
