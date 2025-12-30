"use client";
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function About() {
    return (
        <div className="max-w-4xl mx-auto h-full flex flex-col justify-center">
            <div className="relative transform -rotate-1">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative min-h-[400px] text-gray-800 filter drop-shadow-[5px_5px_15px_rgba(0,0,0,0.2)]"
                >
                    {/* Realistic Tape - Top Left (Outside Clipped Area) */}
                    <div
                        className="absolute -top-1 -left-6 w-24 md:w-32 h-10 bg-white/80 shadow-sm backdrop-blur-[1px] z-20 -rotate-[8deg]"
                        style={{
                            maskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                            WebkitMaskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                            clipPath: 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)'
                        }}
                    />

                    {/* Realistic Thumbpin - Top Center (Outside Clipped Area) */}
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

                    {/* Paper Content (Clipped) */}
                    <div
                        className="bg-[#fff9c4] p-6 md:p-12 w-full h-full relative"
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

                        <h1 className="text-4xl md:text-5xl font-hand font-bold mb-6 text-gray-900 border-b-2 border-gray-400/30 pb-2">
                            About Me
                        </h1>

                        <div className="space-y-6 text-xl md:text-2xl font-hand leading-relaxed">
                            {/* Pinned Photo - Floated Right */}
                            <div className="float-right ml-6 mb-2 mt-2 relative transform rotate-3 hidden md:block z-20">
                                <div className="bg-white p-2 shadow-md border border-gray-200 relative">
                                    {/* Tape */}
                                    <div
                                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-8 bg-white/80 shadow-sm backdrop-blur-[1px] z-30 -rotate-1 border-l border-r border-white/10"
                                        style={{
                                            maskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)',
                                            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)',
                                        }}
                                    />
                                    <div className="w-40 h-40 md:w-48 md:h-48 bg-gray-200 relative overflow-hidden">
                                        <Image
                                            src="/resources/aboutPhoto.webp"
                                            alt="Dhruv Mishra - Software Engineer at Microsoft"
                                            fill
                                            sizes="(max-width: 768px) 160px, 192px"
                                            quality={85}
                                            priority
                                            className="object-cover sepia-[.3] contrast-125"
                                        />
                                    </div>
                                </div>
                            </div>

                            <p>
                                Hey, I&apos;m <strong className="text-indigo-700">Dhruv</strong> 👋
                            </p>
                            <p>
                                I build and optimize software systems that need to be fast, reliable, and <span className="underline decoration-wavy decoration-yellow-500">boring</span> in production.
                            </p>
                            <p>
                                I&apos;m a <strong className="text-gray-900">Software Engineer at Microsoft</strong>, working across Android and backend platforms used by millions—profiling cold starts, tuning UI pipelines, fixing scaling bottlenecks, and shaving real milliseconds (and dollars) off large systems. I enjoy deep dives into performance, distributed systems, and infrastructure that quietly does its job well.
                            </p>
                            <p>
                                I come from a strong CS background, spend time with <span className="underline decoration-wavy decoration-emerald-500">competitive programming</span>, and like turning complex technical problems into clean, production-ready solutions.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
