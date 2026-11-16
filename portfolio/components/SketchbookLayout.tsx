"use client";
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { PAPER_NOISE_SVG } from '@/lib/assets';
import { GRID_PATTERN, Z_INDEX } from '@/lib/designTokens';
import SocialSidebar from './SocialSidebar';

const FeedbackNote = dynamic(() => import('./FeedbackNote'), { ssr: false });
// Mobile-only chrome; desktop visitors never download it.
const SiteDock = dynamic(() => import('./SiteDock'), { ssr: false });

/** Hoisted paper noise overlay style — avoids re-allocation per render */
const PAPER_NOISE_STYLE = {
    backgroundImage: PAPER_NOISE_SVG,
    contain: 'layout style paint',
} as const;

/** Hoisted grid pattern background style — avoids re-allocation per render */
const GRID_PATTERN_STYLE = {
    backgroundSize: GRID_PATTERN.backgroundSize,
    backgroundImage: `linear-gradient(to right, var(--c-grid-line) ${GRID_PATTERN.lineWidth}, transparent ${GRID_PATTERN.lineWidth}),
                      linear-gradient(to bottom, var(--c-grid-line) ${GRID_PATTERN.lineWidth}, transparent ${GRID_PATTERN.lineWidth})`,
    contain: 'strict',
} as const;

const BINDING_STYLE = { zIndex: Z_INDEX.binding } as const;
const BASE_STYLE = { zIndex: Z_INDEX.base } as const;

export default function SketchbookLayout({ children, doodles }: { children: React.ReactNode; doodles?: React.ReactNode }) {
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackLoaded, setFeedbackLoaded] = useState(false);
    const isMobile = useIsMobile();

    // Listen for 'open-feedback' custom event (from terminal command)
    const openFeedback = useCallback(() => {
        setFeedbackLoaded(true);
        setFeedbackOpen(true);
    }, []);
    const closeFeedback = useCallback(() => setFeedbackOpen(false), []);
    useEffect(() => {
        window.addEventListener('open-feedback', openFeedback);
        return () => window.removeEventListener('open-feedback', openFeedback);
    }, [openFeedback]);

    return (
        <div className="h-[100dvh] w-full max-w-full bg-paper transition-colors duration-500 relative flex overflow-hidden">
            {/* Skip to main content for accessibility */}
            <a
                href="#main-content"
                data-skip-nav
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-md"
                style={{ zIndex: Z_INDEX.skipNav }}
            >
                Skip to main content
            </a>

            {/* Stitched binding on paper, a wooden frame edge on the boards (app/look.css) */}
            <div
                className="page-binding w-[var(--c-binding-w)] md:w-[var(--c-binding-w-md)] h-full bg-binding-bg border-r border-binding-border shrink-0 relative transition-colors duration-500"
                style={BINDING_STYLE}
                aria-hidden="true"
            />

            {/* Paper Content Area */}
            <div className="min-w-0 flex-1 relative h-full flex flex-col isolation-auto">
                {/* Real paper, canvas or chalkboard, plus wear; app/look.css picks them from the look prefs */}
                <div className="page-surface" style={BASE_STYLE} aria-hidden="true" />

                {/* Paper Texture Noise Overlay (graph paper and slate) */}
                <div data-paper-grain className="absolute inset-0 pointer-events-none opacity-[0.015] md:opacity-[0.03]"
                    style={{ ...PAPER_NOISE_STYLE, zIndex: Z_INDEX.texture }}
                />

                {/* Background grid; its strength depends on the surface */}
                <div className="page-grid absolute inset-0 pointer-events-none"
                    style={{ ...GRID_PATTERN_STYLE, zIndex: Z_INDEX.base }}
                />

                {/* Doodles and props; each one opts into a theme and a density tier */}
                <div
                    className="page-decor absolute inset-0 pointer-events-none overflow-hidden"
                    style={BASE_STYLE}
                    aria-hidden="true"
                >
                    {doodles}
                </div>

                {/* Crease Shadow near spiral — width derived from --c-spiral-w */}
                <div className="absolute left-0 top-0 bottom-0 w-[var(--c-crease-w)] md:w-[var(--c-crease-w-md)] bg-gradient-to-r from-gray-500/10 to-transparent pointer-events-none" style={{ zIndex: Z_INDEX.crease }} />

                {/* Main Content Container */}
                <main
                    id="main-content"
                    role="main"
                    className="relative h-full w-full min-w-0 overflow-hidden md:perspective-[2000px]"
                    style={{ zIndex: Z_INDEX.content }}
                    tabIndex={-1}
                >
                    {children}
                </main>

                <SocialSidebar onFeedbackClick={openFeedback} />
                {isMobile ? <SiteDock onFeedbackClick={openFeedback} /> : null}
                {feedbackLoaded ? <FeedbackNote isOpen={feedbackOpen} onClose={closeFeedback} /> : null}
            </div>
        </div>
    );
}

