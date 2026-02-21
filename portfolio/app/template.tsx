"use client";

import { m } from "framer-motion";
import { usePathname } from "next/navigation";
import { ANIMATION_TOKENS, INTERACTION_TOKENS } from '@/lib/designTokens';

// Pages that should fade in without horizontal slide
const FADE_ONLY_ROUTES = ['/chat'];

// Pages that manage their own padding (full-bleed layout)
const FULL_BLEED_ROUTES = ['/chat'];

// Hoisted animation objects — avoids allocation per navigation
const INITIAL_FADE_SLIDE = INTERACTION_TOKENS.entrance.fadeSlide.initial;
const INITIAL_FADE_ONLY = { opacity: 0, x: 0 } as const;
const ANIMATE_TARGET = INTERACTION_TOKENS.entrance.fadeSlide.animate;
const TRANSITION = { ease: ANIMATION_TOKENS.easing.easeOut, duration: ANIMATION_TOKENS.duration.moderate };

export default function Template({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const fadeOnly = FADE_ONLY_ROUTES.includes(pathname);
    const fullBleed = FULL_BLEED_ROUTES.includes(pathname);

    return (
        <m.div
            initial={fadeOnly ? INITIAL_FADE_ONLY : INITIAL_FADE_SLIDE}
            animate={ANIMATE_TARGET}
            transition={TRANSITION}
            className={`h-full ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto p-8 md:p-12 ruler-scrollbar'}`}
        >
            {children}
        </m.div>
    );
}
