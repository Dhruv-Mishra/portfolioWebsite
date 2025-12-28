"use client";
import React from 'react';
import { motion } from 'framer-motion';

export default function About() {
    return (
        <div className="max-w-4xl mx-auto h-full flex flex-col justify-center">
            <div className="relative transform -rotate-1">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-[#fff9c4] p-6 md:p-12 shadow-[5px_5px_15px_rgba(0,0,0,0.2)] text-gray-800 relative min-h-[400px]"
                    style={{
                        clipPath: 'polygon(0% 0%, 100% 0%, 100% calc(100% - 60px), calc(100% - 60px) 100%, 0% 100%)'
                    }}
                >
                    {/* Folded Corner Effect - Bottom Right */}
                    <div
                        className="absolute bottom-0 right-0 pointer-events-none drop-shadow-md"
                        style={{
                            width: 60,
                            height: 60,
                            backgroundColor: 'rgba(0,0,0,0.1)',
                            background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.05) 50%)',
                        }}
                    />
                    <div
                        className="absolute bottom-0 right-0 pointer-events-none"
                        style={{
                            width: 60,
                            height: 60,
                            backgroundColor: '#fffae5', // Slightly darker than paper
                            filter: 'brightness(0.95)',
                            clipPath: 'polygon(0 0, 0 100%, 100% 0)'
                        }}
                    />

                    {/* Realistic Tape - Top Left */}
                    <div
                        className="absolute -top-3 -left-2 w-24 md:w-32 h-10 bg-white/40 shadow-sm backdrop-blur-[1px] z-10 -rotate-[8deg]"
                        style={{
                            maskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                            WebkitMaskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                            clipPath: 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)'
                        }}
                    />

                    {/* Realistic Thumbpin - Top Center (Top View) */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none drop-shadow-xl">
                        <svg width="60" height="60" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Paper Indent/Shadow */}
                            <ellipse cx="25" cy="28" rx="6" ry="3" fill="black" fillOpacity="0.2" filter="blur(2px)" />

                            {/* Pin Head - Red Plastic Top View */}
                            <circle cx="25" cy="25" r="12" fill="#dc2626" /> {/* Dark Red Base */}
                            <circle cx="25" cy="25" r="11" fill="url(#pin-shine-top)" /> {/* Gradient Shine */}
                            <circle cx="25" cy="25" r="12" stroke="#991b1b" strokeWidth="1" strokeOpacity="0.5" /> {/* Border */}

                            {/* Center metal cap/dimple */}
                            <circle cx="25" cy="25" r="4" fill="#b91c1c" />
                            <circle cx="25" cy="25" r="3" fill="#ef4444" />

                            {/* Glossy Highlight */}
                            <path d="M25 16 A 9 9 0 0 1 32 20" stroke="white" strokeWidth="2" strokeOpacity="0.4" strokeLinecap="round" />
                            <circle cx="20" cy="20" r="2" fill="white" fillOpacity="0.5" filter="blur(1px)" />

                            <defs>
                                <radialGradient id="pin-shine-top" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(20 18) rotate(45) scale(18)">
                                    <stop stopColor="#fca5a5" />
                                    <stop offset="1" stopColor="#b91c1c" />
                                </radialGradient>
                            </defs>
                        </svg>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-hand font-bold mb-6 text-gray-900 border-b-2 border-gray-400/30 pb-2">
                        About Me
                    </h1>

                    <div className="space-y-6 text-xl md:text-2xl font-hand leading-relaxed">
                        <p>
                            Hey! I&apos;m <strong className="text-indigo-700">Dhruv Mishra</strong>.
                            I&apos;m a software developer with a strong foundation in <span className="underline decoration-wavy decoration-yellow-500">Competitive Programming</span> and Algorithms.
                        </p>
                        <p>
                            I specialize in building frontend experiences that feel <span className="underline decoration-wavy decoration-emerald-500">organic</span> yet perform fast.
                        </p>
                        <p>
                            When I&apos;m not coding, I&apos;m probably sketching ideas on actual paper or debugging my coffee machine.
                        </p>
                    </div>

                    <div className="mt-8 flex gap-4">
                        <div className="bg-white p-2 shadow-sm rotate-3 border border-gray-200">
                            <div className="w-24 h-24 bg-gray-200 flex items-center justify-center text-xs font-mono text-gray-400">
                                [PHOTO]
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
