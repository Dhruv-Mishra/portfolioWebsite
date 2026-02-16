"use client";
import { m } from 'framer-motion';
import { ExternalLink, Smartphone, Database, Activity, Film, Search, ScrollText, Globe } from 'lucide-react';
import Image from 'next/image';
import { TAPE_STYLE_DECOR } from '@/lib/constants';

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
}

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
            icon: Smartphone,
            label: "Android Lib",
            stack: ["Kotlin", "Java", "Android SDK", "Design Systems", "Clean Architecture", "API Design"]
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
            icon: Search,
            label: "Overlap Detector",
            stack: ["Python", "Fuzzy Logic", "NLP", "Data Analysis", "Algorithm Design"]
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
            icon: Activity,
            label: "Vitals Scan",
            stack: ["Python", "OpenCV", "Computer Vision", "HealthTech", "Real-time Processing"]
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
            icon: Globe,
            label: "This Website",
            stack: ["Next.js", "TypeScript", "TailwindCSS", "Framer Motion", "Performance Optimization"]
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
            icon: Film,
            label: "Movie Night",
            stack: ["Python", "Scikit-Learn", "Collaborative Filtering", "ML System Design"]
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
            icon: Database,
            label: "Bank Vault",
            stack: ["Java", "MySQL", "JDBC", "Swing", "OOP", "ACID Compliance"]
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
            icon: ScrollText,
            label: "Research Paper",
            stack: ["C++", "Bloom Filters", "Concurrency", "Optimization", "Data Structures"]
        },
    ];

export default function Projects() {
    return (
        <div className="flex flex-col h-full pt-16 md:pt-0">
            <h1 className="text-[var(--c-heading)] text-4xl md:text-6xl font-hand font-bold mb-8 decoration-wavy underline decoration-indigo-400 decoration-2">
                My Projects
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-14 pb-20 px-6 mt-10">
                {PROJECTS.map((proj, i) => {
                    // "Random" rotation and offsets based on index to ensure hydration consistency
                    const rotate = [2, -3, 1.5, -2, 4, -1][i % 6];
                    const photoRotate = [-3, 2, -2, 3, -1, 2][i % 6];
                    const tapX = [40, 60, 30, 70, 50, 45][i % 6]; // Random tape position %
                    const foldSize = 30; // Size of the folded corner

                    return (
                        <m.div
                            key={proj.name}
                            initial={{ opacity: 0, y: 20, rotate: rotate }}
                            whileInView={{
                                opacity: 1,
                                y: 0,
                                rotate: rotate,
                            }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{
                                delay: Math.min(i * 0.03, 0.15), // Cap delay at 150ms
                                duration: 0.3,
                                ease: "easeOut"
                            }}
                            whileHover={{
                                scale: 1.02,
                                rotate: 0,
                                transition: { duration: 0.15 }
                            }}
                            className="relative text-[var(--c-ink)] min-h-[auto] md:min-h-[450px] font-hand"
                            style={{
                                boxShadow: '5px 5px 15px rgba(0,0,0,0.1)'
                            }}
                        >
                            {/* Realistic Tape (Top Center-ish) */}
                            <div
                                className="absolute -top-4 w-32 h-10 shadow-sm z-20"
                                style={{
                                    left: `${tapX}%`,
                                    transform: `translateX(-50%) rotate(${photoRotate * -1}deg)`,
                                    ...TAPE_STYLE_DECOR,
                                }}
                            />

                            {/* The Fold Triangle (Outside Clipped Area) */}
                            <div
                                className="absolute bottom-0 right-0 pointer-events-none z-10"
                                style={{
                                    width: foldSize,
                                    height: foldSize,
                                    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.05) 50%)',
                                }}
                            />
                            <div
                                className={`absolute bottom-0 right-0 pointer-events-none z-10 ${proj.colorClass}`}
                                style={{
                                    width: foldSize,
                                    height: foldSize,
                                    opacity: 0.85,
                                    clipPath: 'polygon(0 0, 0 100%, 100% 0)'
                                }}
                            />

                            {/* Inner Clipped Container */}
                            <div
                                className={`p-6 pt-10 w-full h-full flex flex-col ${proj.colorClass} relative`}
                                style={{
                                    clipPath: `polygon(
                                    0% 0%,
                                    100% 0%,
                                    100% calc(100% - ${foldSize}px),
                                    calc(100% - ${foldSize}px) 100%,
                                    0% 100%
                                )`
                                }}
                            >


                                {/* Polaroid Style Photo */}
                                <div
                                    className="w-full aspect-video bg-white dark:bg-gray-200 p-2 shadow-sm border border-gray-200 dark:border-gray-300 mb-6 relative group z-10 mx-auto max-w-[95%]"
                                    style={{ transform: `rotate(${photoRotate}deg)` }}
                                >
                                    {/* Photo Tape */}
                                    <div
                                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 shadow-sm z-20"
                                        style={{
                                            transform: `translateX(-50%) rotate(${photoRotate * -2}deg)`,
                                            ...TAPE_STYLE_DECOR,
                                        }}
                                    />

                                    <div className="relative w-full h-full overflow-hidden bg-gray-100">
                                        {proj.image ? (
                                            <Image
                                                src={proj.image}
                                                alt={`${proj.name} project screenshot`}
                                                fill
                                                sizes="(max-width: 768px) 85vw, (max-width: 1024px) 40vw, 28vw"
                                                loading={i === 0 ? "eager" : "lazy"}
                                                priority={i === 0}
                                                className={`object-cover sepia-[.2] group-hover:sepia-0 transition-[filter] duration-300 ${proj.imageClassName || ''}`}
                                            />
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

                                {/* Stack Tags */}
                                <div className="pl-6 mb-6 flex flex-wrap gap-2 relative z-10">
                                    {proj.stack.map((tech) => (
                                        <span key={tech} className="px-2 py-1 bg-[var(--c-paper)]/80 text-[var(--c-ink)] text-xs font-code font-bold rounded-sm border border-[var(--c-ink)]/20 shadow-sm scale-95 hover:scale-105 transition-transform cursor-default">
                                            #{tech}
                                        </span>
                                    ))}
                                </div>

                                {/* Link - Handwritten Button */}
                                <div className="pl-6 pb-2 relative z-10">
                                    <a
                                        href={proj.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label={`View details for ${proj.name}`}
                                        className="inline-flex items-center gap-2 px-4 py-2 border-2 border-[var(--c-ink)] rounded-full hover:bg-[var(--c-ink)] hover:text-[var(--c-paper)] transition-colors hover:-rotate-2 shadow-sm font-bold bg-white/30 dark:bg-black/20"
                                    >
                                        Check it out! <ExternalLink size={18} />
                                    </a>
                                </div>
                            </div>
                        </m.div>
                    );
                })}
            </div>
        </div>
    );
}
