"use client";

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useAppHaptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import StickyNoteChat from './StickyNoteChat';
import { ANIMATION_TOKENS, INTERACTION_TOKENS } from '@/lib/designTokens';

export interface MiniChatPanelProps {
  onClose: () => void;
}

const CHAT_PANEL_STYLE = { transform: 'rotate(-0.5deg)' } as const;
const GENTLE_SPRING_TRANSITION = { type: 'spring' as const, ...ANIMATION_TOKENS.spring.gentle };

export default function MiniChatPanel({ onClose }: MiniChatPanelProps) {
  const { closePanel, navigate, openPanel } = useAppHaptics();

  useEffect(() => {
    openPanel();
  }, [openPanel]);

  const handleClose = useCallback(() => {
    closePanel();
    onClose();
  }, [closePanel, onClose]);

  return (
    <>
      <m.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: ANIMATION_TOKENS.duration.fast }}
        className="fixed inset-0 -z-10 cursor-default bg-transparent"
        aria-label="Close quick chat"
        onClick={handleClose}
      />
      <m.div
        initial={INTERACTION_TOKENS.entrance.popIn.initial}
        animate={INTERACTION_TOKENS.entrance.popIn.animate}
        transition={GENTLE_SPRING_TRANSITION}
        data-disco-motion="breath"
        className={cn(
          "absolute bottom-16 right-0 bg-[var(--c-paper)] border border-[var(--c-grid)]/30 rounded-lg shadow-lg md:shadow-2xl overflow-hidden",
          "w-[var(--c-chat-w)] h-[var(--c-chat-h)] md:w-[var(--c-chat-w-md)] md:h-[var(--c-chat-h-md)]",
          "max-w-[var(--c-chat-max-w)]",
        )}
        style={CHAT_PANEL_STYLE}
      >
        <div className="h-full relative">
          <div className="absolute inset-x-0 top-0 z-20 border-b border-[var(--c-grid)]/20 bg-[var(--note-user)]/78 px-4 pt-3 pb-2 md:bg-[var(--note-user)]/55 md:backdrop-blur-[1px]" style={{ willChange: 'backdrop-filter' }}>
            <div className="pr-24">
              <div className="font-hand text-xl font-bold leading-none text-[var(--c-heading)]">
                Quick chat
              </div>
              <div className="mt-1 font-hand text-sm text-[var(--c-ink)]/60">
                Pass me a note without leaving the page.
              </div>
              <WavyUnderline className="!mt-1.5 opacity-45" />
            </div>
          </div>

          <div className="absolute top-1.5 right-1.5 z-30 flex items-center gap-1">
            <Link
              href="/chat"
              onClick={navigate}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--c-ink)] opacity-45 transition-opacity hover:bg-[var(--c-ink)]/5 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/50"
              title="Open full chat"
              aria-label="Open full chat"
            >
              <ExternalLink size={14} />
            </Link>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--c-ink)] opacity-45 transition-opacity hover:bg-[var(--c-ink)]/5 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/50"
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
  );
}