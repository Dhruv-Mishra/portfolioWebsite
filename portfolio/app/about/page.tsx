"use client";
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function About() {
    return (
        <div className="max-w-4xl mx-auto min-h-full flex flex-col justify-center py-16 pb-24 md:py-0 md:pb-0">
            <div className="relative transform -rotate-1">
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
                    className="relative min-h-[400px] text-gray-800 filter drop-shadow-[5px_5px_15px_rgba(0,0,0,0.2)]"
                    style={{ willChange: 'transform, opacity' }}
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

                        <div className="space-y-5 text-lg md:text-xl font-hand leading-relaxed">
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
                                            priority
                                            className="object-cover sepia-[.3] contrast-125"
                                        />
                                    </div>
                                </div>
                            </div>

                            <p>
                                Hey, I&apos;m <a href="https://www.linkedin.com/in/dhruv-mishra-id/" target="_blank" rel="noreferrer" className="link-hover font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-500">Dhruv</a> 👋
                            </p>
                            <p>
                                I&apos;m a <strong className="text-gray-900">Software Engineer at Microsoft</strong>, building and optimizing systems that need to be fast, reliable, and <span className="underline decoration-wavy decoration-yellow-500">boring</span> in production.
                            </p>
                            <p>
                                I work across <span className="bg-blue-100 px-1 rounded">Android</span>, <span className="bg-green-100 px-1 rounded">Full Stack</span>, and <span className="bg-purple-100 px-1 rounded">DevOps</span>—profiling cold starts, tuning UI pipelines, fixing scaling bottlenecks, and shaving real <strong className="text-emerald-700">milliseconds</strong> off systems used by millions.
                            </p>
                            <p>
                                I&apos;m fluent in <span className="font-bold text-orange-700">Kotlin</span>, <span className="font-bold text-blue-700">Java</span>, <span className="font-bold text-sky-600">TypeScript</span>, <span className="font-bold text-yellow-700">Python</span>, and <span className="font-bold text-cyan-700">C++</span>. I enjoy deep dives into performance, distributed systems, and infrastructure that quietly does its job well.
                            </p>
                            <p>
                                I&apos;m an active <span className="underline decoration-wavy decoration-rose-400">open source contributor</span>—from Microsoft&apos;s <a href="https://github.com/microsoft/fluentui-android" target="_blank" rel="noreferrer" className="link-hover text-blue-600 underline underline-offset-2 hover:text-blue-800">Fluent UI Android</a> to some <span className="bg-violet-100 px-1 rounded">Web3</span> projects. I love collaborating on work that pushes boundaries.
                            </p>
                            <p>
                                I graduated with <strong className="text-gray-900">Honors in CSAM</strong> from <a href="https://www.linkedin.com/in/dhruv-mishra-id/details/education/" target="_blank" rel="noreferrer" className="link-hover text-indigo-600 underline decoration-dashed underline-offset-2 hover:text-indigo-800">IIIT Delhi</a>, and spend time honing my skills through <a href="https://codeforces.com/profile/whoisDhruvMishra" target="_blank" rel="noreferrer" className="link-hover underline decoration-wavy decoration-emerald-500 text-emerald-700 hover:text-emerald-900">competitive programming</a>.
                            </p>
                            <p className="text-base md:text-lg text-gray-600 mt-4">
                                💬 Reach out: <a href="mailto:dhruvmishra.id@gmail.com" className="link-hover text-red-600 underline underline-offset-2 hover:text-red-800">dhruvmishra.id@gmail.com</a> • <a href="tel:+919599377944" className="link-hover text-green-600 underline underline-offset-2 hover:text-green-800">+91-9599377944</a>
                            </p>
                            <p className="text-base md:text-lg text-gray-600 mt-2 italic">
                                📄 For more details, check out my <a href="/resume" className="link-hover text-indigo-600 underline underline-offset-2 hover:text-indigo-800 font-semibold">resume</a>.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
