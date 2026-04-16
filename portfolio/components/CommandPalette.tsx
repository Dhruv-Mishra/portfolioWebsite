"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import { Kbd } from '@/components/ui/Kbd';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import {
  ANIMATION_TOKENS,
  INTERACTION_TOKENS,
  OVERLAY_TOKENS,
  TERMINAL_COLORS,
  Z_INDEX,
} from '@/lib/designTokens';
import {
  buildCommandEntries,
  searchCommands,
  type CommandEntry,
  type CommandGroup,
  type CommandContext,
} from '@/lib/commandRegistry';

// ── Static style objects (hoisted) ─────────────────────────────────

const CARD_STYLE_DESKTOP = {
  maxWidth: OVERLAY_TOKENS.maxWidth.palette,
  maxHeight: OVERLAY_TOKENS.maxHeight.palette,
} as const;

const CARD_STYLE_MOBILE = {
  maxHeight: '75dvh',
} as const;

const INPUT_STRIP_STYLE = { backgroundColor: TERMINAL_COLORS.bg } as const;
const FOOTER_STRIP_STYLE = { backgroundColor: TERMINAL_COLORS.bg } as const;

const LIST_BG_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(transparent, transparent 35px, var(--c-grid) 35px, var(--c-grid) 36px)',
} as const;

const PALETTE_DROP_TRANSITION = {
  type: 'spring' as const,
  ...ANIMATION_TOKENS.spring.snappy,
  duration: 0.2,
};

const MOBILE_SLIDE_TRANSITION = {
  type: 'spring' as const,
  ...ANIMATION_TOKENS.spring.snappy,
};

const MOBILE_INITIAL = { opacity: 0, y: '100%' };
const MOBILE_ANIMATE = { opacity: 1, y: 0 };
const MOBILE_EXIT = { opacity: 0, y: '100%' };

const BACKDROP_TRANSITION = { duration: ANIMATION_TOKENS.duration.normal };

const GROUP_ORDER: CommandGroup[] = ['Navigation', 'Actions', 'Terminal'];

// ── Row ─────────────────────────────────────────────────────────────

interface RowProps {
  entry: CommandEntry;
  selected: boolean;
  id: string;
  onSelect: () => void;
  onHover: () => void;
}

const Row = memo(function Row({ entry, selected, id, onSelect, onHover }: RowProps) {
  const Icon = entry.icon;
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={onHover}
      data-clickable
      className={cn(
        'relative h-11 flex items-center gap-3 px-5 cursor-pointer',
        'transition-[background-color,transform] duration-150',
        selected && 'bg-[var(--c-ink)]/5 dark:bg-[var(--c-ink)]/10 translate-x-0.5',
      )}
    >
      {/* Left accent bar when selected */}
      {selected && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-sm bg-emerald-500/70"
        />
      )}

      {Icon && (
        <Icon size={16} className="shrink-0 text-[var(--c-ink)]/60" />
      )}

      <span
        className={cn(
          'flex-1 min-w-0 truncate font-hand text-base text-[var(--c-ink)]',
          selected && 'font-bold',
        )}
      >
        {entry.label}
      </span>

      {entry.keyboardHint && (
        <span className="scale-75 origin-right inline-flex items-center gap-1 shrink-0">
          {entry.keyboardHint.split(' ').map((k, idx) => (
            <Kbd key={`${k}-${idx}`}>{k}</Kbd>
          ))}
        </span>
      )}
    </li>
  );
});

// ── Group header ───────────────────────────────────────────────────

const GroupHeader = memo(function GroupHeader({ title }: { title: string }) {
  return (
    <li
      role="presentation"
      className={cn(
        'sticky top-0 bg-[var(--c-paper)]/95 backdrop-blur-sm',
        'pt-4 pb-2 px-5',
        'font-hand text-xs uppercase tracking-[0.2em] text-[var(--c-ink)]/40',
        'z-10',
      )}
    >
      <span className="inline-flex flex-col">
        <span>{title}</span>
        <WavyUnderline className="h-2 opacity-40 -mt-0.5" />
      </span>
    </li>
  );
});

// ── Empty state ────────────────────────────────────────────────────

const EmptyState = memo(function EmptyState({ query }: { query: string }) {
  return (
    <div className="py-8 px-5 flex items-center justify-center">
      <div
        className={cn(
          'bg-[var(--note-yellow)] text-[var(--c-ink)]',
          '-rotate-1 font-code text-sm',
          'p-4 shadow-md rounded-sm max-w-[320px]',
        )}
      >
        <p>
          <span className="text-emerald-600 font-bold">&#10140;</span>{' '}
          command not found: <span className="font-bold">{query}</span>
        </p>
        <p className="mt-2 text-[var(--c-ink)]/60">
          try: help, projects, theme
        </p>
      </div>
    </div>
  );
});

// ── Main ───────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  openFeedback: () => void;
  openShortcuts: () => void;
}

/**
 * CommandPalette — hybrid cream-paper modal with a charcoal inset terminal
 * input strip. Rendered via portal; uses its own scaffolding instead of the
 * shared `Modal` so we can swap in the `paletteDrop` entrance (desktop) and
 * `bottom-sheet slide-up` entrance (mobile) cleanly.
 */
function CommandPalette({
  isOpen,
  onClose,
  openFeedback,
  openShortcuts,
}: CommandPaletteProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isMobile = useIsMobile();

  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  // ── Portal + render lifecycle ────────────────────────────────────
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  const handleExitComplete = useCallback(() => {
    if (!isOpen) setShouldRender(false);
  }, [isOpen]);

  // ── Body scroll lock ─────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // ── Reset when opened + restore focus on close ──────────────────
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setSelectedIdx(0);
      // Focus the input on next frame so the motion entrance is in-flight.
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    // On close, restore focus to whatever element opened the palette.
    previousFocusRef.current?.focus?.();
    return undefined;
  }, [isOpen]);

  // ── Command context (stable per-open instance) ───────────────────
  const ctx: CommandContext = useMemo(
    () => ({
      router,
      setTheme: (t) => setTheme(t),
      resolvedTheme,
      openFeedback,
      openShortcuts,
      // v1: drop terminal category, this is effectively a no-op.
      runTerminalCommand: () => { /* intentional no-op in v1 */ },
    }),
    [router, setTheme, resolvedTheme, openFeedback, openShortcuts],
  );

  // ── Filtered & grouped results ──────────────────────────────────
  const allEntries = useMemo(() => buildCommandEntries(), []);
  const filtered = useMemo(() => searchCommands(allEntries, query), [allEntries, query]);

  // Flat list (for keyboard nav index math) — already in group order from builder.
  const flat = filtered;

  // Grouped for rendering.
  const grouped = useMemo(() => {
    const buckets: Record<CommandGroup, CommandEntry[]> = {
      Navigation: [],
      Actions: [],
      Terminal: [],
    };
    for (const e of flat) buckets[e.group].push(e);
    return buckets;
  }, [flat]);

  // Clamp selection when filter changes.
  useEffect(() => {
    if (selectedIdx >= flat.length) {
      setSelectedIdx(Math.max(0, flat.length - 1));
    }
  }, [flat.length, selectedIdx]);

  // ── Execute ──────────────────────────────────────────────────────
  const executeEntry = useCallback(
    (entry: CommandEntry) => {
      // Invoke the action synchronously BEFORE closing. Safari requires
      // `navigator.clipboard.writeText` and `window.open` to be dispatched in
      // the same task as the originating user gesture — any await / microtask
      // boundary between click and call causes the call to be rejected. So we
      // fire `run` first (its synchronous preamble will dispatch clipboard /
      // open), then close the palette, then let any returned promise resolve
      // in the background.
      let maybePromise: void | Promise<void> = undefined;
      try {
        maybePromise = entry.run(ctx);
      } catch {
        /* user-facing action failed — silent */
      }
      onClose();
      if (maybePromise) {
        void Promise.resolve(maybePromise).catch(() => {
          /* async tail failure — silent */
        });
      }
    },
    [ctx, onClose],
  );

  // ── Keyboard handling on input ──────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (flat.length === 0) return;
        setSelectedIdx((idx) => (idx + 1) % flat.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (flat.length === 0) return;
        setSelectedIdx((idx) => (idx - 1 + flat.length) % flat.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const entry = flat[selectedIdx];
        if (entry) executeEntry(entry);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      // Let all other keys through so the input captures text normally.
    },
    [flat, selectedIdx, executeEntry, onClose],
  );

  // ── Esc on window (safety net when focus drifts out of input) ──
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // ── Scroll selected row into view ──────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const entry = flat[selectedIdx];
    if (!entry) return;
    const node = document.getElementById(`${optionIdPrefix}-${entry.id}`);
    if (node) node.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, flat, isOpen, optionIdPrefix]);

  // ── Renderers ───────────────────────────────────────────────────
  const activeId = flat[selectedIdx] ? `${optionIdPrefix}-${flat[selectedIdx].id}` : undefined;

  if (!mounted || !shouldRender) return null;

  const cardChrome: ReactNode = (
    <>
      {/* Input strip (charcoal inset) */}
      <div
        style={INPUT_STRIP_STYLE}
        className={cn(
          'relative h-14 px-5 flex items-center gap-3',
          'border-b-2 border-[var(--c-ink)]/15',
        )}
      >
        <span
          className="font-code text-base font-bold text-emerald-400 select-none"
          aria-hidden="true"
        >
          &#10140;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIdx(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search or jump to…"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Command palette search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          className={cn(
            'font-code text-base tracking-wide',
            'bg-transparent border-none outline-none flex-1',
            'text-gray-100 placeholder-gray-600 caret-emerald-400',
          )}
        />
      </div>

      {/* Result list */}
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Command palette results"
        className="flex-1 min-h-0 overflow-y-auto ruler-scrollbar"
        style={LIST_BG_STYLE}
      >
        {flat.length === 0 ? (
          <EmptyState query={query || '""'} />
        ) : (
          GROUP_ORDER.map((group) => {
            const entries = grouped[group];
            if (entries.length === 0) return null;
            return (
              <Fragment key={group}>
                <GroupHeader title={group} />
                {entries.map((entry) => {
                  const idx = flat.indexOf(entry);
                  const id = `${optionIdPrefix}-${entry.id}`;
                  return (
                    <Row
                      key={entry.id}
                      id={id}
                      entry={entry}
                      selected={idx === selectedIdx}
                      onSelect={() => executeEntry(entry)}
                      onHover={() => setSelectedIdx(idx)}
                    />
                  );
                })}
              </Fragment>
            );
          })
        )}
      </ul>

      {/* Footer hint strip */}
      <div
        style={FOOTER_STRIP_STYLE}
        className={cn(
          'h-8 px-5 flex items-center',
          'text-[11px] font-code text-gray-500',
          'border-t-2 border-[var(--c-ink)]/15',
        )}
      >
        <span>&uarr;&darr; navigate &middot; &crarr; select &middot; esc close</span>
      </div>
    </>
  );

  return createPortal(
    <AnimatePresence onExitComplete={handleExitComplete}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <m.div
            key="cmdk-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={onClose}
            className={cn('fixed inset-0', OVERLAY_TOKENS.backdrop.strong)}
            style={{ zIndex: Z_INDEX.modal }}
            aria-hidden="true"
          />

          {/* Viewport wrapper */}
          <div
            className={cn(
              'fixed inset-0 overflow-hidden',
              isMobile ? 'flex items-end justify-center' : 'overflow-y-auto flex justify-center',
            )}
            onClick={onClose}
            style={{ zIndex: Z_INDEX.modal }}
          >
            {isMobile ? (
              <m.div
                key="cmdk-card-mobile"
                initial={MOBILE_INITIAL}
                animate={MOBILE_ANIMATE}
                exit={MOBILE_EXIT}
                transition={MOBILE_SLIDE_TRANSITION}
                onClick={(e) => e.stopPropagation()}
                style={CARD_STYLE_MOBILE}
                className={cn(
                  'relative w-[calc(100vw-1.5rem)] mx-3',
                  'bg-[var(--c-paper)]',
                  'border-[3px] border-[var(--c-ink)]/15',
                  'rounded-t-xl rounded-b-none',
                  'shadow-2xl font-hand',
                  'flex flex-col overflow-hidden',
                  'will-change-transform',
                )}
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
              >
                {/* Drag handle (mobile only) */}
                <div className="flex items-center justify-center pt-2 pb-1 shrink-0" aria-hidden="true">
                  <span className="w-10 h-1 bg-[var(--c-ink)]/20 rounded-full" />
                </div>
                {cardChrome}
              </m.div>
            ) : (
              <m.div
                key="cmdk-card-desktop"
                initial={INTERACTION_TOKENS.entrance.paletteDrop.initial}
                animate={INTERACTION_TOKENS.entrance.paletteDrop.animate}
                exit={INTERACTION_TOKENS.exit.paletteLift}
                transition={PALETTE_DROP_TRANSITION}
                onClick={(e) => e.stopPropagation()}
                style={CARD_STYLE_DESKTOP}
                className={cn(
                  'relative w-full h-fit',
                  'my-[var(--c-modal-top)] md:my-[var(--c-modal-top-md)]',
                  'bg-[var(--c-paper)]',
                  'border-[3px] border-[var(--c-ink)]/15',
                  'rounded-md shadow-2xl font-hand',
                  'flex flex-col overflow-hidden',
                  'will-change-transform',
                )}
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
              >
                <TapeStrip size="md" />
                {cardChrome}
              </m.div>
            )}
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default CommandPalette;
