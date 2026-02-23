"use client";
import { X, ExternalLink, Calendar, Clock, User, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { TAPE_STYLE_DECOR } from '@/lib/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProjectModalData {
    name: string;
    desc: React.ReactNode;
    lang: string;
    link: string;
    colorClass: string;
    image: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    stack: string[];
    role: string;
    year: string;
    duration: string;
    highlights: string[];
}

interface ProjectModalProps {
    /** Pass null when no project is selected — the modal will be hidden */
    project: ProjectModalData | null;
    onClose: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FOLD_SIZE = 30;

const FOLD_CLIP_PATH = `polygon(
    0% 0%,
    100% 0%,
    100% calc(100% - ${FOLD_SIZE}px),
    calc(100% - ${FOLD_SIZE}px) 100%,
    0% 100%
)` as const;

/** Hoisted — avoids object re-allocation per render */
const FOLD_CARD_STYLE = { clipPath: FOLD_CLIP_PATH } as const;

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProjectModal({ project, onClose }: ProjectModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    const videoSrc = project ? project.image.replace(/\.webp$/, '.mp4') : '';

    // Auto-play video when a project is selected; pause + release buffer on close
    useEffect(() => {
        const video = videoRef.current;
        if (project && video) {
            video.play().catch(() => {
                // Browser may block autoplay — user can click play manually
            });
        }
        return () => {
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.load(); // release decode buffer
            }
        };
    }, [project]);

    return (
        <Modal
            isOpen={project !== null}
            onClose={onClose}
            className={cn(
                "w-[95vw] max-w-3xl my-6 md:my-12",
                project?.colorClass,
                "shadow-lg font-hand",
            )}
            style={FOLD_CARD_STYLE}
            ariaLabel={project ? `${project.name} project details` : undefined}
            backdropClassName="bg-black/60"
        >
            {project && (
                <>
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-white/60 dark:bg-black/40 hover:bg-white/90 dark:hover:bg-black/60 transition-colors shadow-md"
                        aria-label="Close project details"
                        data-clickable
                    >
                        <X size={20} />
                    </button>

                    {/* Tape decoration */}
                    <div
                        className="absolute -top-4 left-1/2 -translate-x-1/2 w-32 h-10 shadow-sm z-20"
                        style={TAPE_STYLE_DECOR}
                    />

                    <div className="p-6 md:p-8 pt-10">
                        {/* ── Video Player ───────────────────────────────────────── */}
                        <div className="w-full aspect-video bg-white dark:bg-gray-200 p-2 shadow-md border border-gray-200 dark:border-gray-300 mb-6 relative">
                            {/* Photo tape on video frame */}
                            <div
                                className="absolute -top-3 left-1/2 w-20 h-6 shadow-sm z-20"
                                style={{
                                    transform: 'translateX(-50%)',
                                    ...TAPE_STYLE_DECOR,
                                }}
                            />

                            <div className="relative w-full h-full overflow-hidden bg-gray-100">
                                <video
                                    ref={videoRef}
                                    src={videoSrc}
                                    poster={project.image}
                                    muted
                                    loop
                                    playsInline
                                    preload="none"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>

                        {/* ── Project Header ─────────────────────────────────────── */}
                        <div className="flex items-start justify-between mb-3 gap-3 relative z-10">
                            <h2 className="text-3xl md:text-5xl font-bold leading-tight text-[var(--c-ink)]">
                                {project.name}
                            </h2>
                            <div className="flex items-center gap-1.5 text-sm font-bold opacity-70 bg-white/40 dark:bg-black/20 px-3 py-1.5 rounded-sm shrink-0">
                                <project.icon className="w-5 h-5" /> {project.label}
                            </div>
                        </div>

                        {/* ── Meta badges row (role, year, duration) ─────────────── */}
                        <div className="flex flex-wrap gap-3 mb-5 relative z-10">
                            <div className="inline-flex items-center gap-1.5 text-sm font-bold opacity-75 bg-white/40 dark:bg-black/20 px-2.5 py-1 rounded-sm">
                                <User size={14} className="opacity-60" /> {project.role}
                            </div>
                            <div className="inline-flex items-center gap-1.5 text-sm font-bold opacity-75 bg-white/40 dark:bg-black/20 px-2.5 py-1 rounded-sm">
                                <Calendar size={14} className="opacity-60" /> {project.year}
                            </div>
                            <div className="inline-flex items-center gap-1.5 text-sm font-bold opacity-75 bg-white/40 dark:bg-black/20 px-2.5 py-1 rounded-sm">
                                <Clock size={14} className="opacity-60" /> {project.duration}
                            </div>
                        </div>

                        {/* Language Tag */}
                        <div className="mb-5 relative z-10">
                            <span className="text-base font-bold opacity-80 decoration-wavy underline decoration-gray-400/50">
                                {project.lang}
                            </span>
                        </div>

                        {/* Description */}
                        <div className="text-lg md:text-xl leading-relaxed mb-6 font-medium opacity-90 relative z-10">
                            {project.desc}
                        </div>

                        {/* ── Key Highlights ─────────────────────────────────────── */}
                        {project.highlights.length > 0 && (
                            <div className="mb-6 relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <Sparkles size={16} className="text-amber-500" />
                                    <h3 className="text-lg font-bold text-[var(--c-ink)] decoration-wavy underline decoration-amber-400/50">
                                        Key Highlights
                                    </h3>
                                </div>
                                <ul className="space-y-2 pl-1">
                                    {project.highlights.map((highlight, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-base leading-relaxed font-medium opacity-85">
                                            <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--c-ink)]/30 shrink-0" />
                                            {highlight}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Tech Stack */}
                        <div className="mb-6 flex flex-wrap gap-2 relative z-10">
                            {project.stack.map((tech) => (
                                <span
                                    key={tech}
                                    className="px-2.5 py-1 bg-[var(--c-paper)]/80 text-[var(--c-ink)] text-sm font-code font-bold rounded-sm border border-[var(--c-ink)]/20 shadow-sm"
                                >
                                    #{tech}
                                </span>
                            ))}
                        </div>

                        {/* External Link */}
                        <div className="pb-2 relative z-10">
                            <a
                                href={project.link}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`View source for ${project.name}`}
                                className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[var(--c-ink)] rounded-full hover:bg-[var(--c-ink)] hover:text-[var(--c-paper)] transition-colors shadow-sm font-bold bg-white/30 dark:bg-black/20"
                                data-clickable
                            >
                                Check it out! <ExternalLink size={18} />
                            </a>
                        </div>
                    </div>

                    {/* Fold corner decoration */}
                    <div
                        className="absolute bottom-0 right-0 pointer-events-none z-10"
                        style={{
                            width: FOLD_SIZE,
                            height: FOLD_SIZE,
                            background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.06) 50%)',
                        }}
                    />
                    <div
                        className={`absolute bottom-0 right-0 pointer-events-none z-10 ${project.colorClass}`}
                        style={{
                            width: FOLD_SIZE,
                            height: FOLD_SIZE,
                            opacity: 0.85,
                            clipPath: 'polygon(0 0, 0 100%, 100% 0)',
                        }}
                    />
                </>
            )}
        </Modal>
    );
}
