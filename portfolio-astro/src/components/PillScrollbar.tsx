"use client";

import { useRef, useEffect, useCallback } from 'react';
import { LAYOUT_TOKENS, TIMING_TOKENS } from '@/lib/designTokens';

// Pill position written directly to DOM via ref to avoid React re-renders on scroll.
const PILL_HEIGHT_RATIO = LAYOUT_TOKENS.pillHeightRatio;
const PILL_MIN_PX = LAYOUT_TOKENS.pillMinPx;

const DEFAULT_PILL_STYLE = { opacity: 0, backgroundColor: 'var(--c-ink)', transition: 'opacity 0.3s' } as const;

export default function PillScrollbar({
  scrollRef,
  color,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  color?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Position the pill via direct DOM writes (no state, no re-render).
  // Uses rAF to coalesce rapid scroll events into a single layout read+write per frame.
  const rafRef = useRef(0);

  const updatePill = useCallback(() => {
    if (rafRef.current) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      const pill = pillRef.current;
      const track = trackRef.current;
      if (!el || !pill || !track) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll < 1) { pill.style.opacity = '0'; return; }

      const pillH = Math.max(track.clientHeight * PILL_HEIGHT_RATIO, PILL_MIN_PX);
      const top = (scrollTop / maxScroll) * (track.clientHeight - pillH);

      pill.style.height = `${pillH}px`;
      pill.style.top = `${top}px`;
      pill.style.opacity = '0.5';

      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => {
        if (!draggingRef.current && pillRef.current) pillRef.current.style.opacity = '0';
      }, TIMING_TOKENS.scrollbarFadeDelay);
    });
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updatePill, { passive: true });
    const ro = new ResizeObserver(updatePill);
    ro.observe(el);
    updatePill();
    return () => {
      el.removeEventListener('scroll', updatePill);
      ro.disconnect();
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef, updatePill]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const track = trackRef.current;
    const scrollEl = scrollRef.current;
    const pill = pillRef.current;
    if (!track || !scrollEl || !pill) return;

    pill.style.opacity = '0.5';
    const trackRect = track.getBoundingClientRect();
    const pillH = Math.max(trackRect.height * PILL_HEIGHT_RATIO, PILL_MIN_PX);
    const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;

    const move = (ev: PointerEvent) => {
      const y = ev.clientY - trackRect.top - pillH / 2;
      const trackUsable = trackRect.height - pillH;
      scrollEl.scrollTop = Math.max(0, Math.min(1, y / trackUsable)) * maxScroll;
    };

    const up = () => {
      draggingRef.current = false;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      fadeTimerRef.current = setTimeout(() => {
        if (pillRef.current) pillRef.current.style.opacity = '0';
      }, TIMING_TOKENS.scrollbarFadeDelay);
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    move(e.nativeEvent);
  }, [scrollRef]);

  const pillStyle = color
    ? { opacity: 0, backgroundColor: color, transition: 'opacity 0.3s' } as const
    : DEFAULT_PILL_STYLE;

  return (
    <div
      ref={trackRef}
      className="absolute top-0 right-0 bottom-0 w-4 z-20"
      onPointerDown={onPointerDown}
      aria-hidden
    >
      <div
        ref={pillRef}
        className="absolute right-[3px] w-[var(--c-pill-w)] rounded-full"
        style={pillStyle}
      />
    </div>
  );
}
