"use client";

/**
 * Sketchbook Tooltip — desktop-only hover/focus hint.
 *
 * Why hand-rolled (not Radix): adding `@radix-ui/react-tooltip` would ship
 * ~6KB gzipped of FloatingUI + Radix runtime to every page just for hint
 * text. We already have Framer Motion in the bundle for fade animation
 * and React's portal for overlay rendering. Hand-rolled stays under 1KB.
 *
 * Behaviour:
 *  - Renders nothing on touch devices (`useDesktopOnly`) so mobile pays
 *    zero JS/DOM cost.
 *  - Shows after a 400ms hover delay; instantly on `:focus-visible` for
 *    keyboard users.
 *  - Auto-positions above the trigger by default, flips below if it would
 *    clip the top of the viewport.
 *  - Uses sketchbook aesthetic: paper bg, ink text, hand-drawn rotation,
 *    `font-hand` typography.
 *
 * Usage:
 *   <Tooltip label="Toggle dark mode">
 *     <button>...</button>
 *   </Tooltip>
 */

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';
import { useDesktopOnly } from '@/hooks/useDesktopOnly';
import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  children: ReactElement;
  /** Show delay in ms (hover only — focus is instant). Default 400. */
  delay?: number;
  /** Side preference. Default 'top'; auto-flips when clipped. */
  side?: 'top' | 'bottom';
  className?: string;
}

interface Coords { left: number; top: number; flipped: boolean }

export function Tooltip({
  label,
  children,
  delay = 400,
  side = 'top',
  className,
}: TooltipProps) {
  const isDesktop = useDesktopOnly();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const timerRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const id = useId();

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const computeCoords = useCallback((): void => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const wantsTop = side === 'top';
    // Estimated tooltip height (single line ~26px). We'll measure post-mount
    // for accuracy, but this prevents an obvious first-frame jump.
    const estH = 28;
    const flipped = wantsTop ? rect.top - estH - margin < 4 : rect.bottom + estH + margin > window.innerHeight - 4;
    const placeTop = wantsTop !== flipped;
    setCoords({
      left: rect.left + rect.width / 2,
      top: placeTop ? rect.top - margin : rect.bottom + margin,
      flipped: !placeTop,
    });
  }, [side]);

  const handleEnter = useCallback(() => {
    if (!isDesktop) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      computeCoords();
      setOpen(true);
    }, delay);
  }, [isDesktop, delay, computeCoords]);

  const handleLeave = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  const handleFocus = useCallback((e: FocusEvent<HTMLElement>) => {
    if (!isDesktop) return;
    // Only show on keyboard focus, not click focus.
    if (typeof (e.target as HTMLElement).matches === 'function' && !(e.target as HTMLElement).matches(':focus-visible')) return;
    clearTimer();
    computeCoords();
    setOpen(true);
  }, [isDesktop, computeCoords]);

  useEffect(() => () => clearTimer(), []);

  // Reposition on scroll/resize while open.
  useEffect(() => {
    if (!open) return;
    const onUpdate = () => computeCoords();
    window.addEventListener('scroll', onUpdate, true);
    window.addEventListener('resize', onUpdate);
    return () => {
      window.removeEventListener('scroll', onUpdate, true);
      window.removeEventListener('resize', onUpdate);
    };
  }, [open, computeCoords]);

  if (!isValidElement(children)) return children;

  type TriggerProps = {
    ref?: (node: HTMLElement | null) => void;
    onMouseEnter?: (e: MouseEvent) => void;
    onMouseLeave?: () => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: () => void;
    'aria-describedby'?: string;
  };
  const childProps = (children.props ?? {}) as TriggerProps;

  const child = cloneElement(children as ReactElement<TriggerProps>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward to any existing ref on the child.
      const orig = (children as unknown as { ref?: unknown }).ref;
      if (typeof orig === 'function') (orig as (n: HTMLElement | null) => void)(node);
      else if (orig && typeof orig === 'object') (orig as { current: HTMLElement | null }).current = node;
    },
    onMouseEnter: (e: MouseEvent) => { childProps.onMouseEnter?.(e); handleEnter(); },
    onMouseLeave: () => { childProps.onMouseLeave?.(); handleLeave(); },
    onFocus: (e: FocusEvent<HTMLElement>) => { childProps.onFocus?.(e); handleFocus(e); },
    onBlur: () => { childProps.onBlur?.(); handleLeave(); },
    'aria-describedby': open ? id : childProps['aria-describedby'],
  });

  if (!isDesktop) return children;

  const portal = open && coords && typeof document !== 'undefined'
    ? createPortal(
        <AnimatePresence>
          <m.div
            key="tt"
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: coords.flipped ? -4 : 4, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: -1.5 }}
            exit={{ opacity: 0, y: coords.flipped ? -4 : 4, rotate: -1.5 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top,
              transform: `translate(-50%, ${coords.flipped ? '0%' : '-100%'})`,
              pointerEvents: 'none',
              zIndex: 9999,
            }}
            className={cn(
              'px-2 py-1 rounded-md',
              'bg-[var(--c-paper)] text-[var(--c-ink)]',
              'border border-[var(--c-ink)]/30',
              'shadow-[1px_2px_4px_rgba(0,0,0,0.18)]',
              'font-hand text-[12px] leading-tight font-bold tracking-wide',
              'whitespace-nowrap select-none',
              className,
            )}
          >
            {label}
          </m.div>
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <>
      {child}
      {portal}
    </>
  );
}
