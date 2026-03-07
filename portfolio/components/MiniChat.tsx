"use client";

import { useState, useEffect, useCallback, memo } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Trash2, X, ExternalLink } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import { INTERACTION_TOKENS, ANIMATION_TOKENS, Z_INDEX } from '@/lib/designTokens';

// Lazy-load StickyNoteChat — it's a large component only needed when mini-chat is open
const StickyNoteChat = dynamic(() => import('./StickyNoteChat'), { ssr: false });

// Hoisted style and animation constants — avoids re-allocation per render
const CHAT_PANEL_STYLE = { transform: 'rotate(-0.5deg)' } as const;
const FAB_BUTTON_STYLE = { transform: 'rotate(3deg)' } as const;
const GENTLE_SPRING_TRANSITION = { type: 'spring' as const, ...ANIMATION_TOKENS.spring.gentle };
const FAB_ANIMATE = { opacity: 1, scale: 1, transition: { type: 'spring' as const, ...ANIMATION_TOKENS.spring.bouncy } };

// Sketchbook-themed sticky note + pencil doodle icon
const StickyNoteDoodle = memo(function StickyNoteDoodle() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Sticky note */}
      <rect x="3" y="5" width="20" height="20" rx="1" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Folded corner */}
      <path d="M17 25 L23 25 L23 19 Z" fill="var(--c-paper, white)" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Pencil */}
      <line x1="18" y1="27" x2="30" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="29" y1="7" x2="27" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Lines on note */}
      <line x1="6" y1="11" x2="17" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="6" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="6" y1="19" x2="12" y2="19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
});

export default function MiniChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Hydration-safe mount
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Close the mini-chat when the user navigates to a different page
  useEffect(() => {
    if (isOpen) {
      setIsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to pathname changes, not isOpen
  }, [pathname]);

  const handleDismiss = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // Don't show on /chat page
  if (pathname === '/chat') return null;
  if (!hasMounted) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-20" style={{ zIndex: Z_INDEX.nav }}>
      <AnimatePresence>
        {isOpen && (
          <>
            <m.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: ANIMATION_TOKENS.duration.fast }}
              className="fixed inset-0 -z-10 cursor-default bg-transparent"
              aria-label="Close quick chat"
              onClick={handleClose}
            />
            <m.div
              initial={INTERACTION_TOKENS.entrance.popIn.initial}
              animate={INTERACTION_TOKENS.entrance.popIn.animate}
              exit={INTERACTION_TOKENS.exit.popOut}
              transition={GENTLE_SPRING_TRANSITION}
              className={cn(
                "absolute bottom-16 right-0 bg-[var(--c-paper)] border border-[var(--c-grid)]/30 rounded-lg shadow-lg md:shadow-2xl overflow-hidden",
                // Mobile: full screen overlay
                "w-[var(--c-chat-w)] h-[var(--c-chat-h)] md:w-[var(--c-chat-w-md)] md:h-[var(--c-chat-h-md)]",
                "max-w-[var(--c-chat-max-w)]",
              )}
              style={CHAT_PANEL_STYLE}
            >
              {/* Chat content — full height, controls are inside StickyNoteChat */}
              <div className="h-full relative">
                <div className="absolute inset-x-0 top-0 z-20 border-b border-[var(--c-grid)]/20 bg-[var(--note-user)]/78 px-4 pt-3 pb-2 md:bg-[var(--note-user)]/55 md:backdrop-blur-[1px]">
                  <div className="pr-16">
                    <div className="font-hand text-xl font-bold leading-none text-[var(--c-heading)]">
                      Quick chat
                    </div>
                    <div className="mt-1 font-hand text-sm text-[var(--c-ink)]/60">
                      Pass me a note without leaving the page.
                    </div>
                    <WavyUnderline className="!mt-1.5 opacity-45" />
                  </div>
                </div>

                {/* Expand + dismiss buttons overlaid top-right */}
                <div className="absolute top-2 right-2 z-30 flex items-center gap-1">
                  <Link
                    href="/chat"
                    className="p-1 text-[var(--c-ink)] opacity-40 hover:opacity-80 transition-opacity"
                    title="Open full chat"
                  >
                    <ExternalLink size={14} />
                  </Link>
                  <button
                    onClick={handleDismiss}
                    className="p-1 text-[var(--c-ink)] opacity-40 hover:opacity-80 transition-opacity"
                    title="Close quick chat"
                    aria-label="Close quick chat"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="h-full pt-16">
                  <StickyNoteChat compact />
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating sticky note button */}
      <m.button
        onClick={handleToggle}
        whileHover={INTERACTION_TOKENS.hover.scaleUp}
        whileTap={INTERACTION_TOKENS.tap.press}
        initial={{ opacity: 0, scale: 0 }}
        animate={FAB_ANIMATE}
        className={cn(
          "group relative w-[var(--c-fab-size)] h-[var(--c-fab-size)] md:w-[var(--c-fab-size-md)] md:h-[var(--c-fab-size-md)] rounded shadow-lg flex items-center justify-center transition-colors",
          isOpen
            ? "bg-[var(--note-ai)] text-[var(--note-ai-ink)]"
            : "bg-[var(--note-user)] text-amber-700 dark:text-amber-300",
        )}
        title="Ask Dhruv"
        aria-label="Open quick chat"
        style={FAB_BUTTON_STYLE}
      >
        {isOpen ? (
          <X size={22} className="text-rose-600 dark:text-rose-300 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" strokeWidth={2.4} />
        ) : (
          <>
            <StickyNoteDoodle />
            {/* Pulsing dot */}
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full shadow border-2 border-emerald-500 bg-transparent animate-pulse" />
          </>
        )}
      </m.button>
    </div>
  );
}
