'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Shared open/dismiss behavior for the floating master-volume popovers.
 * Desktop hover/focus and mobile tap both close on outside pointer, Escape,
 * and (when not dragging the native range) leaving the root.
 */
export function useFloatingVolumePopover(
  rootRef: RefObject<HTMLElement | null>,
  { openOnHover = false }: { openOnHover?: boolean } = {},
) {
  const [open, setOpen] = useState(false);
  const draggingRef = useRef(false);

  const openPopover = useCallback(() => setOpen(true), []);
  const togglePopover = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const closeIfIdle = useCallback(() => {
    if (draggingRef.current) return;
    const root = rootRef.current;
    if (root) {
      const active = document.activeElement;
      if (active instanceof Node && root.contains(active)) return;
    }
    setOpen(false);
  }, [rootRef]);

  const closeOnMouseLeave = useCallback(() => {
    if (draggingRef.current) return;
    const root = rootRef.current;
    const active = document.activeElement;
    if (
      root &&
      active instanceof HTMLInputElement &&
      active.type === 'range' &&
      root.contains(active)
    ) {
      return;
    }
    setOpen(false);
  }, [rootRef]);

  const onDragStart = useCallback(() => {
    draggingRef.current = true;
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      draggingRef.current = false;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      draggingRef.current = false;
      setOpen(false);
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const root = rootRef.current;
      if (root) {
        const underPointer = document.elementFromPoint(event.clientX, event.clientY);
        if (underPointer && root.contains(underPointer)) return;
      }
      setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('pointercancel', onPointerEnd);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerup', onPointerEnd);
      document.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [open, rootRef]);

  const rootProps = openOnHover
    ? {
        onMouseEnter: openPopover,
        onMouseLeave: closeOnMouseLeave,
        onFocusCapture: openPopover,
        onBlurCapture: () => {
          window.setTimeout(closeIfIdle, 0);
        },
      }
    : {};

  return {
    open,
    togglePopover,
    onDragStart,
    rootProps,
  };
}
