"use client";

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Eraser } from 'lucide-react';
import { useStickyChat, ChatMessage } from '@/hooks/useStickyChat';
import { cn } from '@/lib/utils';
import { Thumbpin } from '@/components/DoodleIcons';

// ─── Pencil Animation SVG (shown while streaming) ───
const PencilWriting = ({ className }: { className?: string }) => (
  <svg className={cn("w-6 h-6 animate-pencil-write", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

// ─── Tape Strip SVG ───
const TapeStrip = ({ className }: { className?: string }) => (
  <div
    className={cn("absolute -top-2 left-1/2 -translate-x-1/2 w-20 md:w-28 h-6 md:h-8 bg-white/60 dark:bg-white/15 shadow-sm backdrop-blur-[1px] z-20", className)}
    style={{
      maskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
      WebkitMaskImage: 'linear-gradient(to right, transparent 2%, black 5%, black 95%, transparent 98%)',
    }}
  />
);

// ─── Wavy Underline SVG ───
const WavyUnderline = () => (
  <svg className="w-full h-3 mt-1" viewBox="0 0 300 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M0 6 Q25 0 50 6 Q75 12 100 6 Q125 0 150 6 Q175 12 200 6 Q225 0 250 6 Q275 12 300 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.3"
    />
  </svg>
);

// ─── Suggested Question Strip ───
const SuggestionStrip = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <motion.button
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.9 }}
    whileHover={{ scale: 1.05, rotate: -1 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="px-4 py-2 bg-[var(--c-paper)] border border-[var(--c-grid)] rounded shadow-sm font-hand text-sm md:text-base text-[var(--c-ink)] opacity-80 hover:opacity-100 transition-opacity"
    style={{
      clipPath: 'polygon(2% 0%, 98% 3%, 100% 97%, 0% 100%)',
    }}
  >
    {text}
  </motion.button>
);

// ─── Single Sticky Note ───
const StickyNote = memo(function StickyNote({
  message,
  isStreaming = false,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === 'user';
  const rotation = useRef(
    isUser
      ? (Math.random() * 2 + 1) // +1° to +3°
      : -(Math.random() * 2 + 1) // -1° to -3°
  ).current;

  return (
    <motion.div
      initial={isUser
        ? { opacity: 0, y: 30, rotate: rotation + 5 }
        : { opacity: 0, x: 50, rotate: rotation - 5 }
      }
      animate={{ opacity: message.isOld ? 0.7 : 1, y: 0, x: 0, rotate: rotation }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
        duration: 0.4,
      }}
      className={cn(
        "relative max-w-[85%] md:max-w-[70%] p-4 md:p-5 pb-6 md:pb-8 shadow-md font-hand text-base md:text-lg",
        isUser ? "self-start" : "self-end",
        isUser
          ? "bg-[var(--note-user)] text-[var(--note-user-ink)]"
          : "bg-[var(--note-ai)] text-[var(--note-ai-ink)]",
        message.isOld && "sepia-[.15] dark:sepia-0",
      )}
      style={{
        clipPath: isUser
          ? 'polygon(0% 0%, 100% 0%, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0% 100%)'
          : 'polygon(0% 0%, 100% 0%, 100% 100%, 20px 100%, 0% calc(100% - 20px))',
      }}
    >
      {/* Attachment: Thumbpin for user, Tape for AI */}
      {isUser ? (
        <div className="absolute -top-4 -left-1 scale-50 md:scale-60 hidden md:block">
          <Thumbpin />
        </div>
      ) : (
        <TapeStrip />
      )}

      {/* Mobile: colored left/right border instead of pins */}
      <div className={cn(
        "absolute top-0 bottom-0 w-1 md:hidden",
        isUser ? "left-0 bg-yellow-500/50" : "right-0 bg-emerald-500/50",
      )} />

      {/* Folded corner effect */}
      <div
        className={cn(
          "absolute pointer-events-none w-[20px] h-[20px]",
          isUser ? "bottom-0 right-0" : "bottom-0 left-0",
        )}
        style={{
          background: isUser
            ? 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.06) 50%)'
            : 'linear-gradient(225deg, transparent 50%, rgba(0,0,0,0.06) 50%)',
        }}
      />

      {/* Message content */}
      <div className="whitespace-pre-wrap break-words leading-relaxed">
        {message.content}
        {isStreaming && !message.content && (
          <span className="inline-block w-2 h-5 bg-current animate-pulse ml-0.5" />
        )}
      </div>

      {/* Pencil animation while streaming */}
      {isStreaming && message.content && (
        <div className="absolute bottom-1 right-3 text-[var(--note-ai-ink)] opacity-40">
          <PencilWriting />
        </div>
      )}

      {/* Signature */}
      <div className={cn(
        "absolute bottom-1.5 font-hand text-xs opacity-40 italic",
        isUser ? "right-3" : "left-3",
      )}>
        — {isUser ? 'You' : 'Dhruv'}
      </div>
    </motion.div>
  );
});

// ─── Welcome Note ───
const WelcomeNote = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0, rotate: -1.5 }}
    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    className="relative max-w-md mx-auto p-5 md:p-6 pb-8 bg-[var(--note-system)] text-[var(--note-system-ink)] shadow-md font-hand text-base md:text-lg"
    style={{
      clipPath: 'polygon(0% 0%, 100% 0%, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0% 100%)',
    }}
  >
    <TapeStrip />
    <div className="leading-relaxed">
      Hey! 👋 Ask me about my work at Microsoft, my projects, tech stack, or competitive programming. I&apos;ll answer as if we&apos;re passing notes in class.
    </div>
    <div className="absolute bottom-1.5 right-3 font-hand text-xs opacity-40 italic">
      — Dhruv
    </div>
  </motion.div>
);

// ─── Rate Limit Note ───
const RateLimitNote = ({ seconds }: { seconds: number }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1, rotate: 2 }}
    className="relative max-w-sm mx-auto p-4 bg-[#ffccbc] dark:bg-[#3e2723] text-orange-900 dark:text-orange-200 shadow-md font-hand text-sm md:text-base"
  >
    <TapeStrip />
    Whoa, slow down! Even sticky notes need a breather. Try again in {seconds} seconds. ⏳
  </motion.div>
);

// ─── Suggested Questions ───
const SUGGESTIONS = [
  "What's your tech stack?",
  "Tell me about Fluent UI",
  "How did you optimize cold starts?",
  "What's your CP rating?",
];

// ═════════════════════════════════════════════════
// ─── Main StickyNoteChat Component ───
// ═════════════════════════════════════════════════
export default function StickyNoteChat({ compact = false }: { compact?: boolean }) {
  const { messages, isStreaming, error, sendMessage, clearMessages, rateLimitRemaining } = useStickyChat();
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hide suggestions after first message
  useEffect(() => {
    if (messages.some(m => !m.isOld)) {
      setShowSuggestions(false);
    }
  }, [messages]);

  // Auto-scroll to newest note
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
    // Re-focus input
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestion = useCallback((text: string) => {
    setInput(text);
    inputRef.current?.focus();
  }, []);

  const hasMessages = messages.length > 0;
  const hasOldMessages = messages.some(m => m.isOld);

  return (
    <div className={cn(
      "flex flex-col h-full",
      compact ? "max-h-full" : ""
    )}>
      {/* ─── Header (full page only) ─── */}
      {!compact && (
        <div className="text-center pt-2 pb-4 md:pt-4 md:pb-6 shrink-0">
          <motion.h1
            initial={{ opacity: 0, rotate: -3 }}
            animate={{ opacity: 1, rotate: -2 }}
            className="text-4xl md:text-5xl font-hand font-bold text-[var(--c-heading)] inline-block"
          >
            Pass me a note
          </motion.h1>
          <WavyUnderline />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="font-hand text-lg md:text-xl text-[var(--c-ink)] opacity-60 mt-2"
          >
            Ask me anything — powered by AI, answered as Dhruv.
          </motion.p>
        </div>
      )}

      {/* ─── Messages Area ─── */}
      <div className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden px-2 md:px-6 py-4 flex flex-col gap-4 md:gap-5 scrollbar-thin scrollbar-thumb-gray-400/30 scrollbar-track-transparent",
        compact && "px-2 py-2 gap-3",
      )}>
        {/* Welcome note if no messages */}
        {!hasMessages && <WelcomeNote />}

        {/* Old messages divider */}
        {hasOldMessages && hasMessages && (
          <div className="flex items-center gap-3 opacity-40 my-2">
            <div className="flex-1 h-px bg-[var(--c-grid)]" />
            <span className="font-hand text-xs text-[var(--c-ink)]">old notes</span>
            <div className="flex-1 h-px bg-[var(--c-grid)]" />
          </div>
        )}

        {/* Suggested questions */}
        <AnimatePresence>
          {!hasMessages && showSuggestions && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap justify-center gap-2 md:gap-3 mt-4"
            >
              {SUGGESTIONS.map(q => (
                <SuggestionStrip key={q} text={q} onClick={() => handleSuggestion(q)} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        {messages.map((msg, idx) => (
          <StickyNote
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && msg.role === 'assistant' && idx === messages.length - 1}
          />
        ))}

        {/* Error / Rate limit notes */}
        {error && rateLimitRemaining && (
          <RateLimitNote seconds={rateLimitRemaining} />
        )}
        {error && !rateLimitRemaining && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 1 }}
            className="relative max-w-sm mx-auto p-4 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 shadow-md font-hand text-sm rounded"
          >
            <TapeStrip />
            {error}
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area (sticky note style) ─── */}
      <div className={cn(
        "shrink-0 px-2 md:px-6 pb-3 md:pb-4 pt-2",
        compact && "px-2 pb-2 pt-1",
      )}>
        {/* Clear desk button */}
        {hasMessages && (
          <div className="flex justify-end mb-2">
            <button
              onClick={clearMessages}
              className="flex items-center gap-1 text-xs font-hand text-[var(--c-ink)] opacity-40 hover:opacity-70 transition-opacity"
              title="Clear desk"
            >
              <Eraser size={14} />
              Clear desk
            </button>
          </div>
        )}

        {/* The input "sticky note" */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "relative bg-[var(--note-user)] rounded shadow-md border border-[var(--c-grid)]/20",
            compact ? "p-2" : "p-3 md:p-4",
          )}
          style={{
            transform: 'rotate(0.5deg)',
          }}
        >
          {/* Thumbpin on input */}
          {!compact && (
            <div className="absolute -top-4 -left-1 scale-40 md:scale-50 hidden md:block">
              <Thumbpin />
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a note..."
              rows={compact ? 1 : 2}
              disabled={isStreaming}
              className={cn(
                "flex-1 bg-transparent resize-none font-hand text-[var(--note-user-ink)] placeholder:text-[var(--note-user-ink)]/40 focus:outline-none",
                compact ? "text-sm" : "text-base md:text-lg",
              )}
            />

            {/* Paperclip send button */}
            <motion.button
              whileHover={{ scale: 1.15, rotate: 10 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className={cn(
                "p-2 rounded-full transition-colors shrink-0",
                input.trim() && !isStreaming
                  ? "text-amber-700 dark:text-amber-300 hover:bg-amber-200/30"
                  : "text-gray-400 dark:text-gray-600",
              )}
              title="Pin this note"
              aria-label="Send message"
            >
              <Paperclip size={compact ? 18 : 22} />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
