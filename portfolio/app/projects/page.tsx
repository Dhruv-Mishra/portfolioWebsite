"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Star } from 'lucide-react';

export default function Projects() {
    const projects = [
        {
            name: "Portfolio v1",
            desc: "This very website! Built with Next.js and Frame Motion.",
            lang: "Next.js",
            stars: 120,
            link: "https://github.com/dhruv/portfolio",
            color: "#fef9c3" // Yellow-100 (Uniform)
        },
        {
            name: "CLI-To-Do",
            desc: "Rust based task manager for the terminal.",
            lang: "Rust",
            stars: 45,
            link: "https://github.com/dhruv/cli-todo",
            color: "#fef9c3" // Yellow-100 (Uniform)
        },
        {
            name: "Neural-Net",
            desc: "Simple python AI model learning basic patterns.",
            lang: "Python",
            stars: 89,
            link: "https://github.com/dhruv/neural-net",
            color: "#fef9c3" // Yellow-100 (Uniform)
        },
        {
            name: "Chat-App",
            desc: "Realtime chat with websockets and redis.",
            lang: "TypeScript",
            stars: 32,
            link: "https://github.com/dhruv/chat-app",
            color: "#fef9c3" // Yellow-100 (Uniform)
        },
    ];

    return (
        <div className="flex flex-col h-full">
            <h1 className="text-[var(--c-heading)] text-4xl md:text-6xl font-hand font-bold mb-8 decoration-wavy underline decoration-indigo-400 decoration-2">
                My Projects
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 pb-20 px-6 mt-10">
                {projects.map((proj, i) => {
                    // "Random" rotation and offsets based on index to ensure hydration consistency
                    const rotate = [2, -3, 1.5, -2, 4, -1][i % 6];
                    const tapeRotate = [-2, 3, -1, 4, -3, 2][i % 6];
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
                            text-gray-800
                            min-h-[350px]
                            font-hand
                            transition-transform
                            will-change-transform
                            filter drop-shadow-[5px_5px_15px_rgba(0,0,0,0.1)]
                        `}
                        >
                            {/* Realistic Tape (Outside Clipped Area) */}
                            <div
                                className="absolute -top-4 left-1/2 -translate-x-1/2 w-32 h-10 bg-white/80 shadow-sm backdrop-blur-[1px] z-20"
                                style={{
                                    transform: `translateX(-50%) rotate(${tapeRotate}deg)`,
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
                                className="absolute bottom-0 right-0 pointer-events-none z-10"
                                style={{
                                    width: foldSize,
                                    height: foldSize,
                                    backgroundColor: proj.color,
                                    filter: 'brightness(0.9)',
                                    clipPath: 'polygon(0 0, 0 100%, 100% 0)'
                                }}
                            />

                            {/* Inner Clipped Container */}
                            <div
                                className="p-6 pt-12 w-full h-full flex flex-col"
                                style={{
                                    backgroundColor: proj.color,
                                    clipPath: `polygon(
                                    0% 0%,
                                    100% 0%,
                                    100% calc(100% - ${foldSize}px),
                                    calc(100% - ${foldSize}px) 100%,
                                    0% 100%
                                )`
                                }}
                            >
                                {/* Project Photo Placeholder - Sketchy Border */}
                                <div className="w-full aspect-video bg-gray-900/5 rounded-sm mb-4 border-2 border-dashed border-gray-900/20 flex items-center justify-center relative overflow-hidden group rotate-1">
                                    <span className="font-hand font-bold text-lg text-gray-500/50 uppercase tracking-widest rotate-[-5deg]">[ {proj.name} ]</span>
                                    <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>

                                {/* Header */}
                                <div className="flex items-start justify-between mb-2">
                                    <h3 className="text-3xl font-bold text-gray-900 leading-none -rotate-1">{proj.name}</h3>
                                    <div className="flex items-center gap-1 text-sm font-bold text-gray-600">
                                        <Star className="w-4 h-4 fill-gray-600" /> {proj.stars}
                                    </div>
                                </div>

                                {/* Lang Tag */}
                                <div className="mb-4">
                                    <span className="text-sm font-bold text-gray-700 decoration-wavy underline decoration-gray-400/50">{proj.lang}</span>
                                </div>

                                {/* Description */}
                                <p className="text-gray-800 text-xl leading-relaxed flex-1 mb-6 font-medium">
                                    {proj.desc}
                                </p>

                                {/* Link - Handwritten Button */}
                                <a
                                    href={proj.link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="self-start flex items-center gap-2 px-4 py-2 border-2 border-gray-800 rounded-full hover:bg-gray-800 hover:text-white transition-all hover:-rotate-2 shadow-sm font-bold"
                                >
                                    Checkout <ExternalLink size={18} />
                                </a>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
