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
                <div className="absolute -top-3 -left-8 w-32 h-8 bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm transform -rotate-[25deg] z-20 pointer-events-none" />

                {/* Tape - Top Right */}
                <div className="absolute -top-4 -right-8 w-32 h-8 bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm transform rotate-[20deg] z-20 pointer-events-none" />

                {/* Tape - Bottom Center */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-40 h-10 bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm transform rotate-[2deg] z-20 pointer-events-none" />

                <div className="w-full h-full bg-white relative z-10 overflow-hidden">
                    {/* 
                         #toolbar=0 hides the toolbar
                         #navpanes=0 hides the side navigation
                         #scrollbar=0 hides scrollbars
                         #view=FitV fits the whole page vertically
                     */}
                    {/* Desktop View: Embedded PDF */}
                    <div className="hidden md:block w-full h-full">
                        <object
                            data="/resources/resume.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitV"
                            type="application/pdf"
                            className="w-full h-full block pointer-events-none"
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

                    {/* Mobile View: Direct Link Card */}
                    <div className="md:hidden w-full h-full flex flex-col items-center justify-center gap-6 p-6 text-center bg-orange-50/10">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-3xl shadow-inner">
                            📄
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-hand text-2xl font-bold text-gray-800">Resume.pdf</h3>
                            <p className="font-hand text-lg text-gray-600">Tap to view the full document</p>
                        </div>
                        <a
                            href="/resources/resume.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-8 py-3 bg-[var(--c-ink)] text-[var(--c-paper)] rounded-full font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2"
                        >
                            Open Resume <span className="text-xl">↗</span>
                        </a>
                    </div>

                    {/* External Link Overlay (Since PDF is non-interactive) */}
                    <a
                        href="/resources/resume.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-4 right-4 z-30 group"
                        title="Open PDF in new tab"
                    >
                        <div className="bg-yellow-100 text-gray-800 px-4 py-2 rounded-sm shadow-md border border-yellow-200/50 transform -rotate-2 group-hover:rotate-0 transition-transform font-hand font-bold flex items-center gap-2 text-sm">
                            <span>Open PDF</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </div>
                    </a>
                </div>
            </motion.div>
        </main>
    );
}
