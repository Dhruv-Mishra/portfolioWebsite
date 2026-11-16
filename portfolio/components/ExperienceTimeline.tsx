"use client";

import Image from 'next/image';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { FlyoutClose, FlyoutDialog, useFlyout } from '@/components/ui/Flyout';
import { experienceTimelineEntries, type ExperienceTimelineCategory, type ExperienceTimelineEntry } from '@/lib/experienceTimeline';
import './about/timeline.css';

const CATEGORY_LABELS: Record<ExperienceTimelineCategory, string> = {
  work: 'Work',
  internship: 'Internship',
  research: 'Research',
  education: 'Education',
  achievement: 'Contests',
};

/** Hung by hand, so no two hang quite straight. */
const TILTS = [-2.5, 2, -1.25, 3, -2, 1.5];

/** The photo: a logo held up against a soft, lit backdrop, captioned with the role. */
function Picture({ entry, heading }: { entry: ExperienceTimelineEntry; heading: ReactNode }) {
  return (
    <div className="pol-picture">
      <div className="pol-scene">
        <span className="pol-logo" aria-hidden="true">
          {entry.logo ? <Image src={entry.logo} alt="" width={40} height={40} unoptimized /> : <Trophy strokeWidth={1.75} />}
        </span>
        {heading}
      </div>
      <span className="pol-stamp font-code" aria-hidden="true">{CATEGORY_LABELS[entry.category]}</span>
      <span className="pol-develop" aria-hidden="true" />
    </div>
  );
}

/**
 * The experience timeline as instant photos pegged to a line (or clipped to a wire mesh), newest first. Each photo
 * develops as it is hung. Hovering one slides a note out from under it; opening it unclips it and flies it to the
 * middle of the screen with the full story.
 */
export default function ExperienceTimeline() {
  const { openId, open, close, onClose, slotRef, mode, dialogRef, sheetRef, contentRef } = useFlyout();
  const lineRef = useRef<HTMLOListElement>(null);
  const shown = experienceTimelineEntries.find((entry) => entry.id === openId) ?? null;

  // Photos below the fold wait to be hung until the line scrolls in; without script they simply show.
  useEffect(() => {
    const line = lineRef.current;
    if (!line || typeof IntersectionObserver === 'undefined' || line.getBoundingClientRect().top < window.innerHeight) return;
    line.dataset.hang = 'wait';
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      line.dataset.hang = 'go';
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(line);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="experience" className="tl-section" aria-labelledby="experience-title">
      <h2 id="experience-title" className="tl-heading font-hand ink-heavy">Experience</h2>
      <ol ref={lineRef} className="pol-line">
        {experienceTimelineEntries.map((entry, index) => {
          const id = `tl-${entry.id}`;
          return (
            <li
              key={entry.id}
              ref={slotRef(entry.id)}
              className="pol"
              style={{ '--tilt': `${TILTS[index % TILTS.length]}deg`, '--i': index } as CSSProperties}
            >
              <article className="pol-photo" data-flyout-note data-category={entry.category} aria-labelledby={`${id}-title`}>
                <p className="pol-peek note-material font-body" aria-hidden="true">
                  <span className="pol-peek-line">{entry.impact}</span>
                  <span className="pol-peek-hint font-hand">Click to look closer</span>
                </p>
                <div className="pol-frame paper-texture">
                  <Picture
                    entry={entry}
                    heading={(
                      <h3 id={`${id}-title`} className="pol-title font-hand">
                        <button type="button" className="pol-open focus-ring" data-flyout-open aria-haspopup="dialog" aria-describedby={`${id}-when ${id}-impact`} onClick={() => void open(entry.id)}>
                          {entry.title}
                        </button>
                      </h3>
                    )}
                  />
                  <p id={`${id}-when`} className="pol-date font-hand">{entry.dateLabel}</p>
                  <p id={`${id}-impact`} className="sr-only">{entry.impact}</p>
                </div>
              </article>
              <span aria-hidden="true" className="pol-peg" data-fastener="clip" />
            </li>
          );
        })}
      </ol>

      <FlyoutDialog dialogRef={dialogRef} mode={mode} onDismiss={close} onClose={onClose} labelledBy={shown ? `tl-${shown.id}-sheet` : undefined}>
        {shown ? (
          <article ref={sheetRef} className="flyout-sheet pol-sheet paper-texture" data-category={shown.category}>
            <div ref={contentRef} className="pol-sheet-content">
              <FlyoutClose onClose={close} label="Close photo" />
              <Picture entry={shown} heading={<h2 id={`tl-${shown.id}-sheet`} className="pol-title font-hand">{shown.title}</h2>} />
              <div className="pol-sheet-body font-body">
                <p className="pol-sheet-when font-hand">{shown.dateLabel}</p>
                <p className="pol-sheet-where">{shown.organization}, {shown.location}</p>
                <ul className="pol-sheet-highlights">
                  {shown.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                </ul>
                <ul className="pol-sheet-tools font-code" aria-label="Tools and skills">
                  {shown.tools.map((tool) => <li key={tool}>{tool}</li>)}
                </ul>
              </div>
            </div>
          </article>
        ) : null}
      </FlyoutDialog>
    </section>
  );
}
