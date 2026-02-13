"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, ExternalLink } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import StickyNoteChat from './StickyNoteChat';
import { CHAT_CONFIG } from '@/lib/chatContext';
import { cn } from '@/lib/utils';

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
          <motion.div
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
            {/* Mini-chat header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-grid)]/20 bg-[var(--note-user)]/30">
              <span className="font-hand font-bold text-sm text-[var(--c-ink)]">
                💬 Quick Note to Dhruv
              </span>
              <div className="flex items-center gap-1">
                <Link
                  href="/chat"
                  className="p-1 text-[var(--c-ink)] opacity-50 hover:opacity-100 transition-opacity"
                  title="Open full chat"
                >
                  <ExternalLink size={14} />
                </Link>
                <button
                  onClick={handleDismiss}
                  className="p-1 text-[var(--c-ink)] opacity-50 hover:opacity-100 transition-opacity"
                  title="Close chat"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Chat content */}
            <div className="h-[calc(100%-2.5rem)]">
              <StickyNoteChat compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating sticky note button */}
      {!isDismissed || !isOpen ? (
        <motion.button
          onClick={handleToggle}
          whileHover={{ scale: 1.1, rotate: -5 }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
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
              <MessageSquare size={22} />
              {/* Pulsing dot */}
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow" />
            </>
          )}
        </motion.button>
      ) : null}
    </div>
  );
}
