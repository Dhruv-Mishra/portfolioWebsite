"use client";
import React, { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
    LightbulbDoodle, CloudDoodle, CurlyArrowDoodle, PencilDoodle,
    TicTacToeDoodle, PaperclipDoodle, SmileyDoodle, BugDoodle, StarDoodle,
    PuzzleDoodle, BracketsDoodle, DnaDoodle, LightningDoodle,
    PaperPlaneDoodle, SaturnDoodle, MusicNoteDoodle
} from './SketchbookDoodles';
import { PAPER_NOISE_SVG } from '@/lib/assets';
import SocialSidebar from './SocialSidebar';
import { useMousePosition } from '@/hooks/useMousePosition';

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
        <div className="h-screen w-screen bg-[#FDFBF7] relative flex overflow-hidden">
            {/* Spiral Binding - Fixed to Left */}
            <div className="w-12 md:w-16 h-full bg-[#f0f0f0] border-r border-gray-300 flex flex-col justify-evenly items-center shadow-[inset_-5px_0_15px_rgba(0,0,0,0.1)] z-30 relative shrink-0">
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

                {/* School Notebook Margin Line (Red) - Responsive positioning */}
                <div className="absolute top-0 bottom-0 left-6 md:left-24 w-[2px] bg-red-400/30 z-0 pointer-events-none" />
                <div className="absolute top-0 bottom-0 left-[26px] md:left-[98px] w-[1px] bg-red-400/10 z-0 pointer-events-none" /> {/* Double line effect */}

                {/* Global Doodles / Sprites Layer - Parallax Effect */}
                <motion.div
                    className="absolute inset-0 pointer-events-none z-0 overflow-hidden will-change-transform"
                    style={{ x: xMove, y: yMove }}
                    aria-hidden="true"
                >
                    <LightbulbDoodle />
                    <CloudDoodle />
                    <CurlyArrowDoodle />
                    <PencilDoodle />
                    <TicTacToeDoodle />
                    <PaperclipDoodle />
                    <SmileyDoodle />
                    <BugDoodle />
                    <StarDoodle />
                    <PuzzleDoodle />
                    <BracketsDoodle />
                    <DnaDoodle />
                    <LightningDoodle />
                    <PaperPlaneDoodle />
                    <SaturnDoodle />
                    <MusicNoteDoodle />
                </motion.div>

                {/* Crease Shadow near spiral */}
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-500/10 to-transparent pointer-events-none z-20" />

                {/* Main Content Container */}
                <main className="relative z-10 w-full h-full perspective-[2000px]">
                    {children}
                </main>

                <SocialSidebar />
            </div>
        </div>
    );
}

