"use client";

import React from 'react';
import { motion } from 'framer-motion';

export default function ResumePage() {
    return (
        <main className="min-h-screen pt-8 pb-4 px-4 md:px-12 flex flex-col items-center justify-center relative z-10 box-border">
            {/* The Resume "Paper" */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, rotate: 1 }}
                animate={{ opacity: 1, scale: 1, rotate: -1 }}
                transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
                className="relative w-full max-w-5xl bg-white shadow-2xl p-[1px]"
                style={{
                    height: '92vh',
                    boxShadow: '1px 1px 5px rgba(0,0,0,0.1), 10px 10px 30px rgba(0,0,0,0.15)'
                }}
            >
                {/* Tape - Top Left */}
                <div className="absolute -top-3 -left-8 w-32 h-8 bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm transform -rotate-[25deg] z-20 pointer-events-none" />

                {/* Tape - Top Right */}
                <div className="absolute -top-4 -right-8 w-32 h-8 bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm transform rotate-[20deg] z-20 pointer-events-none" />

                {/* Tape - Bottom Center */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-40 h-10 bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm transform rotate-[2deg] z-20 pointer-events-none" />

                <div className="w-full h-full bg-white relative z-10 overflow-hidden">
                    {/* 
                         #toolbar=0 hides the toolbar
                         #navpanes=0 hides the side navigation
                         #scrollbar=0 hides scrollbars (though internal scrolling might still happen)
                         #view=FitV fits the whole page vertically
                     */}
                    <object
                        data="/resume.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV"
                        type="application/pdf"
                        className="w-full h-full block"
                    >
                        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center text-gray-600 font-hand text-xl bg-orange-50/50">
                            <p>Ah, the classic "Browser doesn't like PDFs" issue.</p>
                            <a
                                href="/resume.pdf"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-6 py-2 bg-[#2d2a2e] text-white rounded-lg shadow-md hover:scale-105 transition-transform"
                            >
                                Open PDF in New Tab
                            </a>
                        </div>
                    </object>
                </div>
            </motion.div>
        </main>
    );
}
