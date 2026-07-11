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

  return (
    // Top padding tracks the live nav-tab CSS variables so the chat header
    // ("Pass me a note" / "Ask me anything ~") never tucks under the
    // pulltabs at any size scale. On mobile the tabs span the full width,
    // so we clear the full pulltab height (--c-nav-tab-pt + --c-nav-tab-py +
    // breathing room). Desktop tabs live off to the right edge — a small
    // pt-6 there is enough.
    <div
      className="-mx-3 -my-6 h-[calc(100%+3rem)] overflow-hidden sm:-mx-5 sm:-my-8 sm:h-[calc(100%+4rem)] md:-m-12 md:h-[calc(100%+6rem)]"
    >
      <div
        data-disco-chat-page
        data-disco-motion="breath"
        style={{ '--disco-motion-delay': '140ms' } as CSSProperties}
        className="h-full max-w-3xl mx-auto flex flex-col pt-[calc(var(--c-nav-tab-pt)+var(--c-nav-tab-py)+0.5rem)] md:pt-6"
      >
        <StickyNoteChat />
      </div>
    </div>
  );
}
