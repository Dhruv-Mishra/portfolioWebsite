import Image from 'next/image';
import Link from 'next/link';
import { Thumbpin } from '@/components/DoodleIcons';
import ExperienceTimeline from '@/components/ExperienceTimeline';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { GRADIENT_TOKENS } from '@/lib/designTokens';
import { experienceTimelineEntries } from '@/lib/experienceTimeline';
import { PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';

export const revalidate = 3600;

export default function About() {
    return (
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-3 py-6 pb-16 sm:px-4 md:px-0 md:py-10 md:pb-16">
            <div className="relative mx-auto w-full max-w-4xl md:transform md:-rotate-1">
                <div className="animate-page-sheet relative min-h-[400px] text-gray-800 shadow-[5px_5px_15px_rgba(0,0,0,0.2)]">
                    {/* Realistic Tape - Top Left (Outside Clipped Area) */}
                    <div
                        className="absolute -top-1 left-3 w-24 h-10 shadow-sm z-20 -rotate-[8deg] md:-left-6 md:w-32"
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
                            className="absolute bottom-0 right-0 pointer-events-none w-[var(--c-corner-fold)] h-[var(--c-corner-fold)] md:w-[var(--c-corner-fold-md)] md:h-[var(--c-corner-fold-md)]"
                            style={{
                                background: GRADIENT_TOKENS.foldCorner,
                            }}
                        />
                        <div
                            className="absolute bottom-0 right-0 pointer-events-none w-[var(--c-corner-fold)] h-[var(--c-corner-fold)] md:w-[var(--c-corner-fold-md)] md:h-[var(--c-corner-fold-md)]"
                            style={{
                                backgroundColor: GRADIENT_TOKENS.foldUnderside,
                                clipPath: 'polygon(0 0, 0 100%, 100% 0)'
                            }}
                        />

                        <h1 className="text-3xl sm:text-4xl md:text-5xl font-hand font-bold mb-6 text-gray-900 border-b-2 border-gray-400/30 pb-2">
                            About Me
                        </h1>

                        <div className="space-y-4 text-base font-hand leading-relaxed sm:text-lg md:space-y-5 md:text-xl">
                            {/* Pinned Photo — stacks first on mobile, then floats into the sheet on desktop */}
                            <div className="relative z-20 mx-auto mb-5 mt-1 w-fit rotate-1 md:float-right md:mx-0 md:mb-2 md:ml-6 md:mt-2 md:rotate-3">
                                <div className="bg-white p-1 md:p-2 shadow-md border border-gray-200 relative">
                                    <div
                                        className="absolute -top-2 md:-top-3 left-1/2 -translate-x-1/2 w-16 md:w-24 h-6 md:h-8 shadow-sm z-30 -rotate-1"
                                        style={TAPE_STYLE_DECOR}
                                    />
                                    <div className="relative h-36 w-36 overflow-hidden bg-gray-200 sm:h-40 sm:w-40 md:h-48 md:w-48">
                                        <Image
                                            src="/resources/aboutPhoto.webp"
                                            alt="Dhruv Mishra - Software Engineer at Microsoft"
                                            fill
                                            sizes="(max-width: 640px) 144px, (max-width: 768px) 160px, 192px"
                                            loading="eager"
                                            placeholder="blur"
                                            blurDataURL="data:image/webp;base64,UklGRjAAAABXRUJQVlA4ICQAAACQAQCdASoIAAgABUB8JZQAApt4/8AA/tAqOjucrquuceXgAAA="
                                            className="object-cover sepia-[.3]"
                                        />
                                    </div>
                                </div>
                            </div>

                            <p>
                                Hey, I&apos;m <a href={PERSONAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="font-bold bg-indigo-200 hover:bg-indigo-300 px-1.5 py-0.5 rounded text-indigo-800 transition-[background-color,transform] inline-block hover:-rotate-2">Dhruv</a> 👋
                            </p>
                            <p>
                                I&apos;m a <strong className="text-gray-900">Software Engineer at Microsoft</strong> on the M365 Shell Team, building and optimizing systems that need to be fast, reliable, and <span className="italic">boring</span> in production.
                            </p>
                            <p>
                                Our Shell service handles <span className="underline decoration-wavy decoration-blue-400">identity and user data</span> at massive scale — <strong className="text-emerald-700">7 billion+ hits per day</strong>. I work with <span className="underline decoration-wavy decoration-green-400">C++ and C#</span> on enterprise encryption flows, cutting infrastructure costs and driving <span className="underline decoration-wavy decoration-purple-400">AI workflow adoption</span> across the service.
                            </p>
                            <p>
                                I&apos;m fluent in <span className="font-bold text-cyan-700">C++</span>, <span className="font-bold text-blue-700">C#</span>, <span className="font-bold text-sky-600">TypeScript</span>, <span className="font-bold text-yellow-700">Python</span>, and <span className="font-bold text-orange-700">Java</span>. Previously worked on <a href={PROJECT_LINKS.fluentui} target="_blank" rel="noopener noreferrer" className="bg-blue-200 hover:bg-blue-300 px-1.5 py-0.5 rounded text-blue-800 transition-[background-color,transform] inline-block hover:-rotate-2">Fluent UI Android</a> (Kotlin/Compose). I enjoy deep dives into performance, distributed systems, and infrastructure that quietly does its job well.
                            </p>
                            <p>
                                I&apos;m an active <span className="underline decoration-wavy decoration-rose-400">open source contributor</span> and love collaborating on work that pushes boundaries. Outside code, I&apos;m into <span className="italic">strength training</span>, <span className="italic">PC overclocking</span>, <span className="italic">chess</span>, and following the latest in <span className="italic">AI and longevity research</span>.
                            </p>
                            <p>
                                I graduated with <strong className="text-gray-900">Honors in CSAM</strong> from <a href="https://www.linkedin.com/in/dhruv-mishra-id/details/education/" target="_blank" rel="noopener noreferrer" className="bg-indigo-200 hover:bg-indigo-300 px-1.5 py-0.5 rounded text-indigo-800 transition-[background-color,transform] inline-block hover:-rotate-2">IIIT Delhi</a>, and spend time honing my skills through <a href={PERSONAL_LINKS.codeforces} target="_blank" rel="noopener noreferrer" className="bg-emerald-200 hover:bg-emerald-300 px-1.5 py-0.5 rounded text-emerald-800 transition-[background-color,transform] inline-block hover:-rotate-2">competitive programming</a>.
                            </p>
                            <p className="text-base md:text-lg text-gray-600 mt-4">
                                💬 Reach out: <a href={PERSONAL_LINKS.email} className="bg-red-200 hover:bg-red-300 px-1.5 py-0.5 rounded text-red-800 transition-[background-color,transform] inline-block hover:-rotate-2">dhruvmishra.id@gmail.com</a> • <a href={PERSONAL_LINKS.phone} className="bg-green-200 hover:bg-green-300 px-1.5 py-0.5 rounded text-green-800 transition-[background-color,transform] inline-block hover:-rotate-2">+91-9599377944</a>
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
                                        <p className="font-hand text-sm md:text-lg text-gray-500 group-hover:text-indigo-700 transition-colors">
                                            Curious about my work? Ask me anything.
                                        </p>
                                        <p className="font-hand text-xs md:text-sm text-gray-400 group-hover:text-indigo-500 transition-colors mt-1">
                                            Click here to chat with me
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <ExperienceTimeline entries={experienceTimelineEntries} />
        </div>
    );
}
