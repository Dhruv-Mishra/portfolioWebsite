"use client";

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/utils';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';

export interface MediaSlide {
    key: string;
    label: string;
    content: ReactNode;
}

export interface MediaCarouselHandle {
    goTo: (index: number) => void;
}

interface MediaCarouselProps {
    slides: MediaSlide[];
    label: string;
    onActiveChange?: (index: number) => void;
    ref?: Ref<MediaCarouselHandle>;
}

const ACTIVE_RATIO = 0.6;
const ARROW_CLASS = 'absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-md transition-[background-color,opacity] hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:pointer-events-none disabled:opacity-0 sm:flex';

/** Native scroll-snap swiping; a slide's content mounts only once it starts scrolling into view. */
export default function MediaCarousel({ slides, label, onActiveChange, ref }: MediaCarouselProps) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const reportedRef = useRef(0);
    const [active, setActive] = useState(0);
    const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
    const reducedMotion = useEffectiveReducedMotion();
    const count = slides.length;

    const goTo = useCallback((index: number) => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        const target = Math.max(0, Math.min(count - 1, index));
        scroller.scrollTo({ left: target * scroller.clientWidth, behavior: reducedMotion ? 'auto' : 'smooth' });
    }, [count, reducedMotion]);

    useImperativeHandle(ref, () => ({ goTo }), [goTo]);

    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller || count < 2) return;
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const index = Number((entry.target as HTMLElement).dataset.slideIndex);
                if (entry.isIntersecting) {
                    setSeen((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
                }
                if (entry.intersectionRatio >= ACTIVE_RATIO) setActive(index);
            }
        }, { root: scroller, threshold: [0, ACTIVE_RATIO] });
        for (const slide of scroller.children) observer.observe(slide);
        return () => observer.disconnect();
    }, [count]);

    useEffect(() => {
        if (reportedRef.current === active) return;
        reportedRef.current = active;
        onActiveChange?.(active);
    }, [active, onActiveChange]);

    return (
        <div className="relative h-full w-full" role="group" aria-roledescription="carousel" aria-label={label}>
            <div
                ref={scrollerRef}
                tabIndex={count > 1 ? 0 : undefined}
                aria-label={count > 1 ? `${label}, swipe or use arrow keys` : undefined}
                className="scrollbar-hidden flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
                {slides.map((slide, index) => (
                    <div
                        key={slide.key}
                        data-slide-index={index}
                        role="group"
                        aria-roledescription="slide"
                        aria-label={`${index + 1} of ${count}: ${slide.label}`}
                        inert={count > 1 && index !== active}
                        className="relative h-full w-full shrink-0 snap-center snap-always"
                    >
                        {seen.has(index) ? slide.content : null}
                    </div>
                ))}
            </div>

            {count > 1 ? (
                <>
                    <button
                        type="button"
                        onClick={() => goTo(active - 1)}
                        disabled={active === 0}
                        aria-label="Previous media"
                        data-clickable
                        className={cn(ARROW_CLASS, 'left-3')}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        type="button"
                        onClick={() => goTo(active + 1)}
                        disabled={active === count - 1}
                        aria-label="Next media"
                        data-clickable
                        className={cn(ARROW_CLASS, 'right-3')}
                    >
                        <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2">
                        {slides.map((slide, index) => (
                            <button
                                key={slide.key}
                                type="button"
                                onClick={() => goTo(index)}
                                aria-label={`Show ${slide.label}`}
                                aria-current={index === active ? 'true' : undefined}
                                data-clickable
                                className="flex h-11 w-7 items-center justify-center"
                            >
                                <span
                                    className={cn(
                                        'block h-2 rounded-full bg-white shadow ring-1 ring-black/30 transition-[width,opacity] duration-200 motion-reduce:transition-none',
                                        index === active ? 'w-5 opacity-100' : 'w-2 opacity-60',
                                    )}
                                />
                            </button>
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}
