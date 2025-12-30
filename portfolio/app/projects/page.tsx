"use client";
import { motion } from 'framer-motion';
import { ExternalLink, Smartphone, Database, Activity, Film, Search, ScrollText } from 'lucide-react';
import Image from 'next/image';

export default function Projects() {
    const projects = [
        {
            name: "Fluent UI Android",
            desc: (
                <>
                    A <strong>comprehensive</strong> native Android library enabling developers to build uniform Microsoft 365 experiences. It offers a robust collection of <span className="underline decoration-wavy decoration-blue-400 underline-offset-2">official Fluent design</span> tokens, typography styles, and custom controls, ensuring seamless integration with the Microsoft ecosystem while adhering to accessibility standards.
                </>
            ),
            lang: "Kotlin / Java",
            link: "https://github.com/microsoft/fluentui-android",
            colorClass: "bg-note-yellow",
            image: "/resources/fluentProjectImage.webp",
            icon: Smartphone,
            label: "Android Lib"
        },
        {
            name: "Course Evaluator",
            desc: (
                <>
                    An <strong>intelligent Python tool</strong> designed to detect redundant course content across university curriculums. By leveraging <span className="bg-yellow-200/50 px-1 rounded-sm border border-yellow-300 dark:bg-yellow-800/30 dark:border-yellow-700">fuzzy matching</span> and text similarity algorithms, it helps students and faculty identify overlapping modules, optimizing course selection and preventing academic redundancy.
                </>
            ),
            lang: "Python",
            link: "https://github.com/Dhruv-Mishra/Course-Similarity-Evaluator",
            colorClass: "bg-note-orange",
            image: "/resources/CourseSimilarityProject.webp",
            icon: Search,
            label: "Overlap Detector",
            imageClassName: "scale-[1.35] object-top"
        },
        {
            name: "IVC - Vital Checkup",
            desc: (
                <>
                    A contactless, <strong>computer-vision powered</strong> health screening kiosk that automates patient triage. Using <em>OpenCV</em>, it instantly calculates height, weight, BMI, and pulse from a distance, significantly <span className="text-red-500 dark:text-red-400 font-bold" style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}>reducing wait times</span> and minimizing physical contact in hospital settings.
                </>
            ),
            lang: "Python / OpenCV",
            link: "https://github.com/Dhruv-Mishra/Instant-Vital-Checkup-IVC",
            colorClass: "bg-note-green",
            image: "/resources/InstantVitalCheckupProject.webp",
            icon: Activity,
            label: "Vitals Scan"
        },
        {
            name: "Hybrid Recommender",
            desc: (
                <>
                    A smart movie recommendation engine tailored for <strong>family movie nights</strong>. It balances individual user preferences with group dynamics and <span className="underline decoration-double decoration-purple-400 underline-offset-2">age-appropriateness ratings</span>, ensuring that everyone from toddlers to adults finds something enjoyable to watch together.
                </>
            ),
            lang: "Python / ML",
            link: "https://github.com/Dhruv-Mishra/Age-and-Context-Sensitive-Hybrid-Entertaintment-Recommender-System",
            colorClass: "bg-note-purple",
            image: "/resources/MovieRecommenderProject.webp",
            icon: Film,
            label: "Movie Night"
        },
        {
            name: "AtomVault",
            desc: (
                <>
                    A secure, <strong>ACID-compliant</strong> banking database management system built for high-reliability transactions. Featured a multi-user architecture with strict <span className="bg-blue-100/50 dark:bg-blue-900/30 px-1 border border-blue-200 dark:border-blue-800 rounded-sm">role-based security</span>, ensuring safe concurrent access for customers and bank staff through a classic Java Swing interface.
                </>
            ),
            lang: "Java / MySQL",
            link: "https://github.com/Dhruv-Mishra/AtomVault",
            colorClass: "bg-note-blue",
            image: "/resources/AtomVaultProject.webp",
            icon: Database,
            label: "Bank Vault"
        },
        {
            name: "Bloom Filter Research",
            desc: (
                <>
                    Research conducted at <strong>DCLL</strong> focusing on optimizing Counting Bloom Filters for high-concurrency systems. Achieved a massive <span className="text-emerald-600 dark:text-emerald-400 font-bold decoration-dashed underline underline-offset-4">300% throughput increase</span> by implementing relaxed synchronization techniques and advanced concurrency patterns in C++.
                </>
            ),
            lang: "Research / C++",
            link: "https://repository.iiitd.edu.in/jspui/handle/123456789/1613",
            colorClass: "bg-note-gray",
            image: "/resources/BloomFiltersProject.webp",
            icon: ScrollText,
            label: "Research Paper"
        },
    ];

    return (
        <div className="flex flex-col h-full">
            <h1 className="text-[var(--c-heading)] text-4xl md:text-6xl font-hand font-bold mb-8 decoration-wavy underline decoration-indigo-400 decoration-2">
                My Projects
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-14 pb-20 px-6 mt-10">
                {projects.map((proj, i) => {
                    // "Random" rotation and offsets based on index to ensure hydration consistency
                    const rotate = [2, -3, 1.5, -2, 4, -1][i % 6];
                    const photoRotate = [-3, 2, -2, 3, -1, 2][i % 6];
                    const tapX = [40, 60, 30, 70, 50, 45][i % 6]; // Random tape position %
                    const foldSize = 30; // Size of the folded corner

                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 30, rotate: 0 }}
                            animate={{
                                opacity: 1,
                                y: 0,
                                rotate: rotate,
                                transition: {
                                    delay: i * 0.05,
                                    duration: 0.3,
                                    ease: "easeOut"
                                }
                            }}
                            whileHover={{
                                scale: 1.02,
                                rotate: 0,
                                zIndex: 20,
                                transition: { duration: 0.15, ease: "easeOut" }
                            }}
                            className={`
                            relative
                            text-[var(--c-ink)]
                            min-h-[450px]
                            font-hand
                            transition-transform
                            will-change-transform
                            filter drop-shadow-[5px_5px_15px_rgba(0,0,0,0.1)]
                        `}
                        >
                            {/* Realistic Tape (Top Center-ish) */}
                            <div
                                className="absolute -top-4 w-32 h-10 bg-white/80 shadow-sm backdrop-blur-[1px] z-20"
                                style={{
                                    left: `${tapX}%`,
                                    transform: `translateX(-50%) rotate(${photoRotate * -1}deg)`,
                                    maskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                                    WebkitMaskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                                    clipPath: 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)'
                                }}
                            />

                            {/* The Fold Triangle (Outside Clipped Area) */}
                            <div
                                className="absolute bottom-0 right-0 pointer-events-none drop-shadow-md z-10"
                                style={{
                                    width: foldSize,
                                    height: foldSize,
                                    backgroundColor: 'rgba(0,0,0,0.1)',
                                    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.05) 50%)',
                                }}
                            />
                            <div
                                className={`absolute bottom-0 right-0 pointer-events-none z-10 ${proj.colorClass}`}
                                style={{
                                    width: foldSize,
                                    height: foldSize,
                                    filter: 'brightness(0.9)',
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
                                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-white/60 shadow-sm backdrop-blur-[1px] z-20"
                                        style={{
                                            transform: `translateX(-50%) rotate(${photoRotate * -2}deg)`,
                                            maskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                                            WebkitMaskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
                                        }}
                                    />

                                    <div className="relative w-full h-full overflow-hidden bg-gray-100">
                                        {proj.image ? (
                                            <Image
                                                src={proj.image}
                                                alt={`${proj.name} project screenshot`}
                                                fill
                                                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                                quality={85}
                                                loading="lazy"
                                                className={`object-cover sepia-[.2] group-hover:sepia-0 transition-all duration-500 ${proj.imageClassName || ''}`}
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

                                {/* Link - Handwritten Button */}
                                <div className="pl-6 pb-2 relative z-10">
                                    <a
                                        href={proj.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 border-2 border-[var(--c-ink)] rounded-full hover:bg-[var(--c-ink)] hover:text-[var(--c-paper)] transition-all hover:-rotate-2 shadow-sm font-bold bg-white/20 dark:bg-black/10 backdrop-blur-sm"
                                    >
                                        Check it out! <ExternalLink size={18} />
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
