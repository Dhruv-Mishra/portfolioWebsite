"use client";

import Image from 'next/image';
import { useState, type KeyboardEvent } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import { experienceTimelineEntries, type ExperienceTimelineCategory, type ExperienceTimelineEntry } from '@/lib/experienceTimeline';
import { useAppHaptics } from '@/lib/haptics';
import './about/timeline.css';

const CATEGORY_LABELS: Record<ExperienceTimelineCategory, string> = {
  work: 'Work',
  internship: 'Internship',
  research: 'Research',
  education: 'Education',
  achievement: 'Contests',
};

export default function ExperienceTimeline() {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const { selection, toggle } = useAppHaptics();

  function setPinned(id: string | null) {
    setPinnedId(id);
    if (id) selection();
    else toggle();
  }

  return (
    <section id="experience" className="tl-section" aria-labelledby="experience-title">
      <h2 id="experience-title" className="tl-heading font-hand ink-heavy">Experience</h2>
      <ol className="tl">
        {experienceTimelineEntries.map((entry, index) => (
          <TimelineItem
            key={entry.id}
            entry={entry}
            pinned={pinnedId === entry.id}
            last={index === experienceTimelineEntries.length - 1}
            onPinnedChange={(pinned) => setPinned(pinned ? entry.id : null)}
          />
        ))}
      </ol>
    </section>
  );
}

interface TimelineItemProps {
  entry: ExperienceTimelineEntry;
  pinned: boolean;
  last: boolean;
  onPinnedChange: (pinned: boolean) => void;
}

function TimelineItem({ entry, pinned, last, onPinnedChange }: TimelineItemProps) {
  const id = `tl-${entry.id}`;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape' || !pinned) return;
    event.stopPropagation();
    onPinnedChange(false);
  }

  return (
    <li className="tl-item" data-category={entry.category} data-pinned={pinned || undefined}>
      {!last && (
        <svg className="tl-seg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 0C0 50 100 50 100 100" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <span className="tl-node" aria-hidden="true" />
      <button
        type="button"
        className="tl-tab focus-ring"
        data-disco-motion="wiggle"
        aria-expanded={pinned}
        aria-controls={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-when ${id}-impact`}
        onClick={() => onPinnedChange(!pinned)}
        onKeyDown={onKeyDown}
      >
        <span className="tl-tape font-hand">{CATEGORY_LABELS[entry.category]}</span>
        <span className="tl-logo" aria-hidden="true">
          {entry.logo
            ? <Image src={entry.logo} alt="" width={20} height={20} />
            : <Trophy strokeWidth={1.75} />}
        </span>
        <span className="tl-when font-body" id={`${id}-when`}>{entry.dateLabel}</span>
        <span className="tl-title font-hand" id={`${id}-title`}>{entry.title}</span>
        <span className="tl-impact font-body" id={`${id}-impact`}>{entry.impact}</span>
        <ChevronDown className="tl-chevron" aria-hidden="true" />
      </button>
      <div className="tl-fold">
        <div className="tl-fold-track">
          <div className="tl-sheet font-body" id={id} inert={!pinned}>
            <p className="tl-where">{entry.organization}, {entry.location}</p>
            <ul className="tl-highlights">
              {entry.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
            </ul>
            <ul className="tl-tools font-code" aria-label="Tools and skills">
              {entry.tools.map((tool) => <li key={tool}>{tool}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </li>
  );
}
