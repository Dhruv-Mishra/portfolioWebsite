"use client";
import { useState, useEffect, useCallback } from 'react';
import {
    LightbulbDoodle, PencilDoodle, StarDoodle,
    BugDoodle, PaperPlaneDoodle, SaturnDoodle,
    CloudDoodle, SmileyDoodle, LightningDoodle
} from './SketchbookDoodles';
import { PAPER_NOISE_SVG } from '@/lib/assets';
import { GRID_PATTERN } from '@/lib/designTokens';
import SocialSidebar from './SocialSidebar';
import { ThemeToggle } from './ThemeToggle';
import { useIsMobile } from '@/hooks/useIsMobile';
import FeedbackNote, { FeedbackTab } from './FeedbackNote';

/** Hoisted paper noise overlay style — avoids re-allocation per render */
const PAPER_NOISE_STYLE = {
    backgroundImage: PAPER_NOISE_SVG,
    contain: 'strict',
} as const;

/** Stitched binding — repeating dash pattern that looks like hand-sewn thread */
const BINDING_STITCH_STYLE = {
    backgroundImage: `repeating-linear-gradient(
        to bottom,
        transparent,
        transparent 14px,
        var(--c-binding-stitch) 14px,
        var(--c-binding-stitch) 20px
    )`,
    backgroundPosition: 'center',
    backgroundSize: '2px 100%',
    backgroundRepeat: 'repeat-y',
} as const;

/** Hoisted grid pattern background style — avoids re-allocation per render */
const GRID_PATTERN_STYLE = {
    backgroundSize: GRID_PATTERN.backgroundSize,
    backgroundImage: `linear-gradient(to right, ${GRID_PATTERN.lineColor} ${GRID_PATTERN.lineWidth}, transparent ${GRID_PATTERN.lineWidth}),
                      linear-gradient(to bottom, ${GRID_PATTERN.lineColor} ${GRID_PATTERN.lineWidth}, transparent ${GRID_PATTERN.lineWidth})`,
    contain: 'strict',
    willChange: 'auto',
} as const;

export default function SketchbookLayout({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    // Listen for 'open-feedback' custom event (from terminal command)
    const openFeedback = useCallback(() => setFeedbackOpen(true), []);
    const closeFeedback = useCallback(() => setFeedbackOpen(false), []);
    useEffect(() => {
        window.addEventListener('open-feedback', openFeedback);
        return () => window.removeEventListener('open-feedback', openFeedback);
    }, [openFeedback]);

    return (
        <div className="h-[100dvh] w-screen bg-paper transition-colors duration-500 relative flex overflow-hidden">
            {/* Skip to main content for accessibility */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-md"
            >
                Skip to main content
            </a>

            {/* Stitched Binding — thin journal spine with CSS stitch pattern */}
            <div
                className="w-[var(--c-binding-w)] md:w-[var(--c-binding-w-md)] h-full bg-binding-bg border-r border-binding-border shrink-0 z-30 relative transition-colors duration-500"
                style={BINDING_STITCH_STYLE}
                aria-hidden="true"
            />

            {/* Paper Content Area */}
            <div className="flex-1 relative h-full flex flex-col isolation-auto">
                {/* Theme Toggle - Bottom Left (Desktop only, mobile uses social bar) */}
                <div className="hidden md:block absolute bottom-6 left-6 z-50">
                    <ThemeToggle />
                </div>

                {/* Paper Texture Noise Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-[1]"
                    style={PAPER_NOISE_STYLE}
                />

                {/* Background Grid Pattern - Thicker and Larger */}
                <div className="absolute inset-0 pointer-events-none opacity-20 z-0"
                    style={GRID_PATTERN_STYLE}
                />

                {/* School Notebook Margin Line (Red) - [REMOVED] */}

                {/* Global Doodles (static — parallax removed for performance) */}
                {!isMobile && (
                    <div
                        className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
                        aria-hidden="true"
                    >
                        <LightbulbDoodle />
                        <CloudDoodle />
                        <PencilDoodle />
                        <StarDoodle />
                        <BugDoodle />
                        <SmileyDoodle />
                        <LightningDoodle />
                        <PaperPlaneDoodle />
                        <SaturnDoodle />
                    </div>
                )}

                {/* Crease Shadow near spiral — width derived from --c-spiral-w */}
                <div className="absolute left-0 top-0 bottom-0 w-[var(--c-crease-w)] md:w-[var(--c-crease-w-md)] bg-gradient-to-r from-gray-500/10 to-transparent pointer-events-none z-20" />

                {/* Main Content Container */}
                <main
                    id="main-content"
                    role="main"
                    className="relative z-10 w-full h-full perspective-[2000px] overflow-y-auto overflow-x-hidden ruler-scrollbar"
                    tabIndex={-1}
                >
                    {children}
                </main>

                <SocialSidebar onFeedbackClick={openFeedback} />

                {/* Feedback icon (floating bottom-right) + modal */}
                <FeedbackTab onClick={openFeedback} />
                <FeedbackNote isOpen={feedbackOpen} onClose={closeFeedback} />
            </div>
        </div>
    );
}

