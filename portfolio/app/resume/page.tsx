"use client";

import { useIsMobile } from '@/hooks/useIsMobile';
import { useState } from 'react';

export default function ResumePage() {
    const isMobile = useIsMobile();
    const [isInteractive, setIsInteractive] = useState(false);

    return (
        <main className="min-h-screen pt-8 pb-4 px-4 md:px-12 flex flex-col items-center justify-center relative z-10 box-border">
            {/* The Resume "Paper" - CSS animation instead of framer-motion */}
            <div
                className="relative w-full max-w-5xl bg-white shadow-2xl p-[1px] animate-page-card-in note-tilt"
                style={{
                    height: '92vh',
                    ['--note-rotate' as string]: '-1deg',
                    boxShadow: '1px 1px 5px rgba(0,0,0,0.1), 10px 10px 30px rgba(0,0,0,0.15)',
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
                                title="Click to enable PDF interaction"
                            />
                        )}

                        <object
                            data="/resources/resume.pdf#toolbar=0&navpanes=0&view=FitV"
                            type="application/pdf"
                            className="w-full h-full block"
                        >
                            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center text-gray-600 font-hand text-xl bg-orange-50/50">
                                <p>Unable to embed PDF.</p>
                                <a
                                    href="/resources/resume.pdf"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-6 py-2 bg-[#2d2a2e] text-white rounded-lg shadow-md hover:scale-105 transition-transform"
                                >
                                    Open PDF
                                </a>
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
            </div>
        </main>
    );
}
