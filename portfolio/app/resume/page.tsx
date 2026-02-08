"use client";

import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useState } from 'react';

export default function ResumePage() {
    const isMobile = useIsMobile();
    const [isInteractive, setIsInteractive] = useState(false);

    return (
        <main className="min-h-screen pt-8 pb-4 px-4 md:px-12 flex flex-col items-center justify-center relative z-10 box-border">
            {/* The Resume "Paper" */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                whileHover={{
                    scale: 1.01,
                    rotate: 1,
                    transition: { duration: 0.15 }
                }}
                className="relative w-full max-w-5xl bg-white shadow-2xl p-[1px]"
                style={{
                    height: '92vh',
                    transform: 'rotate(-1deg)',
                    boxShadow: '1px 1px 5px rgba(0,0,0,0.1), 10px 10px 30px rgba(0,0,0,0.15)'
                }}
            >
                {/* Tape - Top Left */}
                <div className="absolute -top-3 -left-8 w-32 h-8 bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm transform -rotate-[25deg] z-20 pointer-events-none" />

                {/* Tape - Top Right */}
                <div className="absolute -top-4 -right-8 w-32 h-8 bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm transform rotate-[20deg] z-20 pointer-events-none" />

                {/* Tape - Bottom Center */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-40 h-10 bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm transform rotate-[2deg] z-20 pointer-events-none" />

                <div className="w-full h-full bg-white relative z-10 overflow-hidden">
                    {/* 
                         #toolbar=0 hides the toolbar
                         #navpanes=0 hides the side navigation
                         #scrollbar=1 ensures scrollbars work if needed
                         #view=FitV fits the whole page vertically
                     */}
                    <div
                        className="w-full h-full relative"
                        onMouseEnter={() => {
                            if (isInteractive || isMobile) {
                                window.dispatchEvent(new CustomEvent('sketchbook:hideCursor'));
                            }
                        }}
                        onMouseLeave={() => {
                            window.dispatchEvent(new CustomEvent('sketchbook:showCursor'));
                        }}
                    >
                        {/* Static Overlay - Desktop Only, prevents scrollbars from stealing cursor unless enabled */}
                        {!isInteractive && !isMobile && (
                            <div
                                className="absolute inset-0 z-20 cursor-none"
                                onClick={() => setIsInteractive(true)}
                                role="button"
                                tabIndex={0}
                                aria-label="Click to enable PDF interaction"
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsInteractive(true); }}
                                title="Click to enable PDF interaction"
                            />
                        )}

                        <object
                            data="/resources/resume.pdf#toolbar=0&navpanes=0&view=FitV"
                            type="application/pdf"
                            className="w-full h-full block"
                        >
                            <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center bg-orange-50/50">
                                <div className="max-w-md">
                                    <p className="text-xl font-hand text-gray-800 mb-2">View Resume</p>
                                    <p className="text-sm font-code text-gray-500 mb-6">
                                        Your browser doesn&apos;t support inline PDF viewing. No worries!
                                    </p>
                                    <a
                                        href="/resources/resume.pdf"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download="Dhruv_Mishra_Resume.pdf"
                                        aria-label="Download Dhruv Mishra's Resume (PDF)"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--c-ink)] text-[var(--c-paper)] rounded-lg shadow-lg hover:scale-105 transition-transform font-bold tracking-wide group"
                                    >
                                        <span>Download Resume</span>
                                        <svg className="w-5 h-5 group-hover:translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                    </a>
                                </div>
                            </div>
                        </object>
                    </div>

                    {/* External Link Overlay - Left on mobile, Right on desktop */}
                    <a
                        href="/resources/resume.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2 left-2 md:top-4 md:left-auto md:right-4 z-30 group"
                        title="Open PDF in new tab"
                    >
                        <div className="bg-yellow-100 text-gray-800 px-3 py-1.5 md:px-5 md:py-2.5 rounded-lg shadow-lg border border-yellow-200/50 transform -rotate-2 group-hover:rotate-0 group-hover:scale-105 transition-all font-hand font-bold flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
                            <span>Open PDF</span>
                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </div>
                    </a>
                </div>
            </motion.div>
        </main>
    );
}
