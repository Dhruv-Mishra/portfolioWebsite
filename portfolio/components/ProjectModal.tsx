"use client";
import { X, Play, Volume2, VolumeX } from 'lucide-react';
import { useIsPresent } from 'framer-motion';
import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import Image from 'next/image';
import { useAppHaptics } from '@/lib/haptics';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { Z_INDEX } from '@/lib/designTokens';
import '@/components/projects/projects.css';
import { Modal } from '@/components/ui/Modal';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import MediaCarousel, { type MediaCarouselHandle, type MediaSlide } from '@/components/MediaCarousel';
import type { ProjectRecord } from '@/lib/projects';
import { getProjectVideoSources } from '@/lib/projects';
import {
  CONTROL_PROJECT_VIDEO_EVENT,
  attachSiteActionResult,
  registerSiteActionHost,
  type ControlProjectVideoEventDetail,
} from '@/lib/siteActionEvents';
import type { SiteToolResult } from '@/lib/siteTools';
import { unlockSticker, useMasterVolume, useSoundsMuted } from '@/hooks/useStickers';

interface ProjectModalProps {
    /** Pass null when no project is selected — the modal will be hidden */
    project: ProjectRecord | null;
    onClose: () => void;
}

const VIDEO_PLAY_RETRY_MS = 1000;
const VIDEO_PLAY_RETRY_STEP_MS = 50;

function ProjectSheet({ project, children }: { project: ProjectRecord; children: ReactNode }) {
    const isPresent = useIsPresent();
    return (
        <div
            className="project-modal-sheet"
            data-project-exiting={!isPresent || undefined}
            data-site-context="project-preview"
            data-site-project={project.slug}
        >
            {children}
        </div>
    );
}

export default function ProjectModal({ project, onClose }: ProjectModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const carouselRef = useRef<MediaCarouselHandle>(null);
    const isMutedRef = useRef(true);
    const playGenerationRef = useRef(0);
    const { externalLink, selection, tap } = useAppHaptics();
    const masterVolume = useMasterVolume();
    const soundsMuted = useSoundsMuted();
    const volumeRef = useRef(soundsMuted ? 0 : masterVolume);
    const [isMuted, setIsMuted] = useState(true);
    const reducedMotion = useEffectiveReducedMotion();
    const [showPlayButton, setShowPlayButton] = useState(false);
    const [hasMountedVideo, setHasMountedVideo] = useState(false);

    const applyVideoMasterVolume = useCallback((node: HTMLVideoElement | null) => {
        if (!node) return;
        node.volume = volumeRef.current;
    }, []);

    const videoSources = project ? getProjectVideoSources(project) : null;
    const hasVideo = videoSources !== null;
    const videoSrc = videoSources?.[0].src ?? '';

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
        const playGeneration = ++playGenerationRef.current;
        const deadline = Date.now() + VIDEO_PLAY_RETRY_MS;
        let video = videoRef.current;
        while (!video) {
            if (playGeneration !== playGenerationRef.current) return false;
            if (Date.now() >= deadline) return false;
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, VIDEO_PLAY_RETRY_STEP_MS);
            });
            video = videoRef.current;
        }

        if (playGeneration !== playGenerationRef.current) return false;
        tap();
        video.muted = isMutedRef.current;
        applyVideoMasterVolume(video);

        try {
            await video.play();
            if (playGeneration !== playGenerationRef.current || videoRef.current !== video) return false;
            setShowPlayButton(false);
            return true;
        } catch {
            if (playGeneration !== playGenerationRef.current || videoRef.current !== video) return false;
            setShowPlayButton(true);
            return false;
        }
    }, [applyVideoMasterVolume, tap]);

    const reportPlayResult = useCallback(async (): Promise<SiteToolResult> => {
        carouselRef.current?.goTo(0);
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
            if (event.defaultPrevented) return;
            const action = event.detail?.action;
            if (!action) return;

            let result: SiteToolResult;
            if (action === 'play') {
                // Claim now; the thenable settles only after video.play() resolves.
                attachSiteActionResult(event, reportPlayResult());
                return;
            }
            if (action === 'pause') {
                attachSiteActionResult(event, Promise.resolve(pauseVideo()
                    ? { ok: true, spokenText: 'Paused the preview.', data: { action, nextAction: 'Want me to play it again?' } }
                    : { ok: false, spokenText: 'I could not pause that preview.', errorCode: 'project-video-unavailable' }));
                return;
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
        const playGeneration = ++playGenerationRef.current;
        node.muted = muted;
        applyVideoMasterVolume(node);
        if (reducedMotion) {
            setShowPlayButton(true);
            return;
        }
        void node.play()
            .then(() => {
                if (playGeneration !== playGenerationRef.current || videoRef.current !== node) return;
                setShowPlayButton(false);
            })
            .catch(() => {
                if (playGeneration !== playGenerationRef.current || videoRef.current !== node) return;
                // Browser may block autoplay — show a manual play affordance.
                setShowPlayButton(true);
            });
    }, [applyVideoMasterVolume, reducedMotion]);

    // Callback ref — fires when the <video> DOM node mounts inside the portal.
    const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
        const previousVideo = videoRef.current;
        if (previousVideo !== node) playGenerationRef.current += 1;
        if (previousVideo && previousVideo !== node) {
            previousVideo.pause();
        }

        videoRef.current = node;
        setHasMountedVideo(node !== null);
        if (node) {
            setShowPlayButton(false);
            attemptAutoplay(node, isMutedRef.current);
        }
    }, [attemptAutoplay]);

    useEffect(() => {
        return () => {
            playGenerationRef.current += 1;
        };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!project || !hasVideo || !video) return;
        video.pause();
        video.currentTime = 0;
        isMutedRef.current = true;
        video.muted = true;
        setIsMuted(true);
        setShowPlayButton(false);
        attemptAutoplay(video, true);
    }, [attemptAutoplay, hasVideo, project, videoSrc]);

    useEffect(() => {
        volumeRef.current = soundsMuted ? 0 : masterVolume;
        applyVideoMasterVolume(videoRef.current);
    }, [applyVideoMasterVolume, masterVolume, soundsMuted]);

    // The video is always slide 0: play it while it is in view, pause it once swiped away.
    const handleSlideChange = useCallback((index: number) => {
        const video = videoRef.current;
        if (!video) return;
        if (index === 0) {
            attemptAutoplay(video, isMutedRef.current);
            return;
        }
        playGenerationRef.current += 1;
        video.pause();
        setShowPlayButton(false);
    }, [attemptAutoplay]);

    const mediaSlides: MediaSlide[] = [];
    if (project && videoSources) {
        mediaSlides.push({
            key: 'video',
            label: 'preview video',
            content: (
                <>
                    <video
                        key={videoSrc}
                        ref={setVideoRef}
                        muted={isMuted}
                        loop
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                    >
                        {videoSources.map((source) => (
                            <source key={source.src} src={source.src} type={source.type} />
                        ))}
                    </video>
                    {showPlayButton ? (
                        <button
                            onClick={playVideo}
                            aria-label={`Play ${project.name} preview video`}
                            data-clickable
                            className="project-video-play focus-ring font-hand"
                            style={{ zIndex: Z_INDEX.content }}
                        >
                            <span className="font-hand">
                                <Play size={18} fill="currentColor" />
                                Play preview
                            </span>
                        </button>
                    ) : null}
                    <button
                        onClick={toggleMute}
                        aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                        data-clickable
                        className="project-video-mute project-media-control focus-ring"
                        style={{ zIndex: Z_INDEX.crease }}
                    >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                </>
            ),
        });
    }
    if (project) {
        mediaSlides.push({
            key: 'image',
            label: 'project image',
            content: (
                <Image
                    src={project.image}
                    alt={`${project.name} project preview`}
                    fill
                    sizes="(max-width: 768px) 90vw, 720px"
                    placeholder="blur"
                    blurDataURL={project.blurDataURL}
                    className="object-cover"
                />
            ),
        });
    }

    return (
        <Modal
            isOpen={project !== null}
            onClose={onClose}
            className="project-modal font-hand"
            ariaLabelledBy={project ? 'project-modal-title' : undefined}
            backdropClassName="bg-black/60"
        >
            {project ? (
                <ProjectSheet project={project}>
                    <span aria-hidden="true" data-tape-strip className="project-modal-tape" style={TAPE_STYLE_DECOR} />
                    <div className="project-modal-toolbar" style={{ zIndex: Z_INDEX.content }}>
                        <button type="button" onClick={onClose} className="project-modal-close focus-ring" aria-label="Close project note" data-clickable>
                            <X size={20} />
                        </button>
                    </div>
                    <div className="project-modal-media">
                        <div className="project-modal-media-frame">
                            <MediaCarousel
                                key={project.slug}
                                ref={carouselRef}
                                slides={mediaSlides}
                                label={`${project.name} media`}
                                onActiveChange={handleSlideChange}
                            />
                        </div>
                    </div>
                    <h2 id="project-modal-title" className="project-modal-title font-hand ink-heavy">{project.name}</h2>
                    <p className="project-modal-meta font-body">
                        {project.role}, {project.year}{project.duration === 'Ongoing' ? ' to now' : `, ${project.duration}`}
                    </p>
                    <p className="project-modal-details font-body">{project.details}</p>
                    {project.highlights.length > 0 ? (
                        <section className="project-highlights-section" aria-labelledby="project-highlights-title">
                            <h3 id="project-highlights-title" className="project-highlights-title font-hand">Highlights</h3>
                            <ul className="project-highlights font-body">
                                {project.highlights.map(highlight => <li key={highlight}>{highlight}</li>)}
                            </ul>
                        </section>
                    ) : null}
                    <div className="project-stack font-code" aria-label="Technology stack">
                        {project.stack.map(tech => <span key={tech}>{tech}</span>)}
                    </div>
                    <div className="project-actions font-hand">
                        {project.demo ? (
                            <a href={project.demo} target="_blank" rel="noopener noreferrer" onClick={externalLink} className="project-demo-button focus-ring" data-clickable>
                                <span aria-hidden="true" data-tape-strip style={TAPE_STYLE_DECOR} />
                                Live demo
                            </a>
                        ) : null}
                        <a
                            href={project.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => { externalLink(); unlockSticker('repo-hunter'); }}
                            className="project-source-link focus-ring"
                            data-clickable
                        >
                            {project.linkLabel ?? 'Source code'}
                        </a>
                    </div>
                </ProjectSheet>
            ) : null}
        </Modal>
    );
}
