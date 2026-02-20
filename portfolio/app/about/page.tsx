"use client";
import { m } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Thumbpin } from '@/components/DoodleIcons';
import { TAPE_STYLE_DECOR } from '@/lib/constants';

const ABOUT_CTA_TEXTS = [
    "Curious about my work? Ask me anything",
    "Want to know more? Let's chat",
    "Got questions? Pass me a note",
    "Wanna hear about my projects?",
    "Ask me about my tech stack",
    "Curious about Microsoft? Chat with me",
];

const CTA_TYPE_SPEED = 40;
const CTA_ERASE_SPEED = 25;
const CTA_PAUSE_MS = 2000;

export default function About() {
    const [ctaText, setCtaText] = useState('');
    const ctaIndexRef = useRef(0);

    const cycle = useCallback(() => {
        let cancelled = false;
        let timeout: ReturnType<typeof setTimeout>;
        const fullText = ABOUT_CTA_TEXTS[ctaIndexRef.current % ABOUT_CTA_TEXTS.length];
        let charIdx = 0;

        const typeNext = () => {
            if (cancelled) return;
            charIdx++;
            setCtaText(fullText.slice(0, charIdx));
            if (charIdx < fullText.length) {
                timeout = setTimeout(typeNext, CTA_TYPE_SPEED);
            } else {
                timeout = setTimeout(eraseNext, CTA_PAUSE_MS);
            }
        };

        const eraseNext = () => {
            if (cancelled) return;
            charIdx--;
            setCtaText(fullText.slice(0, charIdx));
            if (charIdx > 0) {
                timeout = setTimeout(eraseNext, CTA_ERASE_SPEED);
            } else {
                ctaIndexRef.current++;
                timeout = setTimeout(() => { if (!cancelled) cycle(); }, 300);
            }
        };

        typeNext();

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, []);

    useEffect(() => {
        let cleanupCycle: (() => void) | undefined;
        const timeout = setTimeout(() => {
            cleanupCycle = cycle();
        }, 1000);

        return () => {
            clearTimeout(timeout);
            cleanupCycle?.();
        };
    }, [cycle]);

    return (
        <div className="max-w-4xl mx-auto min-h-full flex flex-col justify-center py-16 pb-24 md:py-0 md:pb-0">
            <div className="relative transform -rotate-1">
                <m.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="relative min-h-[400px] text-gray-800 shadow-[5px_5px_15px_rgba(0,0,0,0.2)]"
                >
                    {/* Realistic Tape - Top Left (Outside Clipped Area) */}
                    <div
                        className="absolute -top-1 -left-6 w-24 md:w-32 h-10 shadow-sm z-20 -rotate-[8deg]"
                        style={TAPE_STYLE_DECOR}
                    />

                    {/* Realistic Thumbpin - Top Center (Outside Clipped Area) */}
                    <Thumbpin className="absolute -top-2 left-1/2 -translate-x-1/2 z-20" />

                    {/* Paper Content (Clipped) */}
                    <div
                        className="bg-[#fff9c4] p-6 md:p-12 w-full h-full relative"
                        style={{
                            clipPath: 'polygon(0% 0%, 100% 0%, 100% calc(100% - 30px), calc(100% - 30px) 100%, 0% 100%)'
                        }}
                    >
                        {/* Folded Corner Effect - Bottom Right */}
                        <div
                            className="absolute bottom-0 right-0 pointer-events-none w-[30px] h-[30px] md:w-[60px] md:h-[60px]"
                            style={{
                                background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.05) 50%)',
                            }}
                        />
                        <div
                            className="absolute bottom-0 right-0 pointer-events-none w-[30px] h-[30px] md:w-[60px] md:h-[60px]"
                            style={{
                                backgroundColor: '#f0e6a0',
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
                                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-8 shadow-sm z-30 -rotate-1"
                                        style={TAPE_STYLE_DECOR}
                                    />
                                    <div className="w-40 h-40 md:w-48 md:h-48 bg-gray-200 relative overflow-hidden">
                                        <Image
                                            src="/resources/aboutPhoto.webp"
                                            alt="Dhruv Mishra - Software Engineer at Microsoft"
                                            fill
                                            sizes="192px"
                                            loading="eager"
                                            className="object-cover sepia-[.3]"
                                        />
                                    </div>
                                </div>
                            </div>

                            <p>
                                Hey, I&apos;m <a href="https://www.linkedin.com/in/dhruv-mishra-id/" target="_blank" rel="noreferrer" className="font-bold bg-indigo-200 hover:bg-indigo-300 px-1.5 py-0.5 rounded text-indigo-800 transition-[background-color,transform] inline-block hover:-rotate-2">Dhruv</a> 👋
                            </p>
                            <p>
                                I&apos;m a <strong className="text-gray-900">Software Engineer at Microsoft</strong> on the M365 Shell Team, building and optimizing systems that need to be fast, reliable, and <span className="italic">boring</span> in production.
                            </p>
                            <p>
                                Our Shell service handles <span className="underline decoration-wavy decoration-blue-400">identity and user data</span> at massive scale — <strong className="text-emerald-700">7 billion+ hits per day</strong>. I work with <span className="underline decoration-wavy decoration-green-400">C++ and C#</span> on enterprise encryption flows, cutting infrastructure costs and driving <span className="underline decoration-wavy decoration-purple-400">AI workflow adoption</span> across the service.
                            </p>
                            <p>
                                I&apos;m fluent in <span className="font-bold text-cyan-700">C++</span>, <span className="font-bold text-blue-700">C#</span>, <span className="font-bold text-sky-600">TypeScript</span>, <span className="font-bold text-yellow-700">Python</span>, and <span className="font-bold text-orange-700">Java</span>. Previously worked on <a href="https://github.com/microsoft/fluentui-android" target="_blank" rel="noreferrer" className="bg-blue-200 hover:bg-blue-300 px-1.5 py-0.5 rounded text-blue-800 transition-[background-color,transform] inline-block hover:-rotate-2">Fluent UI Android</a> (Kotlin/Compose). I enjoy deep dives into performance, distributed systems, and infrastructure that quietly does its job well.
                            </p>
                            <p>
                                I&apos;m an active <span className="underline decoration-wavy decoration-rose-400">open source contributor</span> and love collaborating on work that pushes boundaries. Outside code, I&apos;m into <span className="italic">strength training</span>, <span className="italic">PC overclocking</span>, <span className="italic">chess</span>, and following the latest in <span className="italic">AI and longevity research</span>.
                            </p>
                            <p>
                                I graduated with <strong className="text-gray-900">Honors in CSAM</strong> from <a href="https://www.linkedin.com/in/dhruv-mishra-id/details/education/" target="_blank" rel="noreferrer" className="bg-indigo-200 hover:bg-indigo-300 px-1.5 py-0.5 rounded text-indigo-800 transition-[background-color,transform] inline-block hover:-rotate-2">IIIT Delhi</a>, and spend time honing my skills through <a href="https://codeforces.com/profile/whoisDhruvMishra" target="_blank" rel="noreferrer" className="bg-emerald-200 hover:bg-emerald-300 px-1.5 py-0.5 rounded text-emerald-800 transition-[background-color,transform] inline-block hover:-rotate-2">competitive programming</a>.
                            </p>
                            <p className="text-base md:text-lg text-gray-600 mt-4">
                                💬 Reach out: <a href="mailto:dhruvmishra.id@gmail.com" className="bg-red-200 hover:bg-red-300 px-1.5 py-0.5 rounded text-red-800 transition-[background-color,transform] inline-block hover:-rotate-2">dhruvmishra.id@gmail.com</a> • <a href="tel:+919599377944" className="bg-green-200 hover:bg-green-300 px-1.5 py-0.5 rounded text-green-800 transition-[background-color,transform] inline-block hover:-rotate-2">+91-9599377944</a>
                            </p>
                            <p className="text-base md:text-lg text-gray-600 mt-2 italic">
                                📄 For more details, check out my <a href="/resume" className="bg-indigo-200 hover:bg-indigo-300 px-1.5 py-0.5 rounded text-indigo-800 font-semibold not-italic transition-[background-color,transform] inline-block hover:-rotate-2">resume</a>.
                            </p>
                        </div>

                        {/* Typewriter CTA to chat */}
                        <div className="mt-8 pt-4 border-t-2 border-gray-400/20">
                            <Link href="/chat" className="group block">
                                <div className="flex items-start gap-3">
                                    {/* Doodle chat icon */}
                                    <div className="shrink-0 mt-1 text-gray-400 group-hover:text-indigo-600 transition-colors">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                            <path d="M8 10h.01" opacity="0.6" />
                                            <path d="M12 10h.01" opacity="0.6" />
                                            <path d="M16 10h.01" opacity="0.6" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="font-hand text-lg md:text-xl text-gray-500 group-hover:text-indigo-700 transition-colors">
                                            <span>{ctaText}</span>
                                            <span className="inline-block w-[2px] h-[1.1em] bg-gray-400 group-hover:bg-indigo-600 ml-0.5 align-middle animate-pulse" />
                                        </p>
                                        <p className="font-hand text-sm text-gray-400 group-hover:text-indigo-500 transition-colors mt-1">
                                            Chat with me — I&apos;ll pass you a note back ✏️
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </div>
                </m.div>
            </div>
        </div>
    );
}
