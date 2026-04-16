"use client";

import { memo, useMemo, Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/utils';
import {
  ANIMATION_TOKENS,
  INTERACTION_TOKENS,
  OVERLAY_TOKENS,
  SHADOW_TOKENS,
  GRADIENT_TOKENS,
  Z_INDEX,
} from '@/lib/designTokens';
import { KEYBINDINGS, type Keybinding, type KeybindingGroup } from '@/lib/keybindings';

// ── Static style objects (hoisted) ─────────────────────────────────

const SPIRAL_HOLE_SHADOW = { boxShadow: SHADOW_TOKENS.spiralHole } as const;
const SPIRAL_HOLES = Array.from({ length: 12 });

const CARD_STYLE = {
  maxWidth: OVERLAY_TOKENS.maxWidth.shortcuts,
  maxHeight: OVERLAY_TOKENS.maxHeight.shortcuts,
} as const;

const FOLD_CORNER_STYLE = { background: GRADIENT_TOKENS.foldCorner } as const;

const PAPER_PIN_TRANSITION = {
  type: 'spring' as const,
  ...ANIMATION_TOKENS.spring.gentle,
};

const BACKDROP_TRANSITION = { duration: ANIMATION_TOKENS.duration.normal };

const SECTION_ORDER: KeybindingGroup[] = ['Navigate', 'Actions', 'Dismiss'];

// ── Chord display ──────────────────────────────────────────────────

const ChordDisplay = memo(function ChordDisplay({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      {keys.map((k, idx) => (
        <Fragment key={`${k}-${idx}`}>
          {idx > 0 && (
            <span className="font-hand text-xs text-[var(--c-ink)]/40 italic">then</span>
          )}
          <Kbd>{k}</Kbd>
        </Fragment>
      ))}
    </span>
  );
});

// ── Single row ─────────────────────────────────────────────────────

const BindingRow = memo(function BindingRow({ binding }: { binding: Keybinding }) {
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-4',
        'py-1.5 border-b border-dashed border-[var(--c-grid)]/30 last:border-0',
      )}
    >
      <span className="font-hand text-base text-[var(--c-ink)] truncate">
        {binding.label}
      </span>
      <ChordDisplay keys={binding.keys} />
    </li>
  );
});

// ── Section ────────────────────────────────────────────────────────

const Section = memo(function Section({
  title,
  bindings,
}: {
  title: KeybindingGroup;
  bindings: Keybinding[];
}) {
  if (bindings.length === 0) return null;
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="font-hand text-xs uppercase tracking-[0.2em] text-[var(--c-ink)]/50 mb-1">
        {title}
      </h3>
      <WavyUnderline className="h-2 opacity-40" />
      <ul className="mt-1.5" role="list">
        {bindings.map((b) => (
          <BindingRow key={b.id} binding={b} />
        ))}
      </ul>
    </section>
  );
});

// ── Main Component ─────────────────────────────────────────────────

interface ShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ShortcutsOverlay — a notebook-style modal that lists every global keyboard
 * shortcut, grouped by purpose. Rendered via portal to document.body; uses its
 * own scaffolding (not the shared Modal) so the `paperPin` entrance / exit
 * animation is the single applied transform.
 */
function ShortcutsOverlay({ isOpen, onClose }: ShortcutsOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  const handleExitComplete = useCallback(() => {
    if (!isOpen) setShouldRender(false);
  }, [isOpen]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // Esc to close.
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

  // Focus the card for keyboard accessibility when opened; restore focus on close.
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const node = cardRef.current;
      if (node) node.focus({ preventScroll: true });
      return;
    }
    // On close, restore focus to whatever element opened the overlay.
    previousFocusRef.current?.focus?.();
  }, [isOpen]);

  const grouped = useMemo(() => {
    const buckets: Record<KeybindingGroup, Keybinding[]> = {
      Navigate: [],
      Actions: [],
      Dismiss: [],
    };
    for (const b of KEYBINDINGS) buckets[b.group].push(b);
    return buckets;
  }, []);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <AnimatePresence onExitComplete={handleExitComplete}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <m.div
            key="shortcuts-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={onClose}
            className={cn('fixed inset-0', OVERLAY_TOKENS.backdrop.strong)}
            style={{ zIndex: Z_INDEX.modal }}
            aria-hidden="true"
          />

          {/* Scrollable viewport wrapper */}
          <div
            className="fixed inset-0 overflow-y-auto overscroll-contain flex justify-center"
            onClick={onClose}
            style={{ zIndex: Z_INDEX.modal }}
          >
            <m.div
              ref={cardRef}
              key="shortcuts-card"
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-heading"
              initial={INTERACTION_TOKENS.entrance.paperPin.initial}
              animate={INTERACTION_TOKENS.entrance.paperPin.animate}
              exit={INTERACTION_TOKENS.exit.paperUnpin}
              transition={PAPER_PIN_TRANSITION}
              onClick={(e) => e.stopPropagation()}
              style={CARD_STYLE}
              className={cn(
                'relative w-[calc(100vw-1.5rem)] h-fit',
                'my-[var(--c-modal-top)] md:my-[var(--c-modal-top-md)]',
                'bg-[var(--c-paper)]',
                'border-2 border-[var(--c-ink)]/20 rounded-md',
                'shadow-xl font-hand',
                'will-change-transform outline-none',
              )}
            >
              {/* Tape strip at top */}
              <TapeStrip size="md" />

              {/* Spiral binding holes */}
              <div
                className={cn(
                  'absolute top-0 left-0 right-0 h-6',
                  'bg-[var(--c-paper)] border-2 border-b-0 border-[var(--c-grid)]/30',
                  'rounded-t-md z-10',
                  'flex items-center justify-evenly px-2',
                )}
                aria-hidden="true"
              >
                {SPIRAL_HOLES.map((_, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 flex-shrink-0 rounded-full border-2 border-[var(--c-grid)]/40 bg-[var(--c-paper)]"
                    style={SPIRAL_HOLE_SHADOW}
                  />
                ))}
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close shortcuts overlay"
                className={cn(
                  'absolute top-1 right-1 z-30 rounded-full',
                  'min-w-[44px] min-h-[44px] flex items-center justify-center',
                  'text-[var(--c-ink)]/60 hover:text-[var(--c-ink)]',
                  'hover:bg-[var(--c-ink)]/5',
                  'transition-[color,background-color,transform] duration-200',
                  'hover:scale-110 hover:rotate-6',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/60',
                )}
              >
                <X size={16} strokeWidth={2.4} aria-hidden="true" />
              </button>

              {/* Content */}
              <div className="pt-10 pb-5 px-5 md:px-6 overflow-y-auto ruler-scrollbar">
                <div className="text-center">
                  <h2
                    id="shortcuts-heading"
                    className="text-2xl md:text-3xl font-bold text-[var(--c-heading)] font-hand inline-block"
                  >
                    Keyboard shortcuts
                  </h2>
                  <WavyUnderline className="max-w-[260px] mx-auto" />
                  <p className="font-hand text-sm text-[var(--c-ink)]/50 mt-1 mb-3">
                    Scribbled for the power users ~
                  </p>
                </div>

                {SECTION_ORDER.map((group) => (
                  <Section key={group} title={group} bindings={grouped[group]} />
                ))}

                {/* Footer hint */}
                <p className="mt-5 text-center font-hand italic text-xs text-[var(--c-ink)] opacity-40 flex items-center justify-center flex-wrap gap-1.5">
                  <span>Press</span>
                  <Kbd>Esc</Kbd>
                  <span>to close</span>
                  <span aria-hidden="true" className="px-0.5">·</span>
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                  <span>for the palette</span>
                </p>
              </div>

              {/* Folded corner */}
              <div
                className="absolute bottom-0 right-0 w-[20px] h-[20px] pointer-events-none"
                style={FOLD_CORNER_STYLE}
                aria-hidden="true"
              />
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ShortcutsOverlay;
