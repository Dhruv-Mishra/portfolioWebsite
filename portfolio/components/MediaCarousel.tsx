"use client";

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/utils';
import { Z_INDEX } from '@/lib/designTokens';
import '@/components/projects/projects.css';
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
const ARROW_CLASS = 'project-media-arrows project-media-control focus-ring';

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

    // Arrow keys work from any control inside; the scroller itself stays out of the tab order (it holds the buttons).
    return (
        <div
            className="relative h-full w-full"
            role="group"
            aria-roledescription="carousel"
            aria-label={label}
            onKeyDown={count > 1 ? (event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const target = Math.max(0, Math.min(count - 1, active + (event.key === 'ArrowRight' ? 1 : -1)));
                // The outgoing slide turns inert, which would drop focus to <body>; park it on the target's dot.
                if (event.target instanceof Element && event.target.closest('[data-slide-index]')) {
                    event.currentTarget.querySelectorAll<HTMLButtonElement>('.project-media-dot')[target]?.focus();
                }
                goTo(target);
            } : undefined}
        >
            <div
                ref={scrollerRef}
                className="scrollbar-hidden flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
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
                        style={{ zIndex: Z_INDEX.crease }}
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
                        style={{ zIndex: Z_INDEX.crease }}
                    >
                        <ChevronRight size={20} />
                    </button>
                    <div className="project-media-dots" style={{ zIndex: Z_INDEX.crease }}>
                        {slides.map((slide, index) => (
                            <button
                                key={slide.key}
                                type="button"
                                onClick={() => goTo(index)}
                                aria-label={`Show ${slide.label}`}
                                aria-current={index === active ? 'true' : undefined}
                                data-clickable
                                className="project-media-dot focus-ring"
                            >
                                <span aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}
