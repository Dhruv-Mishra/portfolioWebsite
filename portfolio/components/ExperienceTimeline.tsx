"use client";

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AnimatePresence, m, type Variants } from 'framer-motion';
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Filter,
  GraduationCap,
  MapPin,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { TapeStrip } from '@/components/ui/TapeStrip';
import type { ExperienceTimelineCategory, ExperienceTimelineEntry } from '@/lib/experienceTimeline';
import { useAppHaptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

type TimelineFilter = 'all' | ExperienceTimelineCategory;

interface FilterOption {
  id: TimelineFilter;
  label: string;
  icon: LucideIcon;
}

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  chipClassName: string;
  dotClassName: string;
  shadowClassName: string;
}

interface ExperienceTimelineProps {
  entries: readonly ExperienceTimelineEntry[];
}

interface GrowIndigoWordmarkProps {
  className?: string;
}

const FILTER_OPTIONS: readonly FilterOption[] = [
  { id: 'all', label: 'All', icon: Filter },
  { id: 'work', label: 'Work', icon: BriefcaseBusiness },
  { id: 'internship', label: 'Internship', icon: Sparkles },
  { id: 'research', label: 'Research', icon: Sparkles },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'achievement', label: 'Awards', icon: Trophy },
];

const CATEGORY_META: Record<ExperienceTimelineCategory, CategoryMeta> = {
  work: {
    label: 'Work',
    icon: BriefcaseBusiness,
    chipClassName: 'border-emerald-700/30 bg-emerald-100/70 text-emerald-900',
    dotClassName: 'bg-emerald-500 ring-emerald-800/20',
    shadowClassName: 'shadow-[3px_3px_0_rgba(16,185,129,0.18)]',
  },
  internship: {
    label: 'Internship',
    icon: Sparkles,
    chipClassName: 'border-sky-700/30 bg-sky-100/75 text-sky-900',
    dotClassName: 'bg-sky-500 ring-sky-800/20',
    shadowClassName: 'shadow-[3px_3px_0_rgba(14,165,233,0.18)]',
  },
  research: {
    label: 'Research',
    icon: Sparkles,
    chipClassName: 'border-violet-700/30 bg-violet-100/75 text-violet-900',
    dotClassName: 'bg-violet-500 ring-violet-800/20',
    shadowClassName: 'shadow-[3px_3px_0_rgba(139,92,246,0.18)]',
  },
  education: {
    label: 'Education',
    icon: GraduationCap,
    chipClassName: 'border-indigo-700/30 bg-indigo-100/75 text-indigo-900',
    dotClassName: 'bg-indigo-500 ring-indigo-800/20',
    shadowClassName: 'shadow-[3px_3px_0_rgba(99,102,241,0.18)]',
  },
  achievement: {
    label: 'Awards',
    icon: Trophy,
    chipClassName: 'border-amber-700/30 bg-amber-100/75 text-amber-900',
    dotClassName: 'bg-amber-500 ring-amber-800/20',
    shadowClassName: 'shadow-[3px_3px_0_rgba(245,158,11,0.2)]',
  },
};

const DETAIL_VARIANTS: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: 'auto', opacity: 1 },
};

const NOTE_ROTATION_CLASSES = [
  'md:-rotate-[0.8deg]',
  'md:rotate-[0.65deg]',
  'md:-rotate-[0.35deg]',
  'md:rotate-[0.9deg]',
] as const;

const DISCO_REST_ROTATIONS = ['-0.8deg', '0.65deg', '-0.35deg', '0.9deg'] as const;

function GrowIndigoWordmark({ className }: GrowIndigoWordmarkProps) {
  return (
    <span
      aria-label="growIndigo"
      role="img"
      className={cn(
        'inline-flex h-10 max-w-28 shrink-0 items-center gap-1.5 self-start text-gray-900 sm:self-center md:h-11',
        'dark:text-[var(--c-ink)]',
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 38 38" className="size-7 shrink-0" fill="none">
        <path
          d="M22.5 7.5c6.1 0 11 4.9 11 11 0 7.2-5.8 13-13 13H8.5V19.4c0-5.2 4.2-9.4 9.4-9.4 3.4 0 6.4 1.8 8 4.6"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 15.5c2.8 0 5 2.2 5 5s-2.2 5-5 5h-4.4v-4.4c0-3.1 2.5-5.6 5.6-5.6"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.6 9.4C10.4 6 7.5 4.5 4 4.8c0 4.2 2.4 6.6 7.2 7.3"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-sans text-sm font-black leading-none tracking-normal md:text-[0.95rem]">
        growIndigo
      </span>
    </span>
  );
}

function getEntriesForFilter(entries: readonly ExperienceTimelineEntry[], filter: TimelineFilter) {
  return filter === 'all' ? entries : entries.filter((entry) => entry.category === filter);
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return prefersReducedMotion;
}

export default function ExperienceTimeline({ entries }: ExperienceTimelineProps) {
  const [activeId, setActiveId] = useState<string | null>(entries[0]?.id ?? null);
  const [selectedFilter, setSelectedFilter] = useState<TimelineFilter>('all');
  const prefersReducedMotion = usePrefersReducedMotion();
  const { selection, subtle, toggle } = useAppHaptics();

  const filteredEntries = useMemo(
    () => getEntriesForFilter(entries, selectedFilter),
    [entries, selectedFilter],
  );

  const activeEntry = useMemo(() => (
    filteredEntries.find((entry) => entry.id === activeId) ?? null
  ), [activeId, filteredEntries]);

  const activeIndex = activeEntry ? filteredEntries.findIndex((entry) => entry.id === activeEntry.id) : -1;
  const progressScale = activeIndex >= 0
    ? (activeIndex + 1) / filteredEntries.length
    : 0;

  const selectEntry = useCallback((entryId: string) => {
    if (activeId === entryId) {
      setActiveId(null);
      toggle();
      return;
    }

    setActiveId(entryId);
    selection();
  }, [activeId, selection, toggle]);

  const selectFilter = useCallback((filter: TimelineFilter) => {
    const nextEntries = getEntriesForFilter(entries, filter);
    setSelectedFilter(filter);
    setActiveId(nextEntries[0]?.id ?? null);
    toggle();
  }, [entries, toggle]);

  const moveActiveEntry = useCallback((direction: -1 | 1, fallbackEntryId: string) => {
    if (filteredEntries.length === 0) return;
    const currentIndex = filteredEntries.findIndex((entry) => entry.id === (activeId ?? fallbackEntryId));
    const fallbackIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = (fallbackIndex + direction + filteredEntries.length) % filteredEntries.length;
    setActiveId(filteredEntries[nextIndex].id);
    subtle();
  }, [activeId, filteredEntries, subtle]);

  const handleEntryKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, entryId: string) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveActiveEntry(1, entryId);
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveActiveEntry(-1, entryId);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveId(filteredEntries[0]?.id ?? null);
      subtle();
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveId(filteredEntries[filteredEntries.length - 1]?.id ?? null);
      subtle();
    }
  }, [filteredEntries, moveActiveEntry, subtle]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <section id="experience" aria-labelledby="experience-timeline-heading" className="relative mt-12 w-full min-w-0 max-w-full scroll-mt-20 overflow-visible px-1 md:mt-16 md:scroll-mt-24">
      <div className="mb-7 flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="font-hand text-sm md:text-base text-[var(--c-ink)]/55">Pinned career thread</p>
          <h2 id="experience-timeline-heading" className="font-hand text-3xl font-bold text-[var(--c-ink)] md:text-4xl">
            Experience Timeline
          </h2>
        </div>

        <div className="flex max-w-full gap-2 overflow-x-auto overflow-y-visible pb-1 scrollbar-hidden" aria-label="Timeline filters">
          {FILTER_OPTIONS.map((option) => {
            const isSelected = selectedFilter === option.id;
            const Icon = option.icon;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectFilter(option.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-sm font-hand transition-[background-color,border-color,color,transform,box-shadow]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ink)]/35',
                  isSelected
                    ? 'border-[var(--c-ink)]/45 bg-[var(--note-paper)] text-[var(--c-ink)] shadow-[2px_2px_0_color-mix(in_srgb,var(--c-ink)_18%,transparent)] -rotate-1'
                    : 'border-[var(--c-ink)]/20 bg-[var(--c-paper)]/65 text-[var(--c-ink)]/65 hover:bg-[var(--note-paper)] hover:text-[var(--c-ink)]',
                )}
                aria-pressed={isSelected}
              >
                <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.9} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-w-0 max-w-full">
        <div aria-hidden="true" className="absolute bottom-6 left-[23px] top-4 w-[2px] rounded-full bg-[var(--c-ink)]/15 md:left-1/2 md:-translate-x-1/2" />
        <m.div
          aria-hidden="true"
          className="absolute bottom-6 left-[22px] top-4 w-1 origin-top rounded-full bg-[var(--c-ink)]/35 md:left-1/2 md:-translate-x-1/2"
          animate={{ scaleY: progressScale }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25 }}
        />

        <ol className="relative min-w-0 max-w-full space-y-7 md:space-y-10">
          {filteredEntries.map((entry, index) => {
            const isActive = entry.id === activeId;
            const meta = CATEGORY_META[entry.category];
            const Icon = meta.icon;
            const detailsId = `timeline-details-${entry.id}`;
            const noteOnRight = index % 2 === 0;
            const discoMotionStyle = {
              '--disco-motion-delay': `${index * 115}ms`,
              '--disco-wiggle-rest': DISCO_REST_ROTATIONS[index % DISCO_REST_ROTATIONS.length],
            } as CSSProperties;

            return (
              <li
                key={entry.id}
                className="relative min-w-0 pl-10 sm:pl-12 md:grid md:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] md:items-start md:pl-0"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-[17px] top-7 z-20 size-4 rounded-full border-2 border-[var(--c-ink)]/55 ring-4 ring-[var(--c-paper)] transition-transform md:left-1/2 md:-translate-x-1/2',
                    meta.dotClassName,
                    isActive ? 'scale-125' : 'scale-95 opacity-80',
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-6 top-[2.15rem] z-10 h-px w-6 border-t-2 border-dashed border-[var(--c-ink)]/20 md:w-10',
                    noteOnRight
                      ? 'md:left-[calc(50%+0.75rem)]'
                      : 'md:left-auto md:right-[calc(50%+0.75rem)]',
                  )}
                />

                <div className={cn('relative z-10 min-w-0 max-w-full', noteOnRight ? 'md:col-start-3' : 'md:col-start-1 md:row-start-1')}>
                  <m.article
                    layout
                    data-disco-motion="wiggle"
                    style={discoMotionStyle}
                    whileHover={prefersReducedMotion ? undefined : { y: -3, rotate: noteOnRight ? 0.25 : -0.25 }}
                    className={cn(
                      'group/timeline-card relative w-full min-w-0 max-w-full overflow-visible rounded-[8px] border border-[var(--c-ink)]/15 bg-[var(--note-paper)] p-4 text-left text-[var(--c-ink)] transition-[background-color,border-color,box-shadow,transform] md:p-5',
                      'shadow-[4px_5px_0_color-mix(in_srgb,var(--c-ink)_14%,transparent)]',
                      'before:pointer-events-none before:absolute before:inset-0 before:rounded-[8px] before:bg-[linear-gradient(transparent_95%,color-mix(in_srgb,var(--c-ink)_8%,transparent)_96%)] before:bg-[length:100%_22px] before:opacity-55',
                      NOTE_ROTATION_CLASSES[index % NOTE_ROTATION_CLASSES.length],
                      isActive ? cn('border-[var(--c-ink)]/35', meta.shadowClassName) : 'hover:border-[var(--c-ink)]/28',
                    )}
                  >
                    <TapeStrip
                      size="sm"
                      className={cn('opacity-80', noteOnRight ? 'rotate-2' : '-rotate-3')}
                    />

                    <button
                      type="button"
                      onClick={() => selectEntry(entry.id)}
                      onKeyDown={(event) => handleEntryKeyDown(event, entry.id)}
                      aria-expanded={isActive}
                      aria-controls={detailsId}
                      aria-label={isActive ? `Collapse ${entry.title}` : `Expand ${entry.title}`}
                      className="relative z-10 block w-full rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ink)]/35"
                    >
                      <span className="flex flex-col gap-2">
                        <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--c-ink)]/55">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays aria-hidden="true" className="size-3.5" strokeWidth={1.9} />
                            {entry.dateLabel}
                          </span>
                          <span className={cn('inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5', meta.chipClassName)}>
                            <Icon aria-hidden="true" className="size-3" strokeWidth={2} />
                            {meta.label}
                          </span>
                        </span>

                        <span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <span className="min-w-0">
                            <span className="block font-hand text-xl font-bold leading-tight md:text-2xl">
                              {entry.title}
                            </span>
                            <span className="mt-1 block text-sm leading-snug text-[var(--c-ink)]/75 md:text-base">
                              {entry.organization}
                            </span>
                          </span>

                          {entry.logo && (
                            entry.logo.variant === 'growindigo-wordmark' ? (
                              <GrowIndigoWordmark className={entry.logo.className} />
                            ) : (
                              <>
                                <Image
                                  src={entry.logo.src}
                                  alt={entry.logo.alt}
                                  width={entry.logo.width}
                                  height={entry.logo.height}
                                  sizes={entry.logo.sizes}
                                  className={cn(
                                    'h-auto max-h-10 w-auto max-w-24 shrink-0 self-start object-contain sm:self-center md:max-h-11 md:max-w-28',
                                    entry.logo.darkSrc && 'dark:hidden',
                                    entry.logo.className,
                                  )}
                                />
                                {entry.logo.darkSrc && (
                                  <Image
                                    src={entry.logo.darkSrc}
                                    alt={entry.logo.alt}
                                    width={entry.logo.width}
                                    height={entry.logo.height}
                                    sizes={entry.logo.sizes}
                                    className={cn(
                                      'hidden h-auto max-h-10 w-auto max-w-24 shrink-0 self-start object-contain sm:self-center md:max-h-11 md:max-w-28 dark:block',
                                      entry.logo.darkClassName,
                                    )}
                                  />
                                )}
                              </>
                            )
                          )}
                        </span>

                        <span className="flex flex-col gap-2 text-xs text-[var(--c-ink)]/55 sm:flex-row sm:items-center sm:justify-between">
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.9} />
                            <span className="truncate">{entry.location}</span>
                          </span>
                          <span
                            className={cn(
                              'inline-flex w-fit shrink-0 items-center gap-1 rounded-[6px] border border-[var(--c-ink)]/15 bg-[var(--c-paper)]/45 px-2 py-1 font-hand text-[0.72rem] font-semibold text-[var(--c-ink)]/65 transition-[background-color,border-color,color,transform]',
                              'md:group-hover/timeline-card:-translate-y-0.5 md:group-hover/timeline-card:border-[var(--c-ink)]/35 md:group-hover/timeline-card:bg-[var(--c-paper)] md:group-hover/timeline-card:text-[var(--c-ink)]',
                              isActive && 'border-[var(--c-ink)]/30 bg-[var(--c-paper)]/75 text-[var(--c-ink)]',
                            )}
                          >
                            {isActive ? 'Click to collapse' : 'Click to expand'}
                            <ChevronDown
                              aria-hidden="true"
                              className={cn('size-4 transition-transform', isActive && 'rotate-180')}
                              strokeWidth={2}
                            />
                          </span>
                        </span>
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isActive && (
                        <m.div
                          key="details"
                          id={detailsId}
                          variants={DETAIL_VARIANTS}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.22 }}
                          className="relative z-10 overflow-hidden"
                        >
                          <div className="mt-3 border-t border-[var(--c-ink)]/10 pt-3">
                            <p className="text-base leading-relaxed text-[var(--c-ink)]/82 md:text-lg">
                              {entry.summary}
                            </p>

                            <p className="mt-2 rounded-[7px] border border-dashed border-[var(--c-ink)]/20 bg-[var(--c-paper)]/55 px-3 py-2 text-sm font-semibold leading-relaxed text-[var(--c-ink)]/85 md:text-base">
                              {entry.impact}
                            </p>

                            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--c-ink)]/75 md:text-base">
                              {entry.highlights.map((highlight) => (
                                <li key={highlight} className="flex gap-2">
                                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--c-ink)]/45" />
                                  <span>{highlight}</span>
                                </li>
                              ))}
                            </ul>

                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {entry.tools.map((tool) => (
                                <span
                                  key={tool}
                                  className="rounded-[6px] border border-[var(--c-ink)]/15 bg-[var(--c-paper)]/55 px-2 py-1 text-xs text-[var(--c-ink)]/70"
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </m.article>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
