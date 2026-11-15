import type { CSSProperties } from 'react';
import Image from 'next/image';
import ProjectGridController from '@/components/ProjectGridController';
import { TAPE_CLIP_PATH } from '@/lib/constants';
import { PROJECT_TOKENS } from '@/lib/designTokens';
import { pageMetadata } from '@/lib/pageMetadata';
import { PROJECTS } from '@/lib/projects';
import { buildProjectHref } from '@/lib/siteActionEvents';
import '@/components/projects/projects.css';

export const metadata = pageMetadata({
  title: 'Projects | Dhruv Mishra',
  description: 'Projects by Dhruv Mishra: Invoke (voice-controlled coding agents), Jarvis (a voice dispatch agent), this site\'s live voice agent, Port Solace (a co-op voxel game in the browser), Fluent UI Android, and concurrency research.',
  path: '/projects',
});

/** Next preloads eager images in <head>, where they compete with render-blocking CSS, so only the first photo is eager. */
const EAGER_IMAGES = 1;
// Inherited by every note's tape so the long polygon ships once instead of per note.
const WALL_STYLE = { '--tape-clip': TAPE_CLIP_PATH } as CSSProperties;

const cycle = <T,>(list: readonly T[], index: number): T => list[index % list.length];

const NOTE_STYLES = PROJECTS.map((_, index) => ({
  '--note-tilt': `${cycle(PROJECT_TOKENS.rotations, index)}deg`,
  '--photo-tilt': `${cycle(PROJECT_TOKENS.photoRotations, index)}deg`,
  '--tape-x': `${cycle(PROJECT_TOKENS.tapePositions, index)}%`,
  '--note-drop': `${cycle(PROJECT_TOKENS.drops, index)}px`,
}) as CSSProperties);

export default function Projects() {
  return (
    <div className="project-wall" style={WALL_STYLE}>
      <h1 className="sr-only">Projects</h1>
      <ul className="project-notes">
        {PROJECTS.map((project, index) => {
          const eager = index < EAGER_IMAGES;
          const id = `project-${project.slug}`;
          return (
            <li key={project.slug} style={NOTE_STYLES[index]}>
              <a
                href={buildProjectHref(project.slug)}
                data-project-slug={project.slug}
                data-hover-tilt
                data-tilt-3d="paper"
                data-disco-motion="wiggle"
                aria-labelledby={`${id}-name`}
                aria-describedby={`${id}-summary`}
                className="project-note focus-ring"
              >
                <span aria-hidden="true" data-tape-strip className="project-note-tape" />
                <div className="project-note-paper">
                  <span aria-hidden="true" data-tilt-sheen />
                  <span className="project-note-photo">
                    <span className="project-note-image">
                      <Image
                        src={project.image}
                        alt={`${project.name} preview`}
                        fill
                        sizes="(max-width: 595px) 120px, (max-width: 1279px) 38vw, 340px"
                        loading={eager ? 'eager' : 'lazy'}
                        fetchPriority={eager ? 'high' : 'auto'}
                        // Each blur placeholder inlines ~1KB; lazy notes load before they scroll in, over a tinted frame.
                        placeholder={eager ? 'blur' : 'empty'}
                        blurDataURL={eager ? project.blurDataURL : undefined}
                        className="object-cover"
                      />
                      <span aria-hidden="true" className="project-note-play" />
                    </span>
                  </span>
                  <div className="project-note-text">
                    <div className="project-note-head">
                      <h2 id={`${id}-name`} className="project-note-name font-hand ink-heavy">{project.name}</h2>
                      {project.demo ? <span className="project-note-demo font-hand">Live demo</span> : null}
                    </div>
                    <p id={`${id}-summary`} className="project-note-summary font-body">{project.summary}</p>
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      <ProjectGridController />
    </div>
  );
}
