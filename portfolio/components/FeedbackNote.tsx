"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Bug, Lightbulb, Heart, MessageSquare, Send, X, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { rateLimiter, RATE_LIMITS } from '@/lib/rateLimit';
import { TAPE_STYLE } from '@/lib/constants';

// ─── Types ──────────────────────────────────────────────────────────────
type FeedbackCategory = 'bug' | 'idea' | 'kudos' | 'other';
type FeedbackState = 'idle' | 'submitting' | 'success' | 'error';

const CATEGORIES: { id: FeedbackCategory; label: string; icon: typeof Bug; color: string }[] = [
  { id: 'bug', label: 'Bug', icon: Bug, color: 'bg-[#ff9b9b] text-red-900 border-red-300' },
  { id: 'idea', label: 'Idea', icon: Lightbulb, color: 'bg-[#ffe082] text-amber-900 border-amber-400' },
  { id: 'kudos', label: 'Kudos', icon: Heart, color: 'bg-[#f8bbd0] text-pink-900 border-pink-300' },
  { id: 'other', label: 'Other', icon: MessageSquare, color: 'bg-[#c5e1a5] text-green-900 border-green-300' },
];

const MAX_MESSAGE_LENGTH = 1000;
const FEEDBACK_DRAFT_KEY = 'dhruv-feedback-draft';

// ─── Tape Strip (reused from StickyNoteChat) ────────────────────────────
const TapeStrip = ({ className }: { className?: string }) => (
  <div
    className={cn("absolute -top-3 left-1/2 -translate-x-1/2 w-24 md:w-32 h-7 md:h-9 shadow-sm z-20", className)}
    style={TAPE_STYLE}
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
      whileHover={{ scale: 1.15, rotate: -8, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.9, transition: { duration: 0.1 } }}
      onClick={onClick}
      className={cn(
        "fixed bottom-[8.5rem] md:bottom-20 right-4 md:right-8 z-40",
        "w-10 h-10 md:w-11 md:h-11 rounded-full",
        "bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/50",
        "shadow-md hover:shadow-lg",
        "flex items-center justify-center",
        "text-[var(--c-ink)] opacity-50 hover:opacity-100",
        "transition-[opacity,box-shadow] duration-150",
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

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem(FEEDBACK_DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.message) setMessage(parsed.message);
        if (parsed.category) setCategory(parsed.category);
      }
    } catch { /* ignore */ }
  }, []);

  // Save draft to localStorage when message or category changes (debounced)
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (message || category !== 'bug') {
          localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify({ message, category }));
        } else {
          localStorage.removeItem(FEEDBACK_DRAFT_KEY);
        }
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(id);
  }, [message, category]);

  const clearDraft = useCallback(() => {
    setMessage('');
    setCategory('bug');
    try { localStorage.removeItem(FEEDBACK_DRAFT_KEY); } catch { /* ignore */ }
  }, []);

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
      // Clear draft on successful send
      try { localStorage.removeItem(FEEDBACK_DRAFT_KEY); } catch { /* ignore */ }
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
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-[60]"
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
            <div className="p-4 pt-7 pb-4 md:p-5 md:pt-9 md:pb-5">
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
                  <div className="flex justify-center gap-2 mt-3 mb-3">
                    {CATEGORIES.map((cat) => {
                      const active = category === cat.id;
                      return (
                        <m.button
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          animate={{ scale: active ? 1.08 : 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          className={cn(
                            "px-4 py-1.5 rounded-full border-2 font-hand font-bold text-sm",
                            cat.color,
                            active
                              ? "shadow-md opacity-100 border-[var(--c-grid)]/50"
                              : "opacity-50 hover:opacity-80 border-transparent",
                          )}
                        >
                          <cat.icon size={14} className="inline mr-1 -mt-0.5" />
                          {cat.label}
                        </m.button>
                      );
                    })}
                  </div>

                  {/* Text area with spiral notepad */}
                  <div className="relative">
                    {/* Spiral binding holes */}
                    <div className="absolute top-0 left-0 right-0 h-6 bg-[var(--c-paper)] border-2 border-b-0 border-[var(--c-grid)]/30 rounded-t-md z-10 flex items-center justify-evenly px-2">
                      {Array.from({ length: 15 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-2.5 h-2.5 flex-shrink-0 rounded-full border-2 border-[var(--c-grid)]/40 bg-[var(--c-paper)]"
                          style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}
                        />
                      ))}
                    </div>
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
                          : category === 'kudos'
                          ? "What do you like about this site?"
                          : "What's on your mind?"
                      }
                      rows={12}
                      disabled={state === 'submitting'}
                      className={cn(
                        "w-full bg-[var(--c-paper)] border-2 border-[var(--c-grid)]/30 rounded-md",
                        "px-3 pb-3 font-hand text-sm md:text-base text-[var(--c-ink)]",
                        "placeholder:text-[var(--c-ink)]/30",
                        "focus:outline-none focus:border-[var(--c-grid)]/60",
                        "resize-none transition-colors",
                        "disabled:opacity-50",
                      )}
                      style={{
                        backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, var(--c-grid) 23px, var(--c-grid) 24px)',
                        backgroundAttachment: 'local',
                        backgroundPosition: '0 26px',
                        lineHeight: '24px',
                        paddingTop: '26px',
                      }}
                    />
                    {/* Character count */}
                    <span className="absolute bottom-2 right-3 text-xs text-[var(--c-ink)] opacity-30 font-code">
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                  </div>

                  {/* Action bar: page info, clear, send */}
                  <div className="flex items-center justify-between mt-2 px-1">
                    <p className="text-xs text-[var(--c-ink)] opacity-30 truncate mr-2">
                      {pathname} &middot; {resolvedTheme} &middot; Ctrl+Enter
                    </p>
                    <div className="flex items-center gap-2">
                      {message.length > 0 && (
                        <m.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={clearDraft}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1.5 rounded-md",
                            "border-2 border-dashed border-[var(--c-grid)]/40",
                            "text-[var(--c-ink)] opacity-50 hover:opacity-80",
                            "font-hand text-sm transition-opacity",
                          )}
                          title="Clear text"
                        >
                          <Trash2 size={13} />
                          Clear
                        </m.button>
                      )}
                      <m.button
                        whileHover={{ scale: 1.05, rotate: -1 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={handleSubmit}
                        disabled={!message.trim() || state === 'submitting'}
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-1.5 rounded-md",
                          "bg-[var(--c-ink)] text-[var(--c-paper)]",
                          "font-hand font-bold text-sm",
                          "shadow-sm transition-opacity",
                          "disabled:opacity-30 disabled:cursor-not-allowed",
                          state === 'submitting' && "animate-pulse",
                        )}
                      >
                        <Send size={14} />
                        {state === 'submitting' ? 'Sending...' : 'Send'}
                      </m.button>
                    </div>
                  </div>

                  {/* Error message */}
                  {errorMsg && (
                    <m.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400 mt-1"
                    >
                      <AlertTriangle size={14} />
                      {errorMsg}
                    </m.p>
                  )}
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
