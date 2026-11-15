"use client";

import { useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { Z_INDEX } from '@/lib/designTokens';
import type { ExperienceTimelineCategory, ExperienceTimelineEntry } from '@/lib/experienceTimeline';
import { useAppHaptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import './about/timeline.css';

const CATEGORIES: Record<ExperienceTimelineCategory, { label: string; color: string }> = {
  work: { label: 'Work', color: 'bg-emerald-500' },
  internship: { label: 'Internship', color: 'bg-sky-500' },
  research: { label: 'Research', color: 'bg-violet-500' },
  education: { label: 'Education', color: 'bg-indigo-500' },
  achievement: { label: 'Contests', color: 'bg-amber-500' },
};

const LAYERS = {
  '--tl-base-layer': Z_INDEX.base,
  '--tl-tile-layer': Z_INDEX.texture,
  '--tl-peek-layer': Z_INDEX.binding,
} as CSSProperties;

export default function ExperienceTimeline({ entries }: { entries: readonly ExperienceTimelineEntry[] }) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const { selection, toggle } = useAppHaptics();

  function pin(id: string) {
    if (pinnedId === id) {
      setPinnedId(null);
      toggle();
    } else {
      setPinnedId(id);
      selection();
    }
  }

  return (
    <section id="experience" className="experience-section" aria-labelledby="experience-title" style={LAYERS}>
      <h2 id="experience-title" className="experience-heading font-hand ink-heavy">Experience</h2>
      <ol className="tl">
        {entries.map((entry, index) => {
          const pinned = pinnedId === entry.id;
          const category = CATEGORIES[entry.category];
          return (
            <li className="tl-item" key={entry.id} data-pinned={pinned || undefined}>
              {index < entries.length - 1 && (
                <svg className="tl-seg" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path
                    d={index % 2 === 0 ? 'M20 0 C20 50 80 50 80 100' : 'M80 0 C80 50 20 50 20 100'}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              <span className={cn('tl-node', category.color)} aria-hidden="true" />
              <article
                className="tl-tile shadow-sticker"
                data-pinned={pinned || undefined}
                data-disco-motion="wiggle"
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && pinned) {
                    event.stopPropagation();
                    setPinnedId(null);
                    toggle();
                  }
                }}
              >
                <TapeStrip size="sm" />
                <button
                  className="tl-trigger focus-ring"
                  type="button"
                  aria-expanded={pinned}
                  aria-controls={`tl-d-${entry.id}`}
                  aria-label={`${entry.title}, ${entry.dateLabel}. ${pinned ? 'Hide' : 'Show'} details`}
                  onClick={() => pin(entry.id)}
                >
                  <span className="tl-meta">
                    <span className="font-body">{entry.dateLabel}</span>
                    <span className="tl-category font-hand">{category.label}</span>
                  </span>
                  <span className="tl-title font-hand">{entry.title}</span>
                  <span className="tl-impact font-body">{entry.impact}</span>
                  <ChevronDown className="tl-chevron" size={16} aria-hidden="true" />
                </button>
                <div className="tl-fold">
                  <div className="tl-details" id={`tl-d-${entry.id}`} aria-hidden={!pinned}>
                    <div className="tl-detail-sheet">
                      <div inert={!pinned} className="tl-detail-content font-body">
                        <p className="tl-location">{entry.location}</p>
                        <ul className="tl-highlights">
                          {entry.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                        </ul>
                        <ul className="tl-tools font-code" aria-label="Tools and skills">
                          {entry.tools.map((tool) => <li key={tool}>{tool}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
