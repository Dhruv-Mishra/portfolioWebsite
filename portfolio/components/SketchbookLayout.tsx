"use client";
import { motion, useSpring, useTransform } from 'framer-motion';
import {
    LightbulbDoodle, PencilDoodle, StarDoodle,
    BugDoodle, PaperPlaneDoodle, SaturnDoodle,
    CloudDoodle, SmileyDoodle, LightningDoodle
} from './SketchbookDoodles';
import { PAPER_NOISE_SVG } from '@/lib/assets';
import SocialSidebar from './SocialSidebar';
import { useMousePosition } from '@/hooks/useMousePosition';
import { ThemeToggle } from './ThemeToggle';

export default function SketchbookLayout({ children }: { children: React.ReactNode }) {
    const { x, y } = useMousePosition();

    // Smooth out the mouse movement
    const springX = useSpring(x, { stiffness: 50, damping: 20 });
    const springY = useSpring(y, { stiffness: 50, damping: 20 });

    // Parallax movement - Optimized to be responsive-agnostic by using larger input ranges
    // but clamping visually.
    const xMove = useTransform(springX, [0, 4000], [20, -20]);
    const yMove = useTransform(springY, [0, 4000], [20, -20]);

    return (
        <div className="h-[100dvh] w-screen bg-paper transition-colors duration-500 relative flex overflow-hidden">
            {/* Skip to main content for accessibility */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-md"
            >
                Skip to main content
            </a>

            {/* Spiral Binding - Fixed to Left */}
            <div className="w-12 md:w-16 h-full bg-spiral-bg border-r border-spiral-border flex flex-col justify-evenly items-center shadow-[inset_-5px_0_15px_rgba(0,0,0,0.1)] z-30 relative shrink-0 transition-colors duration-500">
                {/* Holes and Rings */}
                {[...Array(12)].map((_, i) => (
                    <div key={i} className="relative w-full flex justify-center">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 absolute -left-4 top-1/2 -translate-y-1/2 shadow-sm" /> {/* Ring */}
                        <div className="w-3 h-3 rounded-full bg-gray-800/80 shadow-inner" /> {/* Hole */}
                    </div>
                ))}
            </div>

            {/* Paper Content Area */}
            <div className="flex-1 relative h-full flex flex-col isolation-auto">
                {/* Theme Toggle - Bottom Left (Paper Corner) */}
                <div className="absolute bottom-6 left-6 z-50">
                    <ThemeToggle />
                </div>

                {/* Paper Texture Noise Overlay */}
                {/* Paper Texture Noise Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-[1] mix-blend-multiply"
                    style={{
                        backgroundImage: PAPER_NOISE_SVG
                    }}
                />

                {/* Background Grid Pattern - Thicker and Larger */}
                <div className="absolute inset-0 pointer-events-none opacity-20 z-0"
                    style={{
                        backgroundSize: '100px 100px',
                        backgroundImage: `linear-gradient(to right, #9ca3af 1px, transparent 1px),
                                      linear-gradient(to bottom, #9ca3af 1px, transparent 1px)`
                    }}
                />

                {/* School Notebook Margin Line (Red) - [REMOVED] */}

                {/* Global Doodles - 9 doodles for ambience */}
                <motion.div
                    className="absolute inset-0 pointer-events-none z-0 overflow-hidden will-change-transform"
                    style={{ x: xMove, y: yMove }}
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
                </motion.div>

                {/* Crease Shadow near spiral */}
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-500/10 to-transparent pointer-events-none z-20" />

                {/* Main Content Container */}
                <main
                    id="main-content"
                    role="main"
                    className="relative z-10 w-full h-full perspective-[2000px] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-400/30 scrollbar-track-transparent"
                    tabIndex={-1}
                >
                    {children}
                </main>

                <SocialSidebar />
            </div>
        </div>
    );
}

