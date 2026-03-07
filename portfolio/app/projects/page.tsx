"use client";
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { m, MotionConfig } from 'framer-motion';
import { ExternalLink, Play, Maximize2 } from 'lucide-react';
import Image from 'next/image';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { PaperClip } from '@/components/DoodleIcons';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAppHaptics } from '@/lib/haptics';
import { PROJECTS } from '@/lib/projects';
import { PROJECT_TOKENS, SHADOW_TOKENS, ANIMATION_TOKENS, INTERACTION_TOKENS, GRADIENT_TOKENS } from '@/lib/designTokens';

// Dynamic import — ProjectModal only renders on user click.
const ProjectModal = dynamic(() => import('@/components/ProjectModal'), { ssr: false });

// Pre-computed per-card style values — deterministic (index-based), hoisted to module scope
const ROTATIONS = PROJECT_TOKENS.rotations;
const PHOTO_ROTATIONS = PROJECT_TOKENS.photoRotations;
const TAPE_POSITIONS = PROJECT_TOKENS.tapePositions;
const FOLD_SIZE = PROJECT_TOKENS.foldSize;
const CARD_SHADOW = { boxShadow: SHADOW_TOKENS.card } as const;
const CARD_SHADOW_MOBILE = { boxShadow: '2px 4px 10px rgba(0,0,0,0.08)' } as const;
const CARD_SPRING = { duration: ANIMATION_TOKENS.duration.moderate, ease: ANIMATION_TOKENS.easing.easeOut };
const CARD_HOVER = { ...INTERACTION_TOKENS.hover.card, transition: { type: "spring" as const, ...ANIMATION_TOKENS.spring.gentle } } as const;
const CARD_TAP = INTERACTION_TOKENS.tap.pressLight;

/** Hoisted — avoids re-allocation per render for every card */
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
    const isMobile = useIsMobile();
    const { lightTap, tap } = useAppHaptics();

    const openProject = useCallback((index: number) => {
        tap();
        setSelectedProject(index);
    }, [tap]);

    const handleCardClick = useCallback((e: React.MouseEvent, index: number) => {
        // Don't open modal if clicking the external link
        const target = e.target as HTMLElement;
        if (target.closest('a')) return;
        openProject(index);
    }, [openProject]);

    const handleCloseModal = useCallback(() => {
        lightTap();
        setSelectedProject(null);
    }, [lightTap]);

    return (
        <div className="flex flex-col h-full pt-16 md:pt-0">
            <h1 className="text-[var(--c-heading)] text-4xl md:text-6xl font-hand font-bold mb-8 decoration-wavy underline decoration-indigo-400 decoration-2">
                My Projects
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-14 pb-20 px-6 mt-10">
                {PROJECTS.map((proj, i) => {
                    const rotate = ROTATIONS[i % 6];
                    const styles = CARD_STYLES[i];
                    const hasVideo = proj.video !== null;

                    return (
                        <m.div
                            key={proj.name}
                            className="pt-5"
                            initial={isMobile ? { opacity: 1, y: 0, rotate: rotate } : { opacity: 0, y: 20, rotate: rotate }}
                            animate={isMobile ? { opacity: 1, y: 0, rotate: rotate } : undefined}
                            whileInView={isMobile ? undefined : {
                                opacity: 1,
                                y: 0,
                                rotate: rotate,
                            }}
                            viewport={isMobile ? undefined : { once: true, margin: PROJECT_TOKENS.viewportMargin }}
                            transition={isMobile ? { duration: 0 } : {
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
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openProject(i);
                                }
                            }}
                            aria-label={`View details for ${proj.name}`}
                            whileHover={isMobile ? undefined : CARD_HOVER}
                            whileTap={CARD_TAP}
                            className="relative text-[var(--c-ink)] min-h-[auto] md:min-h-[450px] font-hand group/card"
                            style={isMobile ? CARD_SHADOW_MOBILE : CARD_SHADOW}
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
                                                    className={`object-cover sepia-[.2] md:group-hover/card:sepia-0 ${proj.imageClassName || ''}`}
                                                />
                                                {/* Play overlay — signals tap/hover to expand */}
                                                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/0 md:group-hover/card:bg-black/15 transition-[background-color] duration-300">
                                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/80 dark:bg-white/70 flex items-center justify-center opacity-50 md:opacity-0 md:group-hover/card:opacity-100 scale-90 md:scale-75 md:group-hover/card:scale-100 transition-[opacity,transform] duration-300 shadow-md md:shadow-lg">
                                                        {hasVideo ? (
                                                            <Play size={18} className="text-gray-800 ml-0.5" fill="currentColor" />
                                                        ) : (
                                                            <Maximize2 size={18} className="text-gray-800" />
                                                        )}
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
                                <div className="text-lg leading-relaxed flex-1 mb-4 font-medium opacity-90 pl-6 relative z-10">
                                    {proj.desc}
                                </div>

                                {/* Tech Stack Pills */}
                                <div className="mb-4 flex flex-wrap gap-1.5 pl-6 relative z-10">
                                    {proj.stack.map((tech) => (
                                        <span
                                            key={tech}
                                            className="px-2.5 py-1 text-xs font-code font-medium text-[var(--c-ink)]/70 border border-[var(--c-ink)]/15 rounded-full"
                                        >
                                            {tech}
                                        </span>
                                    ))}
                                </div>

                                {/* Expand hint + Link */}
                                <div className="pl-6 pb-2 flex items-center justify-between relative z-10">
                                    <a
                                        href={proj.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label={`View source for ${proj.name}`}
                                        className="inline-flex items-center gap-1.5 text-base font-bold text-[var(--c-ink)] opacity-60 hover:opacity-100 transition-opacity decoration-wavy underline decoration-gray-400/50 hover:decoration-gray-500"
                                    >
                                        Source <ExternalLink size={16} />
                                    </a>
                                    <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-ink)] opacity-30 md:group-hover/card:opacity-60 transition-opacity pr-6">
                                        <Maximize2 size={14} /> Tap to expand
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
