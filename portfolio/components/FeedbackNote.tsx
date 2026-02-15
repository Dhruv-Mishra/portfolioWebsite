"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Bug, Lightbulb, MessageSquare, Send, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { rateLimiter, RATE_LIMITS } from '@/lib/rateLimit';

// ─── Types ──────────────────────────────────────────────────────────────
type FeedbackCategory = 'bug' | 'idea' | 'other';
type FeedbackState = 'idle' | 'submitting' | 'success' | 'error';

const CATEGORIES: { id: FeedbackCategory; label: string; icon: typeof Bug; color: string }[] = [
  { id: 'bug', label: 'Bug', icon: Bug, color: 'bg-[#ff9b9b] text-red-900 border-red-300' },
  { id: 'idea', label: 'Idea', icon: Lightbulb, color: 'bg-[#fff9c4] text-yellow-900 border-yellow-300' },
  { id: 'other', label: 'Other', icon: MessageSquare, color: 'bg-[#c5e1a5] text-green-900 border-green-300' },
];

const MAX_MESSAGE_LENGTH = 1000;

// ─── Tape Strip (reused from StickyNoteChat) ────────────────────────────
const TapeStrip = ({ className }: { className?: string }) => (
  <div
    className={cn("absolute -top-3 left-1/2 -translate-x-1/2 w-24 md:w-32 h-7 md:h-9 shadow-sm z-20", className)}
    style={{
      backgroundColor: 'var(--tape-color, rgba(210, 180, 140, 0.55))',
      clipPath: 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)',
    }}
  />
);

// ─── Wavy Underline SVG (reused from StickyNoteChat) ────────────────────
const WavyUnderline = () => (
  <svg className="w-full h-3 mt-1" viewBox="0 0 300 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M0 6 Q25 0 50 6 Q75 12 100 6 Q125 0 150 6 Q175 12 200 6 Q225 0 250 6 Q275 12 300 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.3"
    />
  </svg>
);

// ─── Paper Airplane fly-away animation ──────────────────────────────────
const PaperAirplaneSuccess = () => (
  <m.div
    initial={{ opacity: 0, scale: 0.5, y: 0, x: 0, rotate: 0 }}
    animate={{
      opacity: [0, 1, 1, 0],
      scale: [0.5, 1.2, 1, 0.8],
      y: [0, -10, -60, -120],
      x: [0, 5, 30, 80],
      rotate: [0, -10, -20, -45],
    }}
    transition={{ duration: 1.2, ease: 'easeOut' }}
    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl pointer-events-none z-30"
  >
    ✈️
  </m.div>
);

// ═════════════════════════════════════════════════
// ─── Floating Feedback Icon (right side, minimal) ──────────
// ═════════════════════════════════════════════════
export function FeedbackTab({ onClick }: { onClick: () => void }) {
  return (
    <m.button
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.5, type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.15, rotate: -8 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={cn(
        "fixed bottom-20 md:bottom-8 right-4 md:right-8 z-40",
        "w-10 h-10 md:w-11 md:h-11 rounded-full",
        "bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/50",
        "shadow-md hover:shadow-lg",
        "flex items-center justify-center",
        "text-[var(--c-ink)] opacity-50 hover:opacity-100",
        "transition-all duration-200",
      )}
      title="Send feedback"
      aria-label="Open feedback form"
    >
      <MessageSquare size={18} className="md:w-5 md:h-5" />
    </m.button>
  );
}

// ═════════════════════════════════════════════════
// ─── Main Feedback Modal ────────────────────────
// ═════════════════════════════════════════════════
interface FeedbackNoteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackNote({ isOpen, onClose }: FeedbackNoteProps) {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<FeedbackState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setState('idle');
      setErrorMsg('');
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length < 5) {
      setErrorMsg('Please write at least 5 characters.');
      return;
    }

    // Client-side rate limit
    if (!rateLimiter.check('feedback', RATE_LIMITS.FEEDBACK)) {
      const remaining = rateLimiter.getRemainingTime('feedback', RATE_LIMITS.FEEDBACK);
      setErrorMsg(`Too many submissions. Try again in ${remaining} seconds.`);
      return;
    }

    setState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: trimmed,
          page: pathname,
          theme: resolvedTheme || 'unknown',
          viewport: typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : 'unknown',
          userAgent: typeof navigator !== 'undefined'
            ? navigator.userAgent.slice(0, 200)
            : 'unknown',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `Error ${res.status}`);
      }

      setState('success');
      // Auto-close after success
      setTimeout(() => {
        setMessage('');
        setCategory('bug');
        onClose();
        // Reset state after close animation
        setTimeout(() => setState('idle'), 300);
      }, 2000);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    }
  }, [message, category, pathname, resolvedTheme, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] z-[60]"
          />

          {/* Modal */}
          <m.div
            initial={{ opacity: 0, scale: 0.85, y: 40, rotate: 2 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotate: -1 }}
            exit={{ opacity: 0, scale: 0.85, y: 40, rotate: 2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
              "fixed z-[61] inset-x-3 md:inset-x-auto",
              "md:left-1/2 md:-translate-x-1/2",
              "top-[8vh] md:top-[12vh]",
              "w-auto md:w-[500px] max-w-[500px]",
              "mt-4",  // Room for tape strip above
              "bg-[var(--note-user)] shadow-xl",
              "font-hand",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Feedback form"
          >
            {/* Tape strip */}
            <TapeStrip />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-30 p-1 text-[var(--c-ink)] opacity-40 hover:opacity-80 transition-opacity"
              aria-label="Close feedback"
            >
              <X size={18} />
            </button>

            {/* Content */}
            <div className="p-5 pt-8 pb-6 md:p-7 md:pt-10 md:pb-8">
              {/* Success state */}
              {state === 'success' ? (
                <m.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8 relative"
                >
                  <PaperAirplaneSuccess />
                  <CheckCircle size={40} className="mx-auto text-green-600 dark:text-green-400 mb-3" />
                  <p className="text-xl font-bold text-[var(--c-heading)]">Note sent!</p>
                  <p className="text-sm text-[var(--c-ink)] opacity-60 mt-1">Thanks for the feedback ~</p>
                </m.div>
              ) : (
                <>
                  {/* Heading */}
                  <h2 className="text-2xl md:text-3xl font-bold text-[var(--c-heading)] text-center mb-1">
                    Scribble me some feedback
                  </h2>
                  <WavyUnderline />

                  {/* Category tabs */}
                  <div className="flex justify-center gap-2 mt-4 mb-4">
                    {CATEGORIES.map((cat) => {
                      const active = category === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-b-lg border-x-2 border-b-2 font-hand font-bold text-sm transition-all duration-150",
                            cat.color,
                            active
                              ? "scale-105 shadow-md opacity-100"
                              : "opacity-60 hover:opacity-85 scale-95",
                          )}
                          style={{
                            clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)',
                          }}
                        >
                          <cat.icon size={13} className="inline mr-1 -mt-0.5" />
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Text area */}
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        category === 'bug'
                          ? "What went wrong? Where did it happen?"
                          : category === 'idea'
                          ? "What would make this site better?"
                          : "What's on your mind?"
                      }
                      rows={6}
                      disabled={state === 'submitting'}
                      className={cn(
                        "w-full bg-[var(--c-paper)] border-2 border-[var(--c-grid)]/30 rounded-md",
                        "p-3 font-hand text-base text-[var(--c-ink)]",
                        "placeholder:text-[var(--c-ink)]/30",
                        "focus:outline-none focus:border-[var(--c-grid)]/60",
                        "resize-none transition-colors",
                        "disabled:opacity-50",
                      )}
                      style={{
                        backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, var(--c-grid) 27px, var(--c-grid) 28px)',
                        backgroundPosition: '0 8px',
                        lineHeight: '28px',
                        paddingTop: '8px',
                      }}
                    />
                    {/* Character count */}
                    <span className="absolute bottom-2 right-3 text-xs text-[var(--c-ink)] opacity-30 font-code">
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                  </div>

                  {/* Auto-detected page */}
                  <p className="text-xs text-[var(--c-ink)] opacity-30 mt-1 ml-1">
                    Page: {pathname} &middot; {resolvedTheme} mode
                  </p>

                  {/* Error message */}
                  {errorMsg && (
                    <m.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400 mt-2"
                    >
                      <AlertTriangle size={14} />
                      {errorMsg}
                    </m.p>
                  )}

                  {/* Submit button */}
                  <div className="flex justify-end mt-4">
                    <m.button
                      whileHover={{ scale: 1.05, rotate: -1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSubmit}
                      disabled={!message.trim() || state === 'submitting'}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-md",
                        "bg-[var(--c-ink)] text-[var(--c-paper)]",
                        "font-hand font-bold text-base",
                        "shadow-md transition-opacity",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                        state === 'submitting' && "animate-pulse",
                      )}
                    >
                      <Send size={16} />
                      {state === 'submitting' ? 'Sending...' : 'Send note'}
                    </m.button>
                  </div>

                  {/* Keyboard shortcut hint */}
                  <p className="text-xs text-[var(--c-ink)] opacity-20 text-center mt-3">
                    Ctrl+Enter to send
                  </p>
                </>
              )}
            </div>

            {/* Folded corner */}
            <div
              className="absolute bottom-0 right-0 w-[20px] h-[20px] pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.06) 50%)',
              }}
            />
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
