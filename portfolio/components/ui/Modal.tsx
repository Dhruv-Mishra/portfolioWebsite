"use client";

import { useEffect, useEffectEvent, useRef, useSyncExternalStore, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence, usePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ANIMATION_TOKENS, INTERACTION_TOKENS, Z_INDEX } from '@/lib/designTokens';
import { soundManager } from '@/lib/soundManager';

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

const subscribeToClient = () => () => undefined;

interface ModalContentProps extends Omit<ModalProps, 'isOpen'> {
  modalRef: React.RefObject<HTMLDivElement | null>;
}

function ModalContent({
  onClose,
  children,
  className,
  style,
  ariaLabel,
  ariaLabelledBy,
  backdropClassName = "bg-black/20 dark:bg-black/40",
  modalRef,
}: ModalContentProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const [isPresent, safeToRemove] = usePresence();
  const removeFromPresence = useEffectEvent(() => safeToRemove?.());

  useEffect(() => {
    if (isPresent) return;
    const exitDelayMs = ANIMATION_TOKENS.duration.normal * 1000 + 100;
    const timer = window.setTimeout(removeFromPresence, exitDelayMs);
    return () => window.clearTimeout(timer);
  }, [isPresent]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const originalOverflow = document.body.style.overflow;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const getFocusable = (): HTMLElement[] => Array.from(
      modal.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');

    document.body.style.overflow = 'hidden';
    (getFocusable()[0] ?? modal).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      openerRef.current?.focus();
    };
  }, [modalRef, onClose]);

  return (
    <>
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

      <div
        className="fixed inset-0 overflow-y-auto overscroll-contain"
        onClick={onClose}
        style={{ zIndex: Z_INDEX.modal }}
      >
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
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </m.div>
      </div>
    </>
  );
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
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);

  // ── Open / close sound cues ─────────────────────────────────────────
  // `isOpen` transitions are our cue. Skipping the very first mount means
  // a modal that boots already-open (rare but possible via state rehydration)
  // doesn't double-fire. The manager debounces within 200ms so a rapid open
  // → close → open doesn't machine-gun.
  const prevOpenRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevOpenRef.current === null) {
      prevOpenRef.current = isOpen;
      if (isOpen) soundManager.play('modal-open');
      return;
    }
    if (prevOpenRef.current === isOpen) return;
    prevOpenRef.current = isOpen;
    soundManager.play(isOpen ? 'modal-open' : 'modal-close');
  }, [isOpen]);

  // ── Render ──────────────────────────────────────────────────────────
  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <ModalContent
          key="modal-content"
          modalRef={modalRef}
          onClose={onClose}
          className={className}
          style={style}
          ariaLabel={ariaLabel}
          ariaLabelledBy={ariaLabelledBy}
          backdropClassName={backdropClassName}
        >
          {children}
        </ModalContent>
      )}
    </AnimatePresence>,
    document.body,
  );
}
