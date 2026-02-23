"use client";
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { m, MotionConfig } from 'framer-motion';
import { ExternalLink, Play, Maximize2, Smartphone, Database, Activity, Film, Search, ScrollText, Globe } from 'lucide-react';
import Image from 'next/image';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { PaperClip } from '@/components/DoodleIcons';
import { PROJECT_TOKENS, SHADOW_TOKENS, ANIMATION_TOKENS, INTERACTION_TOKENS, GRADIENT_TOKENS } from '@/lib/designTokens';

// Dynamic import — ProjectModal (240 LOC, video playback) only renders on user click.
const ProjectModal = dynamic(() => import('@/components/ProjectModal'), { ssr: false });

interface Project {
    name: string;
    desc: React.ReactNode;
    lang: string;
    link: string;
    colorClass: string;
    image: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    imageClassName?: string;
    stack: string[];
    blurDataURL: string;
    role: string;
    year: string;
    duration: string;
    highlights: string[];
}

// Tiny 8×8 blur placeholders — generated via Sharp, inlined for zero-cost LCP
const BLUR = {
    fluentUI: 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4IBwAAABQAQCdASoIAAgABUB8JZQABDOAAP7uN/bvFwAA',
    courseEval: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4ICAAAAAwAQCdASoIAAgABUB8JZwAA3AA/u7J1N6Mc7LOBAAAAA==',
    ivc: 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4IBwAAAAwAQCdASoIAAgABwB8JZwAA3AA/u6WCQLPOBAA',
    portfolio: 'data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAACQAQCdASoIAAgABUB8JZwAAudZPNwA/t6YoJcA0BAAAA==',
    recommender: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4ICAAAAAwAQCdASoIAAgABUB8JZQAA3AA/uxjjE3P2PxDd6EAAA==',
    atomVault: 'data:image/webp;base64,UklGRmwAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4IB4AAAAwAQCdASoIAAgABUB8JZwAA3AA/u4CK3YKb4UQgAA=',
    bloom: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4ICAAAACQAQCdASoIAAgABUB8JZQAAp1HJ1wA/udBgwKu8XAAAA==',
} as const;

// Static project data — defined outside component to avoid re-creation on every render
const PROJECTS: Project[] = [
        {
            name: "Fluent UI Android",
            desc: (
                <>
                    A <strong>comprehensive</strong> native Android library enabling developers to build <span className="underline decoration-wavy decoration-blue-400">uniform Microsoft 365</span> experiences. It offers a robust collection of <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">official Fluent design</span> tokens, <em>typography styles</em>, and custom controls, ensuring <span className="underline decoration-dotted decoration-gray-400">seamless integration</span> with the Microsoft ecosystem.
                </>
            ),
            lang: "Kotlin / Java",
            link: "https://github.com/microsoft/fluentui-android",
            colorClass: "bg-note-yellow",
            image: "/resources/FluentUI.webp",
            blurDataURL: BLUR.fluentUI,
            icon: Smartphone,
            label: "Android Lib",
            stack: ["Kotlin", "Java", "Android SDK", "Design Systems", "Clean Architecture", "API Design"],
            role: "Software Engineer Intern",
            year: "2024",
            duration: "6 months",
            highlights: [
                "Contributed to the official Microsoft Fluent UI Android library used by 100M+ users",
                "Implemented custom Fluent design tokens and typography system",
                "Worked closely with designers on the Microsoft 365 design system",
            ]
        },
        {
            name: "Course Evaluator",
            desc: (
                <>
                    An <strong>intelligent Python tool</strong> designed to detect <span className="underline decoration-wavy decoration-orange-400">redundant course content</span> across university curriculums. By leveraging <span className="bg-yellow-200 dark:bg-yellow-800/50 px-1 rounded">fuzzy matching</span> and <span className="italic">text similarity algorithms</span>, it helps students and faculty identify overlapping modules, <span className="underline decoration-double decoration-amber-500">optimizing course selection</span>.
                </>
            ),
            lang: "Python",
            link: "https://github.com/Dhruv-Mishra/Course-Similarity-Evaluator",
            colorClass: "bg-note-orange",
            image: "/resources/CourseEvaluator.webp",
            blurDataURL: BLUR.courseEval,
            icon: Search,
            label: "Overlap Detector",
            stack: ["Python", "Fuzzy Logic", "NLP", "Data Analysis", "Algorithm Design"],
            role: "Solo Developer",
            year: "2023",
            duration: "2 months",
            highlights: [
                "Built fuzzy matching pipeline to compare course syllabi across universities",
                "Identifies redundant modules with configurable similarity thresholds",
                "Helps students avoid retaking equivalent coursework",
            ]
        },
        {
            name: "IVC - Vital Checkup",
            desc: (
                <>
                    A <span className="bg-green-100 dark:bg-green-900/50 px-1 rounded">contactless</span>, <strong>computer-vision powered</strong> health screening kiosk that <span className="underline decoration-wavy decoration-teal-400">automates patient triage</span>. Using <span className="font-mono text-sm bg-teal-100 dark:bg-teal-900/50 px-1 rounded border border-teal-200 dark:border-teal-700">OpenCV</span>, it calculates <em>height, weight, BMI, and pulse</em> from a distance, <span className="text-red-600 dark:text-red-400 font-bold underline decoration-wavy decoration-red-300">drastically reducing wait times</span>.
                </>
            ),
            lang: "Python / OpenCV",
            link: "https://github.com/Dhruv-Mishra/Instant-Vital-Checkup-IVC",
            colorClass: "bg-note-green",
            image: "/resources/InstantVitalCheckup.webp",
            blurDataURL: BLUR.ivc,
            icon: Activity,
            label: "Vitals Scan",
            stack: ["Python", "OpenCV", "Computer Vision", "HealthTech", "Real-time Processing"],
            role: "Lead Developer",
            year: "2023",
            duration: "4 months",
            highlights: [
                "Contactless measurement of height, weight, BMI, and pulse via single camera",
                "Designed kiosk for automated patient triage in hospital settings",
                "Real-time computer vision pipeline using OpenCV and MediaPipe",
            ]
        },
        {
            name: "Personal Portfolio",
            desc: (
                <>
                    A <strong>high-performance</strong> portfolio website built with <span className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-1.5 py-0.5 rounded text-sm">Next.js 16</span>. Features a custom <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">terminal interface</span>, <span className="underline decoration-wavy decoration-amber-400">AI-powered chat</span>, and a <span className="italic">hand-drawn aesthetic</span>. <span className="underline decoration-wavy decoration-indigo-400">Georedundant</span> — hosted on multiple VMs across the globe with a traffic manager and separate <span className="font-semibold">GitHub Actions</span> deployment pipelines. Runs on combined infrastructure from <span className="text-orange-600 dark:text-orange-400 font-semibold">Oracle Cloud</span>, <span className="text-blue-600 dark:text-blue-400 font-semibold">GCP</span>, and <span className="text-sky-600 dark:text-sky-400 font-semibold">Azure</span> — entirely free, only paying for the domain.
                </>
            ),
            lang: "Next.js / TypeScript",
            link: "https://github.com/Dhruv-Mishra/portfolio-website",
            colorClass: "bg-note-blue",
            image: "/resources/PersonalPorfolio.webp",
            blurDataURL: BLUR.portfolio,
            icon: Globe,
            label: "This Website",
            stack: ["Next.js", "TypeScript", "TailwindCSS", "Framer Motion", "Performance Optimization"],
            role: "Designer & Developer",
            year: "2025",
            duration: "Ongoing",
            highlights: [
                "Hand-drawn sketchbook aesthetic with custom pencil/chalk cursor",
                "AI-powered chat and interactive terminal built from scratch",
                "Georedundant deployment across Oracle Cloud, GCP, and Azure",
            ]
        },
        {
            name: "Hybrid Recommender",
            desc: (
                <>
                    A smart <span className="underline decoration-wavy decoration-pink-400">movie recommendation engine</span> for <strong>family movie nights</strong>. It balances <em>individual preferences</em> with <span className="bg-purple-100 dark:bg-purple-900/50 px-1 rounded">group dynamics</span> and <span className="underline decoration-double decoration-purple-400">age-appropriateness ratings</span>, ensuring everyone finds something enjoyable together.
                </>
            ),
            lang: "Python / ML",
            link: "https://github.com/Dhruv-Mishra/Age-and-Context-Sensitive-Hybrid-Entertaintment-Recommender-System",
            colorClass: "bg-note-purple",
            image: "/resources/HybridRecommender.webp",
            blurDataURL: BLUR.recommender,
            icon: Film,
            label: "Movie Night",
            stack: ["Python", "Scikit-Learn", "Collaborative Filtering", "ML System Design"],
            role: "ML Engineer",
            year: "2023",
            duration: "3 months",
            highlights: [
                "Hybrid engine combining collaborative and content-based filtering",
                "Age-appropriateness scoring for family-safe recommendations",
                "Group preference balancing algorithm for multi-user sessions",
            ]
        },
        {
            name: "AtomVault",
            desc: (
                <>
                    A secure, <strong className="text-blue-700 dark:text-blue-400">ACID-compliant</strong> banking database built for <span className="underline decoration-wavy decoration-green-400">high-reliability transactions</span>. Features <span className="italic">multi-user architecture</span> with strict <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">role-based security</span> through a <span className="underline decoration-dotted decoration-gray-400">Java Swing interface</span>.
                </>
            ),
            lang: "Java / MySQL",
            link: "https://github.com/Dhruv-Mishra/AtomVault",
            colorClass: "bg-note-blue",
            image: "/resources/AtomVault.webp",
            blurDataURL: BLUR.atomVault,
            icon: Database,
            label: "Bank Vault",
            stack: ["Java", "MySQL", "JDBC", "Swing", "OOP", "ACID Compliance"],
            role: "Full-Stack Developer",
            year: "2022",
            duration: "2 months",
            highlights: [
                "Full ACID compliance with transaction rollback and recovery",
                "Role-based access control with admin, teller, and customer roles",
                "Java Swing GUI with real-time transaction logging",
            ]
        },
        {
            name: "Bloom Filter Research",
            desc: (
                <>
                    Research at <strong>DCLL</strong> focusing on optimizing <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded border border-blue-200 dark:border-blue-700">Counting Bloom Filters</span> for <span className="underline decoration-wavy decoration-blue-400">high-concurrency systems</span>. Achieved a massive <span className="text-emerald-600 dark:text-emerald-400 font-bold underline decoration-double decoration-emerald-400">300% throughput increase</span> via <em>relaxed synchronization</em> techniques in C++.
                </>
            ),
            lang: "Research / C++",
            link: "https://repository.iiitd.edu.in/jspui/handle/123456789/1613",
            colorClass: "bg-note-gray",
            image: "/resources/BloomFilter.webp",
            blurDataURL: BLUR.bloom,
            icon: ScrollText,
            label: "Research Paper",
            stack: ["C++", "Bloom Filters", "Concurrency", "Optimization", "Data Structures"],
            role: "Research Assistant",
            year: "2024",
            duration: "8 months",
            highlights: [
                "Published at IIIT Delhi's DCLL research lab",
                "300% throughput improvement via relaxed synchronization",
                "Benchmarked against state-of-the-art concurrent filter implementations",
            ]
        },
    ];

// Pre-computed per-card style values — deterministic (index-based), hoisted to module scope
const ROTATIONS = PROJECT_TOKENS.rotations;
const PHOTO_ROTATIONS = PROJECT_TOKENS.photoRotations;
const TAPE_POSITIONS = PROJECT_TOKENS.tapePositions;
const FOLD_SIZE = PROJECT_TOKENS.foldSize;
const CARD_SHADOW = { boxShadow: SHADOW_TOKENS.card } as const;
const CARD_SPRING = { duration: ANIMATION_TOKENS.duration.moderate, ease: ANIMATION_TOKENS.easing.easeOut };
const CARD_HOVER = { ...INTERACTION_TOKENS.hover.card, transition: { type: "spring" as const, ...ANIMATION_TOKENS.spring.gentle } } as const;
const CARD_TAP = INTERACTION_TOKENS.tap.pressLight;

/** Hoisted — avoids re-allocation per render for all 7 cards */
const CARD_CLIP_STYLE = {
    clipPath: `polygon(
        0% 0%,
        100% 0%,
        100% calc(100% - ${FOLD_SIZE}px),
        calc(100% - ${FOLD_SIZE}px) 100%,
        0% 100%
    )`,
} as const;

/** Fold corner styles hoisted — shared across all cards, avoids per-card allocation */
const FOLD_GRADIENT_STYLE = { width: FOLD_SIZE, height: FOLD_SIZE, background: GRADIENT_TOKENS.foldCorner } as const;
const FOLD_COLOR_STYLE = { width: FOLD_SIZE, height: FOLD_SIZE, opacity: 0.85, clipPath: 'polygon(0 0, 0 100%, 100% 0)' } as const;

/** Pre-computed per-card styles — deterministic (index-based), avoids ~28 object allocations per render */
const CLIP_ROTATIONS = [-8, -15, -5, -18, -10, -13, -7];
const CLIP_OFFSETS = [1, 3, 0, 4, 2, 5, 1];
const CARD_STYLES = PROJECTS.map((_, i) => {
    const photoRotate = PHOTO_ROTATIONS[i % 6];
    const tapX = TAPE_POSITIONS[i % 6];
    return {
        tape: { left: `${tapX}%`, transform: `translateX(-50%) rotate(${photoRotate * -1}deg)`, ...TAPE_STYLE_DECOR } as const,
        photo: { transform: `rotate(${photoRotate}deg)` } as const,
        clipClass: `absolute -top-4 z-20 text-gray-400 dark:text-gray-500 drop-shadow-sm` as const,
        clipStyle: { left: `${CLIP_OFFSETS[i % 7]}px`, transform: `rotate(${CLIP_ROTATIONS[i % 7]}deg)` } as const,
    };
});

export default function Projects() {
    const [selectedProject, setSelectedProject] = useState<number | null>(null);

    const handleCardClick = useCallback((e: React.MouseEvent, index: number) => {
        // Don't open modal if clicking the external link
        const target = e.target as HTMLElement;
        if (target.closest('a')) return;
        setSelectedProject(index);
    }, []);

    const handleCloseModal = useCallback(() => {
        setSelectedProject(null);
    }, []);

    return (
        <div className="flex flex-col h-full pt-16 md:pt-0">
            <h1 className="text-[var(--c-heading)] text-4xl md:text-6xl font-hand font-bold mb-8 decoration-wavy underline decoration-indigo-400 decoration-2">
                My Projects
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-14 pb-20 px-6 mt-10">
                {PROJECTS.map((proj, i) => {
                    const rotate = ROTATIONS[i % 6];
                    const styles = CARD_STYLES[i];

                    return (
                        <m.div
                            key={proj.name}
                            className="pt-5"
                            initial={{ opacity: 0, y: 20, rotate: rotate }}
                            whileInView={{
                                opacity: 1,
                                y: 0,
                                rotate: rotate,
                            }}
                            viewport={{ once: true, margin: PROJECT_TOKENS.viewportMargin }}
                            transition={{
                                delay: Math.min(i * PROJECT_TOKENS.staggerStep, PROJECT_TOKENS.staggerCap),
                                ...CARD_SPRING,
                            }}
                        >
                        {/* Inner hover/tap layer — always animates regardless of reduced-motion */}
                        <MotionConfig reducedMotion="never">
                        <m.div
                            data-clickable
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleCardClick(e, i)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProject(i); } }}
                            aria-label={`View details for ${proj.name}`}
                            whileHover={CARD_HOVER}
                            whileTap={CARD_TAP}
                            className="relative text-[var(--c-ink)] min-h-[auto] md:min-h-[450px] font-hand group/card"
                            style={CARD_SHADOW}
                        >
                            {/* Realistic Tape (Top Center-ish) */}
                            <div
                                className="absolute -top-4 w-32 h-10 shadow-sm z-20"
                                style={styles.tape}
                            />

                            {/* The Fold Triangle (Outside Clipped Area) */}
                            <div
                                className="absolute bottom-0 right-0 pointer-events-none z-10"
                                style={FOLD_GRADIENT_STYLE}
                            />
                            <div
                                className={`absolute bottom-0 right-0 pointer-events-none z-10 ${proj.colorClass}`}
                                style={FOLD_COLOR_STYLE}
                            />

                            {/* Inner Clipped Container */}
                            <div
                                className={`content-defer p-6 pt-10 w-full h-full flex flex-col ${proj.colorClass} relative`}
                                style={CARD_CLIP_STYLE}
                            >


                                {/* Polaroid Style Photo */}
                                <div
                                    className="w-full aspect-video bg-white dark:bg-gray-200 p-2 shadow-sm border border-gray-200 dark:border-gray-300 mb-6 relative group z-10 mx-auto max-w-[95%]"
                                    style={styles.photo}
                                >
                                    {/* Paper clip on left corner */}
                                    <PaperClip className={styles.clipClass} style={styles.clipStyle} />

                                    <div className="relative w-full h-full overflow-hidden bg-gray-100">
                                        {proj.image ? (
                                            <>
                                                <Image
                                                    src={proj.image}
                                                    alt={`${proj.name} project screenshot`}
                                                    fill
                                                    sizes="(max-width: 768px) 85vw, (max-width: 1024px) 40vw, 28vw"
                                                    loading={i < 3 ? "eager" : "lazy"}
                                                    priority={i < 3}
                                                    placeholder="blur"
                                                    blurDataURL={proj.blurDataURL}
                                                    className={`object-cover sepia-[.2] group-hover/card:sepia-0 ${proj.imageClassName || ''}`}
                                                />
                                                {/* Play overlay — signals tap/hover to expand */}
                                                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/0 group-hover/card:bg-black/15 transition-[background-color] duration-300">
                                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/80 dark:bg-white/70 flex items-center justify-center opacity-50 md:opacity-0 group-hover/card:opacity-100 scale-90 md:scale-75 group-hover/card:scale-100 transition-[opacity,transform] duration-300 shadow-lg">
                                                        <Play size={18} className="text-gray-800 ml-0.5" fill="currentColor" />
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300">
                                                <span className="font-hand font-bold text-lg text-gray-400 opacity-50 uppercase tracking-widest">[ {proj.name} ]</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Header */}
                                <div className="flex items-start justify-between mb-2 pl-6 relative z-10">
                                    <h3 className="text-3xl font-bold leading-none -rotate-1 text-[var(--c-ink)]">{proj.name}</h3>
                                    <div className="flex items-center gap-1 text-sm font-bold opacity-70 bg-white/40 dark:bg-black/20 px-2 py-1 rounded-sm transform rotate-2">
                                        <proj.icon className="w-4 h-4" /> {proj.label}
                                    </div>
                                </div>

                                {/* Lang Tag */}
                                <div className="mb-4 pl-6 relative z-10">
                                    <span className="text-sm font-bold opacity-80 decoration-wavy underline decoration-gray-400/50">{proj.lang}</span>
                                </div>

                                {/* Description */}
                                <div className="text-lg leading-relaxed flex-1 mb-6 font-medium opacity-90 pl-6 relative z-10">
                                    {proj.desc}
                                </div>

                                {/* Expand hint + Link */}
                                <div className="pl-6 pb-2 flex items-center justify-between relative z-10">
                                    <a
                                        href={proj.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label={`View source for ${proj.name}`}
                                        className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--c-ink)] opacity-60 hover:opacity-100 transition-opacity decoration-wavy underline decoration-gray-400/50 hover:decoration-gray-500"
                                    >
                                        Source <ExternalLink size={14} />
                                    </a>
                                    <div className="flex items-center gap-1 text-xs font-bold text-[var(--c-ink)] opacity-30 group-hover/card:opacity-60 transition-opacity pr-6">
                                        <Maximize2 size={12} /> Tap to expand
                                    </div>
                                </div>
                            </div>
                        </m.div>
                        </MotionConfig>
                        </m.div>
                    );
                })}
            </div>

            {/* Project Detail Modal with Video */}
            <ProjectModal
                project={selectedProject !== null ? PROJECTS[selectedProject] : null}
                onClose={handleCloseModal}
            />
        </div>
    );
}
