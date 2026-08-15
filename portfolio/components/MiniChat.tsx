"use client";

import { useState, useCallback, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { stickerBus } from '@/lib/stickerBus';
import { cn } from '@/lib/utils';
import { Z_INDEX } from '@/lib/designTokens';

const MiniChatPanel = dynamic(() => import('./MiniChatPanel'), {
  ssr: false,
  loading: () => null,
});

// Hoisted style and animation constants — avoids re-allocation per render
const FAB_BUTTON_STYLE = { transform: 'rotate(3deg)' } as const;
const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
const getVoiceModeSnapshot = () => Boolean(document.documentElement.dataset.voiceMode);
const getServerVoiceModeSnapshot = () => false;
const subscribeToVoiceMode = (onStoreChange: () => void) => {
  window.addEventListener('voice-mode:change', onStoreChange);
  return () => window.removeEventListener('voice-mode:change', onStoreChange);
};

interface MiniChatState {
  pathname: string;
  isOpen: boolean;
}

// Sketchbook-themed sticky note + pencil doodle icon
function StickyNoteDoodle() {
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
}

function CloseDoodle() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 6.5c3.5 3 7.5 7 12 11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 6.5c-3.8 3.7-7.8 7.5-12 11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function MiniChat() {
  const pathname = usePathname();
  const [chatState, setChatState] = useState<MiniChatState>({ pathname, isOpen: false });
  const hasMounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const voiceModeActive = useSyncExternalStore(
    subscribeToVoiceMode,
    getVoiceModeSnapshot,
    getServerVoiceModeSnapshot,
  );

  if (chatState.pathname !== pathname) {
    setChatState({ pathname, isOpen: false });
  }

  const isOpen = chatState.pathname === pathname && chatState.isOpen;

  const handleClose = useCallback(() => {
    setChatState({ pathname, isOpen: false });
  }, [pathname]);

  const handleToggle = useCallback(() => {
    setChatState(previousState => {
      const nextIsOpen = previousState.pathname !== pathname || !previousState.isOpen;
      if (nextIsOpen) {
        stickerBus.emit('note-passer');
      }
      return { pathname, isOpen: nextIsOpen };
    });
  }, [pathname]);

  // Don't show on /chat page (or any nested /chat/* route)
  if (pathname?.startsWith('/chat')) return null;
  if (voiceModeActive) return null;
  if (!hasMounted) return null;

  return (
    <div
      data-mini-chat-root
      className="fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[var(--c-mobile-floating-bottom)] md:right-20 md:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
      style={{ zIndex: Z_INDEX.nav }}
    >
      {isOpen ? <MiniChatPanel onClose={handleClose} /> : null}

      {/* Floating sticky note button */}
      <button
        onClick={handleToggle}
        className={cn(
          "group relative h-[max(var(--c-fab-size),44px)] w-[max(var(--c-fab-size),44px)] md:h-[max(var(--c-fab-size-md),44px)] md:w-[max(var(--c-fab-size-md),44px)] rounded shadow-lg flex items-center justify-center transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95",
          isOpen
            ? "bg-[var(--note-ai)] text-[var(--note-ai-ink)]"
            : "bg-[var(--note-user)] text-amber-700 dark:text-amber-300",
        )}
        title="Ask Dhruv"
        aria-label="Open quick chat"
        aria-expanded={isOpen}
        style={FAB_BUTTON_STYLE}
        data-disco-bounce="4"
        data-clickable
      >
        {isOpen ? (
          <span className="text-rose-600 dark:text-rose-300 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110 max-[480px]:scale-[0.84]">
            <CloseDoodle />
          </span>
        ) : (
          <>
            <span className="max-[480px]:scale-[0.84]">
              <StickyNoteDoodle />
            </span>
            {/* Pulsing dot */}
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full shadow border-2 border-emerald-500 bg-transparent animate-pulse max-[480px]:w-2.5 max-[480px]:h-2.5" />
          </>
        )}
      </button>
    </div>
  );
}
