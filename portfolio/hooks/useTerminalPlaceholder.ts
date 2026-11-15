"use client";

/**
 * useTerminalPlaceholder — types and erases terminal command hints into a `<span>` while the input is empty.
 * Marks the span's parent with `data-typing` so the block cursor stays solid while characters stream and
 * blinks during pauses. Under reduced motion it shows one static hint.
 */

import { useEffect, useRef } from 'react';
import { TIMING_TOKENS } from '@/lib/designTokens';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';

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
  const reducedMotion = useEffectiveReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!isActive || reducedMotion) {
      el.textContent = PHRASES[0];
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const setTyping = (typing: boolean) => {
      if (el.parentElement) el.parentElement.dataset.typing = String(typing);
    };

    // One recursive timer walks type → pause → erase → pause for each phrase.
    const step = (text: string, length: number, erasing: boolean) => {
      el.textContent = text.slice(0, length);
      if (!erasing && length < text.length) {
        timer = setTimeout(() => step(text, length + 1, false), TIMING_TOKENS.placeholderTypeSpeed);
      } else if (!erasing) {
        setTyping(false);
        timer = setTimeout(() => {
          setTyping(true);
          step(text, length - 1, true);
        }, TIMING_TOKENS.pauseExtra);
      } else if (length > 0) {
        timer = setTimeout(() => step(text, length - 1, true), TIMING_TOKENS.placeholderEraseSpeed);
      } else {
        setTyping(false);
        idxRef.current += 1;
        timer = setTimeout(cycle, TIMING_TOKENS.pauseShort);
      }
    };
    const cycle = () => {
      setTyping(true);
      step(PHRASES[idxRef.current % PHRASES.length], 1, false);
    };

    timer = setTimeout(cycle, TIMING_TOKENS.initialDelay);
    return () => {
      clearTimeout(timer);
      setTyping(false);
    };
  }, [isActive, reducedMotion]);

  return ref;
}
