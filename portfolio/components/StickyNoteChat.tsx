"use client";

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Eraser } from 'lucide-react';
import { useStickyChat, ChatMessage } from '@/hooks/useStickyChat';
import { cn } from '@/lib/utils';
import { CHAT_CONFIG } from '@/lib/chatContext';

// ─── Typewriter hook: reveals text gradually (only for new messages) ───
function useTypewriter(text: string, isStreaming: boolean, skip: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState(skip ? text : '');
  const [isTyping, setIsTyping] = useState(false);
  const prevLenRef = useRef(skip ? text.length : 0);

  useEffect(() => {
    // Skip entirely for old/restored messages
    if (skip) {
      setDisplayed(text);
      setIsTyping(false);
      prevLenRef.current = text.length;
      return undefined;
    }

    // If streaming is actively pushing new chars, just show everything
    // (the LLM stream is already gradual)
    if (isStreaming) {
      setDisplayed(text);
      prevLenRef.current = text.length;
      setIsTyping(true);
      return undefined;
    }

    // Stream just finished — typewrite any remaining text
    if (text.length > 0 && prevLenRef.current === 0 && displayed.length < text.length) {
      setIsTyping(true);
      let i = displayed.length;
      const interval = setInterval(() => {
        i++;
        if (i >= text.length) {
          setDisplayed(text);
          setIsTyping(false);
          prevLenRef.current = text.length;
          clearInterval(interval);
        } else {
          setDisplayed(text.slice(0, i));
        }
      }, speed);
      return () => clearInterval(interval);
    }

    // Normal case: show full text
    setDisplayed(text);
    setIsTyping(false);
    prevLenRef.current = text.length;
    return undefined;
  }, [text, isStreaming, skip, speed, displayed.length]);

  return { displayed, isTyping };
}

// ─── Typing Ellipsis (shown while AI is streaming) ───
const TypingEllipsis = () => (
  <span className="inline-flex items-center gap-0.5 ml-1 align-baseline">
    {[0, 1, 2].map(i => (
      <motion.span
        key={i}
        className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-60"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
      />
    ))}
  </span>
);

// ─── Tape Strip (realistic torn-edge, brownish tint visible on light blue) ───
const TapeStrip = ({ className }: { className?: string }) => (
  <div
    className={cn("absolute -top-3 left-1/2 -translate-x-1/2 w-24 md:w-32 h-7 md:h-9 shadow-sm z-20", className)}
    style={{
      backgroundColor: 'var(--tape-color, rgba(210, 180, 140, 0.55))',
      clipPath: 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)',
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
      ? (Math.random() * 1 + 0.5) // +0.5° to +1.5°
      : -(Math.random() * 1 + 0.5) // -0.5° to -1.5°
  ).current;

  // Typewriter effect for AI notes (skip for old/restored messages)
  const { displayed, isTyping } = useTypewriter(
    message.content,
    isUser ? false : isStreaming,
    isUser || !!message.isOld, // skip typewriter for user msgs and old msgs
  );
  const showContent = isUser ? message.content : displayed;
  const showPencil = !isUser && (isStreaming || isTyping);

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
        "relative max-w-[85%] md:max-w-[70%] mx-auto p-4 md:p-5 pb-6 md:pb-8 shadow-md font-hand text-base md:text-lg",
        isUser
          ? "bg-[var(--note-user)] text-[var(--note-user-ink)]"
          : "bg-[var(--note-ai)] text-[var(--note-ai-ink)]",
        message.isOld && "sepia-[.15] dark:sepia-0",
      )}
      style={{
        clipPath: isUser
          ? undefined // No clipPath — tape needs to overflow top edge
          : undefined,
      }}
    >
      {/* Tape on all notes */}
      <TapeStrip />

      {/* Mobile: colored left/right border */}
      <div className={cn(
        "absolute top-0 bottom-0 w-1 md:hidden",
        isUser ? "left-0 bg-yellow-500/50" : "right-0 bg-blue-400/50",
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

      {/* Message content — invisible full text for width sizing, visible typewritten text on top */}
      <div className="relative">
        {/* Invisible sizer: establishes the note's full width so it doesn't expand horizontally */}
        {!isUser && showContent !== message.content && (
          <div className="whitespace-pre-wrap break-words leading-relaxed invisible" aria-hidden="true">
            {message.content}
          </div>
        )}
        {/* Visible text (positioned over sizer when sizer is present) */}
        <div className={cn(
          "whitespace-pre-wrap break-words leading-relaxed",
          !isUser && showContent !== message.content && "absolute inset-0",
        )}>
          {showContent}
          {isStreaming && !message.content && (
            <span className="inline-block w-2 h-5 bg-current animate-pulse ml-0.5" />
          )}
        </div>
      </div>

      {/* Typing ellipsis while streaming or typewriting */}
      {showPencil && showContent && (
        <div className="absolute bottom-2 right-4" style={{ color: 'var(--note-ai-ink)' }}>
          <TypingEllipsis />
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

// WelcomeNote removed — welcome message is now a permanent first assistant message in the chat

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
// Initial suggestions shown before any conversation
const INITIAL_SUGGESTIONS = [
  "What's your tech stack?",
  "Tell me about Fluent UI",
  "How did you optimize cold starts?",
  "What's your CP rating?",
];

// Follow-up suggestions shown after each LLM response (rotated randomly)
const FOLLOWUP_SUGGESTIONS = [
  // Conversational
  "What projects have you worked on?",
  "Tell me about your time at IIIT Delhi",
  "What's your favorite language?",
  // Action hints — teach users they can trigger actions
  "Switch to dark mode 🌙",
  "Open your GitHub profile",
  "Show me your resume PDF",
  "Take me to the projects page",
  "Open the Fluent UI repo",
  "Toggle the theme 🎨",
  "Open your LinkedIn",
];

// Pick N random items from an array without duplicates
function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ═════════════════════════════════════════════════
// ─── Main StickyNoteChat Component ───
// ═════════════════════════════════════════════════
export default function StickyNoteChat({ compact = false }: { compact?: boolean }) {
  const { messages, isStreaming, error, sendMessage, clearMessages, rateLimitRemaining } = useStickyChat();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [input, setInput] = useState('');
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handledActionsRef = useRef<Set<string>>(new Set());
  const lastSuggestionMsgRef = useRef<string | null>(null);

  // Handle LLM-triggered actions (navigation, theme switch, open URL)
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.isOld || isStreaming || lastMsg.role !== 'assistant') return;
    if (handledActionsRef.current.has(lastMsg.id)) return;

    const hasAction = lastMsg.navigateTo || lastMsg.themeAction || lastMsg.openUrl;
    if (!hasAction) return;

    handledActionsRef.current.add(lastMsg.id);

    // Delay so user can read the note first
    const timer = setTimeout(() => {
      // Theme switching
      if (lastMsg.themeAction) {
        if (lastMsg.themeAction === 'toggle') {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
        } else {
          setTheme(lastMsg.themeAction);
        }
      }

      // Open URL in new tab
      if (lastMsg.openUrl) {
        window.open(lastMsg.openUrl, '_blank', 'noopener,noreferrer');
      }

      // Page navigation
      if (lastMsg.navigateTo) {
        router.push(lastMsg.navigateTo);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [messages, isStreaming, router, setTheme, resolvedTheme]);

  // Rotate suggestions after each new assistant response
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.id !== 'welcome');
    if (!lastAssistant || isStreaming) return;
    // Only update suggestions once per new assistant message
    if (lastSuggestionMsgRef.current === lastAssistant.id) return;
    lastSuggestionMsgRef.current = lastAssistant.id;
    setActiveSuggestions(pickRandom(FOLLOWUP_SUGGESTIONS, 3));
  }, [messages, isStreaming]);

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
    sendMessage(text);
  }, [sendMessage]);

  const hasMessages = messages.length > 1; // >1 because welcome message is always present
  const hasOldMessages = messages.some(m => m.isOld && m.id !== 'welcome');

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
        "flex-1 overflow-y-auto overflow-x-hidden px-2 md:px-6 py-4 flex flex-col gap-6 md:gap-7 ruler-scrollbar",
        compact && "px-2 py-2 gap-4",
      )}>
        {/* Messages (welcome note is always first) */}
        {messages.map((msg, idx) => {
          // Show "old notes" divider before the first non-welcome old message
          const showDivider = hasOldMessages && msg.isOld && msg.id !== 'welcome' &&
            !messages.slice(0, idx).some(m => m.isOld && m.id !== 'welcome');

          return (
            <div key={msg.id}>
              {showDivider && (
                <div className="flex items-center gap-3 opacity-40 my-2 mb-4">
                  <div className="flex-1 h-px bg-[var(--c-grid)]" />
                  <span className="font-hand text-xs text-[var(--c-ink)]">old notes</span>
                  <div className="flex-1 h-px bg-[var(--c-grid)]" />
                </div>
              )}
              <StickyNote
                message={msg}
                isStreaming={isStreaming && msg.role === 'assistant' && idx === messages.length - 1}
              />
            </div>
          );
        })}

        {/* Suggested questions — shown initially and after each LLM response */}
        <AnimatePresence mode="wait">
          {!isStreaming && activeSuggestions.length > 0 && (
            <motion.div
              key={activeSuggestions.join()}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="flex flex-wrap justify-center gap-2 md:gap-3 mt-2"
            >
              {activeSuggestions.map(q => (
                <SuggestionStrip key={q} text={q} onClick={() => handleSuggestion(q)} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rate limit note */}
        {error && rateLimitRemaining && (
          <RateLimitNote seconds={rateLimitRemaining} />
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
              onClick={() => { clearMessages(); setActiveSuggestions(INITIAL_SUGGESTIONS); lastSuggestionMsgRef.current = null; }}
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
            <TapeStrip className="!w-20 !md:w-24 !h-5 !md:h-7" />
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, CHAT_CONFIG.maxUserMessageLength))}
              onKeyDown={handleKeyDown}
              placeholder="Write a note..."
              rows={1}
              disabled={isStreaming}
              className={cn(
                "flex-1 bg-transparent resize-none font-hand text-[var(--note-user-ink)] placeholder:text-[var(--note-user-ink)]/40 focus:outline-none",
                compact ? "text-sm leading-snug" : "text-base md:text-lg",
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
              title="Send note"
              aria-label="Send message"
            >
              <Send size={compact ? 18 : 22} />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
