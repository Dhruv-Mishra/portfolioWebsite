"use client";
import React, { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

export default function SketchbookLayout({ children }: { children: React.ReactNode }) {
    const startX = 0;
    const startY = 0;
    const x = useMotionValue(startX);
    const y = useMotionValue(startY);

    // Smooth out the mouse movement
    const springX = useSpring(x, { stiffness: 50, damping: 20 });
    const springY = useSpring(y, { stiffness: 50, damping: 20 });

    // Parallax movement - Move opposite to mouse
    const xMove = useTransform(springX, [0, 1920], [20, -20]);
    const yMove = useTransform(springY, [0, 1080], [20, -20]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            x.set(e.clientX);
            y.set(e.clientY);
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [x, y]);

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
            <div className="flex-1 relative h-full flex flex-col">
                {/* Background Grid Pattern - Thicker and Larger */}
                <div className="absolute inset-0 pointer-events-none opacity-20 z-0"
                    style={{
                        backgroundSize: '100px 100px',
                        backgroundImage: `linear-gradient(to right, #9ca3af 1px, transparent 1px),
                                      linear-gradient(to bottom, #9ca3af 1px, transparent 1px)`
                    }}
                />

                {/* Global Doodles / Sprites Layer - Parallax Effect */}
                <motion.div
                    className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
                    style={{ x: xMove, y: yMove }}
                >
                    {/* Top Right: Lightbulb (Amber-ish) */}
                    <div className="absolute top-12 right-24 text-amber-900/20 rotate-12 transform scale-125">
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5a6 6 0 0 0-12 0c0 1.5.5 2.5 1.5 3.5.8.8 1.3 1.5 1.5 2.5" />
                            <path d="M9 18h6" />
                            <path d="M10 22h4" />
                        </svg>
                    </div>

                    {/* Top Left: Cloud (Blue-ish Grey) */}
                    <div className="absolute top-16 left-20 text-slate-600/20 -rotate-3">
                        <svg width="100" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.5 19c0-1.7-1.3-3-3-3h-1.1c-.1-2.6-2.2-4.7-4.8-4.7-2.3 0-4.3 1.7-4.7 3.9-.3-.1-.5-.2-.9-.2-2.2 0-4 1.8-4 4s1.8 4 4 4h14.5c1.4 0 2.5-1.1 2.5-2.5z" />
                        </svg>
                    </div>

                    {/* Top Center: Curly Arrow (Graphite) */}
                    <div className="absolute top-[18%] left-[45%] text-gray-800/30 -rotate-12">
                        <svg width="100" height="60" viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M10,50 Q40,10 90,30" />
                            <path d="M80,20 L90,30 L85,40" />
                        </svg>
                    </div>

                    {/* Middle Left: Pencil (Wood/Amber) */}
                    <div className="absolute top-1/3 left-8 text-amber-800/20 -rotate-45">
                        <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                        </svg>
                    </div>

                    {/* Center Right: Tic Tac Toe (Blue/Ink) */}
                    <div className="absolute top-[40%] right-[10%] text-indigo-900/15 rotate-6">
                        <svg width="80" height="80" viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M20,10 L20,50" />
                            <path d="M40,10 L40,50" />
                            <path d="M10,20 L50,20" />
                            <path d="M10,40 L50,40" />
                            <circle cx="28" cy="28" r="6" strokeWidth="3" opacity="0.6" />
                            <path d="M42,12 L52,22 M52,12 L42,22" strokeWidth="3" opacity="0.6" />
                        </svg>
                    </div>

                    {/* Center Left: Paperclip (Silver) */}
                    <div className="absolute top-[55%] left-[18%] text-gray-500/40 rotate-45">
                        <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                    </div>

                    {/* Bottom Center: Smiley (Dull Green) */}
                    <div className="absolute bottom-[25%] left-[45%] text-emerald-800/20 -rotate-12">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" />
                            <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                    </div>

                    {/* Bottom Left: Bug (Red) */}
                    <div className="absolute bottom-32 left-16 text-red-900/15 rotate-12">
                        <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m8 2 1.88 1.88" />
                            <path d="M14.12 3.88 16 2" />
                            <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                            <path d="M12 20v-9" />
                            <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
                            <path d="M6 13H2" />
                            <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
                            <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
                            <path d="M22 13h-4" />
                            <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
                        </svg>
                    </div>

                    {/* Floating Star (Yellow) */}
                    <div className="absolute bottom-[40%] right-[25%] text-yellow-700/20 rotate-12">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                    </div>

                    {/* New: Puzzle Piece */}
                    <div className="absolute top-[60%] right-[35%] text-stone-700/20 rotate-45">
                        <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M19.439 15.424c-.662.662-1.734.662-2.396 0l-1.018-1.018a3.388 3.388 0 0 0-4.792 4.792l1.018 1.018c.662.662.662 1.734 0 2.396a1.694 1.694 0 0 1-2.396 0L4.562 17.319a1.694 1.694 0 0 1 0-2.396c.662-.662 1.734-.662 2.396 0l1.018 1.018a3.388 3.388 0 0 0 4.792-4.792l-1.018-1.018c-.662-.662-.662-1.734 0-2.396a1.694 1.694 0 0 1 2.396 0l5.293 5.293a1.694 1.694 0 0 1 0 2.396z" />
                        </svg>
                    </div>

                    {/* New: Code Brackets (Top Left-Center) */}
                    <div className="absolute top-[25%] left-[25%] text-indigo-500/10 -rotate-6">
                        <svg width="60" height="40" viewBox="0 0 60 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 5 5 20 15 35" />
                            <polyline points="45 5 55 20 45 35" />
                            <line x1="40" y1="5" x2="20" y2="35" />
                        </svg>
                    </div>

                    {/* New: DNA / Spiral (Bottom Left-Center) */}
                    <div className="absolute bottom-[35%] left-[15%] text-pink-700/10 rotate-12">
                        <svg width="40" height="80" viewBox="0 0 40 80" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M10,0 Q30,20 10,40 Q-10,60 10,80" />
                            <path d="M30,0 Q10,20 30,40 Q50,60 30,80" />
                            <line x1="10" y1="10" x2="30" y2="10" />
                            <line x1="10" y1="30" x2="30" y2="30" />
                            <line x1="10" y1="50" x2="30" y2="50" />
                            <line x1="10" y1="70" x2="30" y2="70" />
                        </svg>
                    </div>

                    {/* New: Lightning Bolt (Right Edge Middle) */}
                    <div className="absolute top-[50%] right-[3%] text-yellow-600/15 -rotate-12">
                        <svg width="40" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                    </div>

                    {/* New: Paper Plane (Bottom Right) */}
                    <div className="absolute bottom-[15%] right-[10%] text-blue-800/15 -rotate-12">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 2L11 13" />
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                        </svg>
                    </div>

                    {/* New: Saturn / Planet (Bottom Right Corner) */}
                    <div className="absolute bottom-[5%] right-[5%] text-purple-900/15 rotate-12">
                        <svg width="70" height="50" viewBox="0 0 70 50" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="35" cy="25" r="15" />
                            <ellipse cx="35" cy="25" rx="30" ry="10" transform="rotate(-15 35 25)" />
                        </svg>
                    </div>

                    {/* New: Music Note (Bottom Right - slightly up) */}
                    <div className="absolute bottom-[25%] right-[5%] text-rose-700/15 rotate-6">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                        </svg>
                    </div>

                    {/* Removed Coffee Stain Halo as requested */}
                </motion.div>

                {/* Crease Shadow near spiral */}
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-500/10 to-transparent pointer-events-none z-20" />

                {/* Main Content Container */}
                <main className="relative z-10 w-full h-full perspective-[2000px]">
                    {children}
                </main>
            </div>
        </div>
    );
}
