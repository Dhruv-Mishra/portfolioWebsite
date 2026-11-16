import type { CSSProperties } from 'react';
import Image from 'next/image';
import { Activity, Bot, Database, ExternalLink, Film, Gamepad2, Globe, Maximize2, Mic, ScrollText, Scissors, Search, Smartphone, type LucideIcon } from 'lucide-react';
import ProjectGridController from '@/components/ProjectGridController';
import { MarkedText } from '@/components/ui/MarkedText';
import { TAPE_CLIP_PATH } from '@/lib/constants';
import { PROJECT_TOKENS } from '@/lib/designTokens';
import { pageMetadata } from '@/lib/pageMetadata';
import type { ProjectSlug } from '@/lib/projectCatalog';
import { PROJECTS, getProjectThumbnail } from '@/lib/projects';
import { buildProjectHref } from '@/lib/siteActionEvents';
import '@/components/projects/projects.css';

export const metadata = pageMetadata({
  title: 'Projects | Dhruv Mishra',
  description: 'Projects by Dhruv Mishra: Invoke (voice-controlled coding agents), Jarvis (a voice dispatch agent), this site\'s live voice agent, Port Solace (a co-op voxel game in the browser), Fluent UI Android, and concurrency research.',
  path: '/projects',
});

const ICONS: Record<ProjectSlug, LucideIcon> = {
  'jarvis-voice-agent': Mic,
  'personal-portfolio': Globe,
  invoke: Bot,
  cropio: Scissors,
  'port-solace': Gamepad2,
  'fluent-ui-android': Smartphone,
  'bloom-filter-research': ScrollText,
  'ivc-vital-checkup': Activity,
  'hybrid-recommender': Film,
  'course-evaluator': Search,
  atomvault: Database,
};

/** Next preloads eager images in <head>, where they compete with render-blocking CSS, so only the first photo is eager. */
const EAGER_IMAGES = 1;
/** The card that wears a coffee ring once wear is on. */
const STAINED = 4;
// Inherited by every note's tape so the long polygon ships once instead of per note.
const WALL_STYLE = { '--tape-clip': TAPE_CLIP_PATH } as CSSProperties;

const cycle = <T,>(list: readonly T[], index: number): T => list[index % list.length];

const NOTE_STYLES = PROJECTS.map((_, index) => ({
  '--note-tilt': `${cycle(PROJECT_TOKENS.rotations, index)}deg`,
  '--photo-tilt': `${cycle(PROJECT_TOKENS.photoRotations, index)}deg`,
  '--tape-x': `${cycle(PROJECT_TOKENS.tapePositions, index)}%`,
  '--note-drop': `${cycle(PROJECT_TOKENS.drops, index)}px`,
  '--torn-x': `${index * 67}px`,
  '--enter-delay': `${Math.min(index, 6) * 70}ms`,
}) as CSSProperties);

export default function Projects() {
  return (
    <div className="project-wall" style={WALL_STYLE}>
      <h1 className="project-wall-title font-hand ink-heavy">My Projects</h1>
      <ul className="project-cards">
        {PROJECTS.map((project, index) => {
          const eager = index < EAGER_IMAGES;
          const id = `project-${project.slug}`;
          const Icon = ICONS[project.slug];
          return (
            <li key={project.slug} style={NOTE_STYLES[index]}>
              <article
                className="project-card"
                data-project-card={project.slug}
                data-accent={project.accent}
                data-torn-host
                data-hover-tilt
                data-tilt-3d="paper"
                data-disco-motion="wiggle"
                aria-labelledby={`${id}-name`}
              >
                <span aria-hidden="true" data-tape-strip data-fastener="tape" className="project-card-tape" />
                <div className="project-card-paper note-material" data-torn-edge={index % 2 ? 'bottom' : 'top'}>
                  <span aria-hidden="true" data-tilt-sheen />
                  {index === STAINED ? <span aria-hidden="true" className="stain project-card-stain" /> : null}
                  <div className="project-card-photo">
                    <div className="project-card-image">
                      <Image
                        src={getProjectThumbnail(project)}
                        alt={`${project.name} preview`}
                        fill
                        sizes="(max-width: 639px) calc(100vw - 6.5rem), (max-width: 819px) 540px, (max-width: 1279px) 345px, 300px"
                        loading={eager ? 'eager' : 'lazy'}
                        fetchPriority={eager ? 'high' : 'auto'}
                        // Each blur placeholder inlines ~1KB; lazy notes load before they scroll in, over a tinted frame.
                        placeholder={eager ? 'blur' : 'empty'}
                        blurDataURL={eager ? project.blurDataURL : undefined}
                        className="object-cover"
                      />
                      <span aria-hidden="true" className="project-card-play" />
                    </div>
                  </div>
                  <div className="project-card-head">
                    <h2 id={`${id}-name`} className="project-card-name font-hand ink-heavy">
                      <a
                        href={buildProjectHref(project.slug)}
                        data-project-slug={project.slug}
                        aria-describedby={`${id}-desc`}
                        className="project-card-link"
                      >
                        <span>{project.name}</span>
                      </a>
                    </h2>
                    <span className="project-card-label font-hand"><Icon aria-hidden="true" />{project.label}</span>
                  </div>
                  <p className="project-card-lang font-hand">{project.lang}</p>
                  <p id={`${id}-desc`} className="project-card-desc font-body"><MarkedText text={project.details} /></p>
                  <ul className="project-card-stack font-code" aria-label="Tech stack">
                    {project.stack.map((tech) => <li key={tech}>{tech}</li>)}
                  </ul>
                  <div className="project-card-actions font-hand">
                    <a href={project.link} target="_blank" rel="noopener noreferrer" className="project-card-action focus-ring">
                      {project.linkLabel === 'Read the paper' ? 'Paper' : 'Source'}
                      <ExternalLink aria-hidden="true" />
                      <span className="sr-only"> for {project.name} (opens in a new tab)</span>
                    </a>
                    {project.demo ? (
                      <a href={project.demo} target="_blank" rel="noopener noreferrer" className="project-card-action focus-ring">
                        Live demo
                        <ExternalLink aria-hidden="true" />
                        <span className="sr-only"> of {project.name} (opens in a new tab)</span>
                      </a>
                    ) : null}
                    <span aria-hidden="true" className="project-card-more"><Maximize2 />Read more</span>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      <ProjectGridController />
    </div>
  );
}
