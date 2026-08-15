"use client";
import { X, ExternalLink, Play, User, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useAppHaptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { PaperClip } from '@/components/DoodleIcons';
import { stickerBus } from '@/lib/stickerBus';
import type { ProjectRecord } from '@/lib/projects';
import {
  CONTROL_PROJECT_VIDEO_EVENT,
  attachSiteActionResult,
  registerSiteActionHost,
  type ControlProjectVideoEventDetail,
} from '@/lib/siteActionEvents';
import type { SiteToolResult } from '@/lib/siteTools';

interface ProjectModalProps {
    /** Pass null when no project is selected — the modal will be hidden */
    project: ProjectRecord | null;
    onClose: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FOLD_SIZE = 30;
const VIDEO_PLAY_RETRY_MS = 1000;
const VIDEO_PLAY_RETRY_STEP_MS = 50;

const FOLD_CLIP_PATH = `polygon(
    0% 0%,
    100% 0%,
    100% calc(100% - ${FOLD_SIZE}px),
    calc(100% - ${FOLD_SIZE}px) 100%,
    0% 100%
)` as const;

/** Hoisted — avoids object re-allocation per render */
const FOLD_CARD_STYLE = { clipPath: FOLD_CLIP_PATH } as const;

/** Hoisted fold corner styles — avoids per-render allocation */
const FOLD_GRADIENT_MODAL_STYLE = {
    width: FOLD_SIZE,
    height: FOLD_SIZE,
    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.06) 50%)',
} as const;
const FOLD_COLOR_MODAL_STYLE = {
    width: FOLD_SIZE,
    height: FOLD_SIZE,
    opacity: 0.85,
    clipPath: 'polygon(0 0, 0 100%, 100% 0)',
} as const;

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProjectModal({ project, onClose }: ProjectModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isMutedRef = useRef(true);
    const { closePanel, externalLink, selection, tap } = useAppHaptics();
    const [isMuted, setIsMuted] = useState(true);
    const [showPlayButton, setShowPlayButton] = useState(false);
    const [hasMountedVideo, setHasMountedVideo] = useState(false);

    const hasVideo = project ? project.video !== null : false;
    const videoSrc = !project
        ? ''
        : project.video === undefined
            ? project.image.replace(/\.webp$/, '.mp4')
            : (project.video ?? '');

    // Toggle mute/unmute — syncs state to the video element directly
    const toggleMute = useCallback(() => {
        selection();
        setIsMuted(prev => {
            const next = !prev;
            isMutedRef.current = next;
            if (videoRef.current) videoRef.current.muted = next;
            return next;
        });
    }, [selection]);

    const playVideo = useCallback(async () => {
        const deadline = Date.now() + VIDEO_PLAY_RETRY_MS;
        let video = videoRef.current;
        while (!video) {
            if (Date.now() >= deadline) return false;
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, VIDEO_PLAY_RETRY_STEP_MS);
            });
            video = videoRef.current;
        }

        tap();

        try {
            await video.play();
            setShowPlayButton(false);
            return true;
        } catch {
            setShowPlayButton(true);
            return false;
        }
    }, [tap]);

    const reportPlayResult = useCallback(async (): Promise<SiteToolResult> => {
        const played = await playVideo();
        if (!played) {
            return {
                ok: false,
                spokenText: 'I could not play that preview.',
                errorCode: 'project-video-unavailable',
            };
        }
        return {
            ok: true,
            spokenText: 'Playing the preview.',
            data: { action: 'play', nextAction: 'Want me to mute or pause it?' },
        };
    }, [playVideo]);

    const pauseVideo = useCallback(() => {
        const video = videoRef.current;
        if (!video) return false;
        video.pause();
        setShowPlayButton(true);
        return true;
    }, []);

    const setMuted = useCallback((muted: boolean) => {
        const video = videoRef.current;
        if (!video) return false;
        selection();
        isMutedRef.current = muted;
        video.muted = muted;
        setIsMuted(muted);
        return true;
    }, [selection]);

    useEffect(() => {
        if (!project || !hasVideo || !hasMountedVideo) return;
        const unregister = registerSiteActionHost('project-video');
        const handler = (raw: Event) => {
            const event = raw as CustomEvent<ControlProjectVideoEventDetail>;
            const action = event.detail?.action;
            if (!action) return;

            let result: SiteToolResult;
            if (action === 'play') {
                // Claim now; the thenable settles only after video.play() resolves.
                attachSiteActionResult(event, reportPlayResult() as unknown as SiteToolResult);
                return;
            }
            if (action === 'pause') {
                result = pauseVideo()
                    ? { ok: true, spokenText: 'Paused the preview.', data: { action, nextAction: 'Want me to play it again?' } }
                    : { ok: false, spokenText: 'I could not pause that preview.', errorCode: 'project-video-unavailable' };
            } else if (action === 'mute') {
                result = setMuted(true)
                    ? { ok: true, spokenText: 'Muted the preview.', data: { action } }
                    : { ok: false, spokenText: 'I could not mute that preview.', errorCode: 'project-video-unavailable' };
            } else {
                result = setMuted(false)
                    ? { ok: true, spokenText: 'Unmuted the preview.', data: { action } }
                    : { ok: false, spokenText: 'I could not unmute that preview.', errorCode: 'project-video-unavailable' };
            }
            attachSiteActionResult(event, result);
        };
        window.addEventListener(CONTROL_PROJECT_VIDEO_EVENT, handler);
        return () => {
            unregister();
            window.removeEventListener(CONTROL_PROJECT_VIDEO_EVENT, handler);
        };
    }, [hasMountedVideo, hasVideo, pauseVideo, project, reportPlayResult, setMuted]);

    const attemptAutoplay = useCallback((node: HTMLVideoElement, muted: boolean) => {
        node.muted = muted;
        void node.play()
            .then(() => setShowPlayButton(false))
            .catch(() => {
                // Browser may block autoplay — show a manual play affordance.
                setShowPlayButton(true);
            });
    }, []);

    // Callback ref — fires when the <video> DOM node mounts inside the portal.
    const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
        const previousVideo = videoRef.current;
        if (previousVideo && previousVideo !== node) {
            previousVideo.pause();
            previousVideo.removeAttribute('src');
            previousVideo.load();
        }

        videoRef.current = node;
        setHasMountedVideo(node !== null);
        if (node) {
            setShowPlayButton(false);
            attemptAutoplay(node, isMutedRef.current);
        }
    }, [attemptAutoplay]);

    useEffect(() => {
        const video = videoRef.current;
        if (!project || !hasVideo || !video) return;
        video.pause();
        video.currentTime = 0;
        setShowPlayButton(false);
        attemptAutoplay(video, isMutedRef.current);
    }, [attemptAutoplay, hasVideo, project, videoSrc]);

    return (
        <Modal
            isOpen={project !== null}
            onClose={onClose}
            className="mx-auto my-3 w-[calc(100%-1.5rem)] max-w-3xl font-hand md:my-12"
            ariaLabel={project ? `${project.name} project details` : undefined}
            backdropClassName="bg-black/60"
        >
            {project && (
                <div className="relative pt-5">
                    {/* Tape decoration — lives in the top padding, outside the clip path */}
                    <div
                        data-tape-strip
                        className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-10 shadow-sm z-20"
                        style={TAPE_STYLE_DECOR}
                    />

                    {/* Clipped card with background color + fold corner */}
                    <div
                        className={cn("relative shadow-lg", project.colorClass)}
                        style={FOLD_CARD_STYLE}
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => {
                                closePanel();
                                onClose();
                            }}
                            className="absolute top-4 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/60 text-rose-600/80 shadow-md hover:scale-110 hover:rotate-6 hover:bg-rose-50/90 hover:text-rose-700 dark:bg-black/40 dark:text-rose-400/85 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 transition-[color,background-color,transform] duration-200"
                            aria-label="Close project note"
                            data-clickable
                        >
                            <X size={20} strokeWidth={2.4} />
                        </button>

                    <div className="p-6 md:p-8 pt-8">
                        {/* ── Project Preview ─────────────────────────────────────── */}
                        <div className="w-full aspect-video bg-white dark:bg-gray-200 p-2 shadow-md border border-gray-200 dark:border-gray-300 mb-6 relative">
                            {/* Paper clip on left corner */}
                            <PaperClip className="absolute -top-4 left-1 z-20 text-gray-400 dark:text-gray-500 drop-shadow-sm -rotate-12" />

                            <div className="relative w-full h-full overflow-hidden bg-gray-100">
                                {hasVideo ? (
                                    <>
                                        <video
                                            ref={setVideoRef}
                                            src={videoSrc}
                                            poster={project.image}
                                            muted
                                            loop
                                            playsInline
                                            preload="metadata"
                                            className="w-full h-full object-cover"
                                        />
                                        {showPlayButton ? (
                                            <button
                                                onClick={playVideo}
                                                aria-label={`Play ${project.name} preview video`}
                                                data-clickable
                                                className="absolute inset-0 z-10 flex items-center justify-center bg-black/25 text-white transition-colors hover:bg-black/35"
                                            >
                                                <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 shadow-lg">
                                                    <Play size={18} fill="currentColor" />
                                                    Play preview
                                                </span>
                                            </button>
                                        ) : null}
                                        <button
                                            onClick={toggleMute}
                                            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                                            data-clickable
                                            className="absolute bottom-3 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors shadow-md"
                                        >
                                            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                        </button>
                                    </>
                                ) : (
                                    <Image
                                        src={project.image}
                                        alt={`${project.name} project preview`}
                                        fill
                                        sizes="(max-width: 768px) 90vw, 720px"
                                        placeholder="blur"
                                        blurDataURL={project.blurDataURL}
                                        className="object-cover"
                                    />
                                )}
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

                        {/* ── Meta badge (project type) ─────────────── */}
                        <div className="flex flex-wrap gap-3 mb-5 relative z-10">
                            <div className="inline-flex items-center gap-1.5 text-sm font-bold opacity-75 bg-white/40 dark:bg-black/20 px-2.5 py-1 rounded-sm">
                                <User size={14} className="opacity-60" /> {project.role}
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
                        <div className="mb-6 flex flex-wrap gap-1.5 relative z-10">
                            {project.stack.map((tech) => (
                                <span
                                    key={tech}
                                    className="px-2.5 py-1 text-xs font-code font-medium text-[var(--c-ink)]/70 border border-[var(--c-ink)]/15 rounded-full"
                                >
                                    {tech}
                                </span>
                            ))}
                        </div>

                        {/* External Link */}
                        <div className="pb-2 relative z-10">
                            <a
                                href={project.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => { externalLink(); stickerBus.emit('repo-hunter'); }}
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
                        style={FOLD_GRADIENT_MODAL_STYLE}
                    />
                    <div
                        className={`absolute bottom-0 right-0 pointer-events-none z-10 ${project.colorClass}`}
                        style={FOLD_COLOR_MODAL_STYLE}
                    />
                    </div>
                </div>
            )}
        </Modal>
    );
}
