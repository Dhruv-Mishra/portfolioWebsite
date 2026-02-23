"use client";

import { useEffect, useCallback, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ANIMATION_TOKENS, INTERACTION_TOKENS, Z_INDEX } from '@/lib/designTokens';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Called when the user requests closing (backdrop click, Escape key) */
  onClose: () => void;
  /** Content rendered inside the animated modal card */
  children: ReactNode;
  /** Extra classes applied to the modal card element */
  className?: string;
  /** Inline styles applied to the modal card element (e.g. clipPath) */
  style?: CSSProperties;
  /** Accessible label for the dialog */
  ariaLabel?: string;
  /** ID of the element that labels the dialog */
  ariaLabelledBy?: string;
  /** Tailwind classes for the backdrop overlay.
   *  Default: "bg-black/20 dark:bg-black/40" (light tint) */
  backdropClassName?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────────

/**
 * Shared modal shell — renders via portal to `document.body` so it escapes
 * every parent stacking context. Provides:
 *
 * - Backdrop overlay with fade animation
 * - Scrollable viewport wrapper
 * - Animated card (fadeScaleRotate entrance / exit, gentle spring)
 * - Body scroll lock while open
 * - Escape-key dismissal
 * - Focus-trap skeleton (consumers can extend)
 * - `role="dialog"` + `aria-modal="true"`
 *
 * Consumers supply their own close button, tape decoration, and content.
 */
export function Modal({
  isOpen,
  onClose,
  children,
  className,
  style,
  ariaLabel,
  ariaLabelledBy,
  backdropClassName = "bg-black/20 dark:bg-black/40",
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  // Track whether the portal should remain in the DOM (stays true during exit animation)
  const [shouldRender, setShouldRender] = useState(false);

  // ── Client-only gate (createPortal needs a DOM target) ──────────────
  useEffect(() => { setMounted(true); }, []);

  // ── Keep portal alive until exit animation completes ────────────────
  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  const handleExitComplete = useCallback(() => {
    if (!isOpen) setShouldRender(false);
  }, [isOpen]);

  // ── Body scroll lock ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // ── Escape key ──────────────────────────────────────────────────────
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleEscape]);

  // ── Focus trap ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const modal = modalRef.current;
    if (!modal) return;

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  // ── Render ──────────────────────────────────────────────────────────
  if (!mounted || !shouldRender) return null;

  return createPortal(
    <AnimatePresence onExitComplete={handleExitComplete}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <m.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: ANIMATION_TOKENS.duration.normal }}
            onClick={onClose}
            className={cn("fixed inset-0", backdropClassName)}
            style={{ zIndex: Z_INDEX.modal }}
            aria-hidden="true"
          />

          {/* Scrollable viewport wrapper */}
          <div
            className="fixed inset-0 overflow-y-auto overscroll-contain"
            onClick={onClose}
            style={{ zIndex: Z_INDEX.modal }}
          >
            {/* Animated card — will-change-transform promotes to GPU layer */}
            <m.div
              ref={modalRef}
              key="modal-card"
              initial={INTERACTION_TOKENS.entrance.fadeScaleRotate.initial}
              animate={INTERACTION_TOKENS.entrance.fadeScaleRotate.animate}
              exit={INTERACTION_TOKENS.exit.fadeScaleRotate}
              transition={{ type: 'spring', ...ANIMATION_TOKENS.spring.gentle }}
              className={cn("relative mx-3 md:mx-auto will-change-transform", className)}
              style={style}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
