"use client";

import { m } from 'framer-motion';
import StickyNoteChat from '@/components/StickyNoteChat';

export default function ChatPage() {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full max-w-3xl mx-auto flex flex-col pt-14 md:pt-0"
    >
      <StickyNoteChat />
    </m.div>
  );
}
