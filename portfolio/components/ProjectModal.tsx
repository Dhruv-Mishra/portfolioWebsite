"use client";
import { Play, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import Image from 'next/image';
import MediaCarousel, { type MediaCarouselHandle, type MediaSlide } from '@/components/MediaCarousel';
import { Modal } from '@/components/ui/Modal';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { unlockSticker, useMasterVolume, useSoundsMuted } from '@/hooks/useStickers';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { Z_INDEX } from '@/lib/designTokens';
import { useAppHaptics } from '@/lib/haptics';
import { getProjectVideoSources, type ProjectRecord } from '@/lib/projects';
import {
  CONTROL_PROJECT_VIDEO_EVENT,
  attachSiteActionResult,
  registerSiteActionHost,
  type ControlProjectVideoEventDetail,
} from '@/lib/siteActionEvents';
import type { SiteToolResult } from '@/lib/siteTools';
import '@/components/projects/projects.css';

interface ProjectModalProps {
  /** null hides the dialog. */
  project: ProjectRecord | null;
  onClose: () => void;
}

const VIDEO_UNAVAILABLE = 'project-video-unavailable';
const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;

export default function ProjectModal({ project, onClose }: ProjectModalProps) {
  const titleId = useId();
  return (
    <Modal
      isOpen={project !== null}
      onClose={onClose}
      className="project-modal font-hand"
      ariaLabelledBy={titleId}
      backdropClassName="bg-black/60"
    >
      {/* Keyed so switching projects (voice can) resets the video and carousel state. */}
      {project ? <ProjectSheet key={project.slug} project={project} titleId={titleId} onClose={onClose} /> : null}
    </Modal>
  );
}

function ProjectSheet({ project, titleId, onClose }: { project: ProjectRecord; titleId: string; onClose: () => void }) {
  const highlightsId = useId();
  const { externalLink, selection, tap } = useAppHaptics();
  const reducedMotion = useEffectiveReducedMotion();
  const masterVolume = useMasterVolume();
  const soundsMuted = useSoundsMuted();
  const volume = soundsMuted ? 0 : masterVolume;
  const videoSources = getProjectVideoSources(project);
  const hasVideo = videoSources !== null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const carouselRef = useRef<MediaCarouselHandle>(null);
  const mutedRef = useRef(true);
  const volumeRef = useRef(volume);
  // Bumped by every play/pause request so a late play() promise cannot override a newer one.
  const playGeneration = useRef(0);
  const [muted, setMutedState] = useState(true);
  // Reduced motion never autoplays: the poster waits behind a play button.
  const [showPlay, setShowPlay] = useState(reducedMotion);

  const play = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) return false;
    const generation = ++playGeneration.current;
    video.muted = mutedRef.current;
    video.volume = volumeRef.current;
    try {
      await video.play();
    } catch {
      // Autoplay can be blocked; fall back to a manual play affordance.
      if (generation === playGeneration.current) setShowPlay(true);
      return false;
    }
    if (generation !== playGeneration.current) return false;
    setShowPlay(false);
    return true;
  }, []);

  const pause = useCallback((showButton: boolean) => {
    const video = videoRef.current;
    if (!video) return false;
    playGeneration.current += 1;
    video.pause();
    if (showButton) setShowPlay(true);
    return true;
  }, []);

  const setMuted = useCallback((next: boolean) => {
    const video = videoRef.current;
    if (!video) return false;
    selection();
    mutedRef.current = next;
    video.muted = next;
    setMutedState(next);
    return true;
  }, [selection]);

  useEffect(() => {
    volumeRef.current = volume;
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  // Switching projects in an open dialog unmounts the focused control; keep focus inside the dialog.
  useEffect(() => {
    if (document.activeElement === document.body) closeRef.current?.focus();
  }, []);

  const autoplay = useEffectEvent(() => {
    if (!reducedMotion) void play();
  });

  // The video is slide 0: it plays on open and whenever it is swiped back into view.
  useEffect(() => {
    autoplay();
    const video = videoRef.current;
    return () => {
      playGeneration.current += 1;
      video?.pause();
    };
  }, []);

  const handleSlideChange = useCallback((index: number) => {
    if (index === 0) {
      if (!reducedMotion) void play();
      return;
    }
    pause(false);
  }, [pause, play, reducedMotion]);

  const onVideoControl = useEffectEvent((event: Event) => {
    if (event.defaultPrevented) return;
    const action = (event as CustomEvent<ControlProjectVideoEventDetail>).detail?.action;
    if (!action) return;
    if (action === 'play') {
      carouselRef.current?.goTo(0);
      // Claimed now; the result settles once video.play() does.
      attachSiteActionResult(event, play().then((played): SiteToolResult => (played
        ? { ok: true, spokenText: 'Playing the preview.', data: { action, nextAction: 'Want me to mute or pause it?' } }
        : { ok: false, spokenText: 'I could not play that preview.', errorCode: VIDEO_UNAVAILABLE })));
      return;
    }
    if (action === 'pause') {
      attachSiteActionResult(event, pause(true)
        ? { ok: true, spokenText: 'Paused the preview.', data: { action, nextAction: 'Want me to play it again?' } }
        : { ok: false, spokenText: 'I could not pause that preview.', errorCode: VIDEO_UNAVAILABLE });
      return;
    }
    const mute = action === 'mute';
    attachSiteActionResult(event, setMuted(mute)
      ? { ok: true, spokenText: mute ? 'Muted the preview.' : 'Unmuted the preview.', data: { action } }
      : { ok: false, spokenText: `I could not ${action} that preview.`, errorCode: VIDEO_UNAVAILABLE });
  });

  useEffect(() => {
    if (!hasVideo) return;
    const unregister = registerSiteActionHost('project-video');
    const handler = (event: Event) => onVideoControl(event);
    window.addEventListener(CONTROL_PROJECT_VIDEO_EVENT, handler);
    return () => {
      unregister();
      window.removeEventListener(CONTROL_PROJECT_VIDEO_EVENT, handler);
    };
  }, [hasVideo]);

  const slides: MediaSlide[] = [];
  if (videoSources) {
    slides.push({
      key: 'video',
      label: 'preview video',
      content: (
        <>
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="metadata"
            poster={project.image}
            className="h-full w-full object-cover"
          >
            {videoSources.map((source) => <source key={source.src} src={source.src} type={source.type} />)}
          </video>
          {showPlay ? (
            <button
              type="button"
              onClick={() => { tap(); void play(); }}
              aria-label={`Play ${project.name} preview video`}
              data-clickable
              className="project-video-play focus-ring"
              style={{ zIndex: Z_INDEX.content }}
            >
              <span>
                <Play size={18} fill="currentColor" aria-hidden="true" />
                Play preview
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMuted(!mutedRef.current)}
            aria-label={muted ? 'Unmute video' : 'Mute video'}
            data-clickable
            className="project-video-mute project-media-control focus-ring"
            style={{ zIndex: Z_INDEX.crease }}
          >
            {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
          </button>
        </>
      ),
    });
  }
  slides.push({
    key: 'image',
    label: 'still image',
    content: (
      <Image
        src={project.image}
        alt={`${project.name} preview`}
        fill
        sizes="(max-width: 767px) 94vw, 41rem"
        placeholder="blur"
        blurDataURL={project.blurDataURL}
        className="object-cover"
      />
    ),
  });

  return (
    <>
      <span aria-hidden="true" data-tape-strip className="project-sheet-tape" style={TAPE_STYLE_DECOR} />
      <article className="project-sheet" data-site-context="project-preview" data-site-project={project.slug}>
        <div className="project-sheet-close-bar">
          <button ref={closeRef} type="button" onClick={onClose} className="project-sheet-close focus-ring" aria-label="Close project" data-clickable>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="project-sheet-media">
          <div className="project-sheet-media-frame">
            <MediaCarousel ref={carouselRef} slides={slides} label={`${project.name} media`} onActiveChange={handleSlideChange} />
          </div>
        </div>
        <h2 id={titleId} className="project-sheet-title ink-heavy">{project.name}</h2>
        <p className="project-sheet-meta font-body">
          {project.role}, {project.year}{project.duration === 'Ongoing' ? ' to now' : `, ${project.duration}`}
        </p>
        <p className="project-sheet-details font-body">{project.details}</p>
        {project.highlights.length > 0 ? (
          <section aria-labelledby={highlightsId}>
            <h3 id={highlightsId} className="project-sheet-subtitle">Highlights</h3>
            <ul className="project-sheet-highlights font-body">
              {project.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
            </ul>
          </section>
        ) : null}
        <ul className="project-sheet-stack font-code" aria-label="Tech stack">
          {project.stack.map((tech) => <li key={tech}>{tech}</li>)}
        </ul>
        <div className="project-sheet-actions">
          {project.demo ? (
            <a href={project.demo} target="_blank" rel="noopener noreferrer" onClick={externalLink} className="project-sheet-demo focus-ring" data-clickable>
              <span aria-hidden="true" data-tape-strip style={TAPE_STYLE_DECOR} />
              Try the live demo{NEW_TAB}
            </a>
          ) : null}
          <a
            href={project.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { externalLink(); unlockSticker('repo-hunter'); }}
            className="project-sheet-source focus-ring"
            data-clickable
          >
            {project.linkLabel ?? 'Source code'}{NEW_TAB}
          </a>
        </div>
      </article>
    </>
  );
}
