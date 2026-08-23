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
    <div className="h-full overflow-hidden">
      <div
        data-disco-chat-page
        data-disco-motion="breath"
        style={{ '--disco-motion-delay': '140ms' } as CSSProperties}
        className="h-full max-w-3xl mx-auto flex flex-col"
      >
        <StickyNoteChat />
      </div>
    </div>
  );
}
