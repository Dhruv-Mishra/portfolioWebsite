"use client";

import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import StickyNoteChat from './StickyNoteChat';
import { CHAT_CONFIG } from '@/lib/chatContext';
import { cn } from '@/lib/utils';

// Sketchbook-themed sticky note + pencil doodle icon
const StickyNoteDoodle = () => (
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

export default function MiniChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Hydration-safe mount
  useEffect(() => {
    setHasMounted(true);
    // Check if user dismissed mini-chat this session
    const dismissed = sessionStorage.getItem(CHAT_CONFIG.miniChatDismissedKey);
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Close the mini-chat when the user navigates to a different page
  useEffect(() => {
    if (isOpen) {
      setIsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to pathname changes, not isOpen
  }, [pathname]);

  // Don't show on /chat page
  if (pathname === '/chat') return null;
  if (!hasMounted) return null;

  const handleDismiss = () => {
    setIsOpen(false);
    setIsDismissed(true);
    sessionStorage.setItem(CHAT_CONFIG.miniChatDismissedKey, 'true');
  };

  const handleToggle = () => {
    if (isDismissed) {
      setIsDismissed(false);
      sessionStorage.removeItem(CHAT_CONFIG.miniChatDismissedKey);
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-20 z-50">
      <AnimatePresence>
        {isOpen && !isDismissed && (
          <m.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
              "absolute bottom-16 right-0 bg-[var(--c-paper)] border border-[var(--c-grid)]/30 rounded-lg shadow-2xl overflow-hidden",
              // Mobile: full screen overlay
              "w-[calc(100vw-2rem)] h-[70vh] md:w-[380px] md:h-[480px]",
              "max-w-[380px]",
            )}
            style={{ transform: 'rotate(-0.5deg)' }}
          >
            {/* Chat content — full height, controls are inside StickyNoteChat */}
            <div className="h-full relative">
              {/* Expand + close buttons overlaid top-right */}
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
                  title="Close chat"
                >
                  <X size={14} />
                </button>
              </div>
              <StickyNoteChat compact />
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Floating sticky note button */}
      {!isDismissed || !isOpen ? (
        <m.button
          onClick={handleToggle}
          whileHover={{ scale: 1.1, rotate: -5 }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 15 } }}
          className={cn(
            "relative w-12 h-12 md:w-14 md:h-14 rounded shadow-lg flex items-center justify-center transition-colors",
            isOpen
              ? "bg-[var(--note-ai)] text-[var(--note-ai-ink)]"
              : "bg-[var(--note-user)] text-amber-700 dark:text-amber-300",
          )}
          title="Ask Dhruv"
          aria-label="Open quick chat"
          style={{ transform: 'rotate(3deg)' }}
        >
          {isOpen ? (
            <X size={22} />
          ) : (
            <>
              <StickyNoteDoodle />
              {/* Pulsing dot */}
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full shadow border-2 border-emerald-500 bg-transparent animate-pulse" />
            </>
          )}
        </m.button>
      ) : null}
    </div>
  );
}
