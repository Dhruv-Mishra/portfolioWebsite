"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { FEATURED_CAROUSEL as F } from '@/lib/designTokens';

export interface FeaturedSlide {
  slug: string;
  name: string;
  summary: string;
  stack: string;
  year: string;
  image: string;
  blurDataURL: string;
}

type HoldReason = 'hover' | 'focus' | 'hidden' | 'offscreen' | 'voice';

const CONTROL_CLASS = 'flex size-11 items-center justify-center rounded-full text-[var(--c-ink-muted)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--c-ink)] focus-ring';

/** Endless featured-projects slideshow; a CSS pencil line is the clock, and any hold reason or the Pause button stops it. */
export default function FeaturedCarousel({ slides }: { slides: readonly FeaturedSlide[] }) {
  const count = slides.length;
  const reducedMotion = useEffectiveReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [cycle, setCycle] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [holds, setHolds] = useState<ReadonlySet<HoldReason>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const activeRef = useRef<HTMLElement | null>(null);
  // Set when an arrow key leaves from inside the outgoing slide, which turns inert and would drop focus to <body>.
  const refocusRef = useRef(false);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; active: boolean } | null>(null);

  const playing = !reducedMotion && !userPaused;
  const running = playing && holds.size === 0;

  const hold = useCallback((reason: HoldReason, on: boolean) => {
    setHolds((current) => {
      if (current.has(reason) === on) return current;
      const next = new Set(current);
      if (on) next.add(reason);
      else next.delete(reason);
      return next;
    });
  }, []);

  const go = useCallback((step: 1 | -1) => {
    const current = indexRef.current;
    indexRef.current = (current + step + count) % count;
    setDir(step);
    setLeaving(current);
    setIndex(indexRef.current);
    setCycle((value) => value + 1);
  }, [count]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onVisibility = () => hold('hidden', document.visibilityState === 'hidden');
    const onVoice = () => hold('voice', Boolean(document.documentElement.dataset.voiceMode));
    const observer = new IntersectionObserver(
      ([entry]) => hold('offscreen', entry.intersectionRatio < F.visibleRatio),
      { threshold: [0, F.visibleRatio, 1] },
    );
    observer.observe(root);
    onVisibility();
    onVoice();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('voice-mode:change', onVoice);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('voice-mode:change', onVoice);
    };
  }, [hold]);

  useEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    activeRef.current?.querySelector<HTMLElement>('a')?.focus();
  }, [index]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    refocusRef.current = event.target instanceof Element && Boolean(event.target.closest('.featured-slide'));
    go(event.key === 'ArrowLeft' ? -1 : 1);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    drag.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, dx: 0, active: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const slide = activeRef.current;
    if (!d || !slide) return;
    d.dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.active) {
      if (Math.abs(d.dx) < F.dragStartPx || Math.abs(d.dx) < Math.abs(dy)) return;
      d.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      slide.dataset.dragging = '';
    }
    slide.style.transform = `translateX(${d.dx}px) rotate(${d.dx * F.dragRotatePerPx}deg)`;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const slide = activeRef.current;
    if (!d?.active || !slide) return;
    delete slide.dataset.dragging;
    slide.style.transform = '';
    const velocity = Math.abs(d.dx) / Math.max(1, event.timeStamp - d.t);
    if (Math.abs(d.dx) >= F.swipeMinPx || velocity >= F.swipeMinVelocity) go(d.dx < 0 ? 1 : -1);
  };

  const stateOf = (i: number) => (i === index ? 'active' : i === leaving ? 'leaving' : i === (index + 1) % count ? 'next' : 'idle');

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label="Featured projects"
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') hold('hover', true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') hold('hover', false);
      }}
      // Only keyboard focus holds the slideshow; a clicked button keeps focus but should not freeze it.
      onFocus={(event) => hold('focus', event.target.matches(':focus-visible'))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold('focus', false);
      }}
      data-disco-motion="wiggle"
      className="sheet-material relative rotate-[-0.6deg] border border-[var(--c-ink-faint)]/40 p-3 shadow-sticker sm:p-4"
    >
      <div
        className="featured-track"
        style={{ '--featured-dir': dir } as CSSProperties}
        aria-live={playing ? 'off' : 'polite'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {slides.map((slide, i) => {
          const state = stateOf(i);
          const showImage = state !== 'idle';
          return (
            <article
              key={slide.slug}
              ref={state === 'active' ? (node) => { activeRef.current = node; } : undefined}
              data-state={state}
              inert={state !== 'active' || undefined}
              onTransitionEnd={state === 'leaving' ? (event) => {
                if (event.target === event.currentTarget && event.propertyName === 'opacity') setLeaving(null);
              } : undefined}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${slide.name}`}
              className="featured-slide relative grid gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center"
            >
              <div className="-rotate-2 bg-[var(--c-polaroid)] p-2 pb-0 shadow-polaroid">
                <div className="relative aspect-video overflow-hidden bg-[var(--c-ink-faint)]/20">
                  {showImage ? (
                    <Image
                      src={slide.image}
                      alt={`${slide.name} preview`}
                      fill
                      sizes="(max-width: 639px) calc(100vw - 5.25rem), (min-width: 1800px) 290px, 240px"
                      loading="lazy"
                      fetchPriority="low"
                      placeholder="blur"
                      blurDataURL={slide.blurDataURL}
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <p className="py-1 text-center font-hand text-[length:var(--t-hand-sm)] text-[var(--c-polaroid-ink)]">{slide.year}</p>
              </div>
              <div className="min-w-0">
                <h3 className="font-hand text-[length:var(--t-h3)] leading-[var(--lh-snug)] text-[var(--c-heading)]">
                  <Link
                    href={`/projects?project=${slide.slug}`}
                    prefetch={false}
                    draggable={false}
                    className="rounded-sm after:absolute after:inset-0 focus-ring"
                  >
                    {slide.name}
                  </Link>
                </h3>
                <p className="mt-1.5 line-clamp-3 font-body text-[length:var(--t-small)] leading-[var(--lh-body)] text-[var(--c-ink)] md:text-[0.9375rem]">
                  {slide.summary}
                </p>
                <p className="mt-2 font-code text-[length:var(--t-chip)] text-[var(--c-ink-muted)]">{slide.stack}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-1">
        <button type="button" onClick={() => go(-1)} aria-label="Previous project" className={CONTROL_CLASS}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        {!reducedMotion ? (
          <button
            type="button"
            onClick={() => setUserPaused((paused) => !paused)}
            aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'}
            className={CONTROL_CLASS}
          >
            {userPaused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          </button>
        ) : null}
        <button type="button" onClick={() => go(1)} aria-label="Next project" className={CONTROL_CLASS}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
        <div aria-hidden="true" className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--c-ink-faint)]/30">
          {playing ? (
            <span
              key={cycle}
              data-paused={!running}
              onAnimationEnd={() => go(1)}
              className="featured-progress block h-full bg-[var(--c-ink-muted)]"
            />
          ) : null}
        </div>
        <span aria-hidden="true" className="font-hand text-[length:var(--t-hand-sm)] tabular-nums text-[var(--c-ink-muted)]">
          {index + 1} of {count}
        </span>
      </div>
    </div>
  );
}
