"use client";

import { useEffect, type CSSProperties } from 'react';
import StickyNoteChat from '@/components/StickyNoteChat';
import { stickerBus } from '@/lib/stickerBus';

export default function ChatPage() {
  // Scope-cut: emit on page mount rather than on first message.
  // Opening the dedicated chat page is itself the meaningful signal.
  useEffect(() => {
    stickerBus.emit('full-chat');
  }, []);

  // Mobile scroll containment: the dedicated chat route should behave like
  // a real mobile chat app — only the messages list scrolls; the page
  // chrome (header, input bar) stays pinned. We do this by flipping the
  // shared <main id="main-content"> container's overflow off while the
  // chat page is mounted, then restoring it on unmount. Desktop is
  // unaffected because StickyNoteChat is already an internal-flex shell.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const main = document.getElementById('main-content');
    if (!main) return;
    const prevOverflow = main.style.overflow;
    const prevOverscroll = main.style.overscrollBehavior;
    main.style.overflow = 'hidden';
    main.style.overscrollBehavior = 'contain';
    return () => {
      main.style.overflow = prevOverflow;
      main.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  return (
    // Top padding tracks the live nav-tab CSS variables so the chat header
    // ("Pass me a note" / "Ask me anything ~") never tucks under the
    // pulltabs at any size scale. On mobile the tabs span the full width,
    // so we clear the full pulltab height (--c-nav-tab-pt + --c-nav-tab-py +
    // breathing room). Desktop tabs live off to the right edge — a small
    // pt-6 there is enough.
    <div
      data-disco-chat-page
      data-disco-motion="breath"
      style={{ '--disco-motion-delay': '140ms' } as CSSProperties}
      className="h-full max-w-3xl mx-auto flex flex-col pt-[calc(var(--c-nav-tab-pt)+var(--c-nav-tab-py)+0.5rem)] md:pt-6"
    >
      <StickyNoteChat />
    </div>
  );
}
