import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { HandDrawnArrow } from '@/components/SketchbookDoodles';
import ProjectGridController from '@/components/ProjectGridController';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { PIN_COLORS, PROJECT_TOKENS } from '@/lib/designTokens';
import { PROJECTS } from '@/lib/projects';
import '@/components/projects/projects.css';

const PINS = Object.values(PIN_COLORS);

export default function Projects() {
  return (
    <section className="projects-sheet shadow-sheet" aria-labelledby="projects-title">
      <span aria-hidden="true" data-tape-strip className="projects-sheet-tape" style={TAPE_STYLE_DECOR} />
      <header className="projects-header">
        <h1 id="projects-title" className="font-hand ink-heavy">Things I&apos;ve built</h1>
        <div className="projects-instruction font-hand">
          <p>Open a polaroid for the full story.</p>
          <span aria-hidden="true"><HandDrawnArrow className="projects-arrow" /></span>
        </div>
      </header>
      <ProjectGridController>
        <ul className="projects-grid">
          {PROJECTS.map((project, index) => (
            <li
              key={project.slug}
              className="project-placement"
              style={{ '--project-rest': `${PROJECT_TOKENS.rotations[index % PROJECT_TOKENS.rotations.length]}deg` } as CSSProperties}
            >
              <Link
                href={`/projects?project=${project.slug}`}
                scroll={false}
                prefetch={false}
                data-project-slug={project.slug}
                data-hover-tilt
                data-tilt-3d="paper"
                data-disco-motion="wiggle"
                className="project-card focus-ring"
              >
                <span aria-hidden="true" data-tilt-sheen />
                <svg aria-hidden="true" className="project-pin" viewBox="0 0 18 18" fill="none" style={{ color: PINS[index % PINS.length] }}>
                  <circle cx="9" cy="9" r="8" fill="currentColor" />
                  <circle cx="9" cy="9" r="7.5" stroke="var(--c-polaroid-ink)" strokeOpacity=".2" />
                  <path d="M5 7a4 4 0 0 1 5-2" stroke="var(--c-polaroid)" strokeWidth="1" strokeLinecap="round" />
                  <circle cx="9" cy="9" r="2" fill="var(--c-polaroid-ink)" fillOpacity=".15" />
                </svg>
                <div className="project-photo shadow-polaroid">
                  <div className="project-image">
                    <Image
                      src={project.image}
                      alt={`${project.name} project screenshot`}
                      fill
                      sizes="(max-width: 767px) 112px, (max-width: 1023px) 44vw, 285px"
                      priority={index === 0}
                      placeholder="blur"
                      blurDataURL={project.blurDataURL}
                      className="object-cover"
                    />
                  </div>
                </div>
                <div className="project-caption">
                  <div className="project-name-row">
                    <h2 className="project-name font-hand">{project.name}</h2>
                    {project.demo ? <span className="project-demo-tag font-hand" style={TAPE_STYLE_DECOR}>Live demo</span> : null}
                  </div>
                  <p className="project-summary font-body line-clamp-3">{project.summary}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </ProjectGridController>
    </section>
  );
}
