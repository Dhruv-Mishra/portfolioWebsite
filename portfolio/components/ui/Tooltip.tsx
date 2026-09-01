"use client";

/**
 * Sketchbook Tooltip — desktop-only hover/focus hint.
 *
 * Why hand-rolled (not Radix): adding `@radix-ui/react-tooltip` would ship
 * ~6KB gzipped of FloatingUI + Radix runtime to every page just for hint
 * text. Fade uses a scoped CSS keyframe and React's portal for overlay
 * rendering. Hand-rolled stays under 1KB.
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
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
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
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const id = useId();

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const computeCoords = useCallback((element: HTMLElement): void => {
    const rect = element.getBoundingClientRect();
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

  const handleEnter = useCallback((element: HTMLElement) => {
    if (!isDesktop) return;
    clearTimer();
    setTriggerElement(element);
    timerRef.current = window.setTimeout(() => {
      computeCoords(element);
      setOpen(true);
    }, delay);
  }, [isDesktop, delay, computeCoords]);

  const handleLeave = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  const handleFocus = useCallback((element: HTMLElement) => {
    if (!isDesktop) return;
    // Only show on keyboard focus, not click focus.
    if (!element.matches(':focus-visible')) return;
    clearTimer();
    setTriggerElement(element);
    computeCoords(element);
    setOpen(true);
  }, [isDesktop, computeCoords]);

  useEffect(() => {
    if (!open || !triggerElement) return;
    const previousDescription = triggerElement.getAttribute('aria-describedby');
    triggerElement.setAttribute('aria-describedby', id);
    return () => {
      if (previousDescription) triggerElement.setAttribute('aria-describedby', previousDescription);
      else triggerElement.removeAttribute('aria-describedby');
    };
  }, [id, open, triggerElement]);

  useEffect(() => () => clearTimer(), []);

  // Close on nested-route scroll; recompute only on window resize.
  useEffect(() => {
    if (!open || !triggerElement) return;
    const onScroll = () => setOpen(false);
    const onResize = () => computeCoords(triggerElement);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, triggerElement, computeCoords]);

  if (!isDesktop) return children;

  const portal = open && coords && typeof document !== 'undefined'
    ? createPortal(
        <div
          id={id}
          role="tooltip"
          data-side={coords.flipped ? 'bottom' : 'top'}
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            transform: `translate(-50%, ${coords.flipped ? '0%' : '-100%'})`,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
          className={cn(
            'sketch-tooltip px-2 py-1 rounded-md',
            'bg-[var(--c-paper)] text-[var(--c-ink)]',
            'border border-[var(--c-ink)]/30',
            'shadow-[1px_2px_4px_rgba(0,0,0,0.18)]',
            'font-hand text-[12px] leading-tight font-bold tracking-wide',
            'whitespace-nowrap select-none',
            className,
          )}
        >
          {label}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <span
        className="contents"
        onMouseEnter={(event) => {
          const element = (event.target as Element).closest<HTMLElement>('button, a, input, select, textarea, [tabindex]');
          if (element) handleEnter(element);
        }}
        onMouseLeave={handleLeave}
        onFocus={(event) => handleFocus(event.target as HTMLElement)}
        onBlur={handleLeave}
      >
        {children}
      </span>
      {portal}
    </>
  );
}
