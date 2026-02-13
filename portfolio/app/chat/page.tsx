"use client";

import { motion } from 'framer-motion';
import StickyNoteChat from '@/components/StickyNoteChat';

export default function ChatPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full max-w-3xl mx-auto flex flex-col"
    >
      <StickyNoteChat />
    </motion.div>
  );
}
