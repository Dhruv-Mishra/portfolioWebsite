"use client";

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { m, AnimatePresence } from 'framer-motion';
import { Send, Eraser, Zap } from 'lucide-react';
import { useStickyChat, ChatMessage } from '@/hooks/useStickyChat';
import { cn } from '@/lib/utils';
import { CHAT_CONFIG } from '@/lib/chatContext';
import { TAPE_STYLE } from '@/lib/constants';

// ─── Typewriter hook: reveals text gradually (only for new messages) ───
function useTypewriter(text: string, isStreaming: boolean, skip: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState(skip ? text : '');
  const [isTyping, setIsTyping] = useState(false);
  const prevLenRef = useRef(skip ? text.length : 0);
  const displayedLenRef = useRef(skip ? text.length : 0);

  // Keep ref in sync without triggering re-effects
  useEffect(() => {
    displayedLenRef.current = displayed.length;
  });

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
    const currentDisplayedLen = displayedLenRef.current;
    if (text.length > 0 && prevLenRef.current === 0 && currentDisplayedLen < text.length) {
      setIsTyping(true);
      let i = currentDisplayedLen;
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
  }, [text, isStreaming, skip, speed]);

  return { displayed, isTyping };
}

// ─── Typing Ellipsis (shown while AI is streaming) — CSS animation to avoid framer-motion overhead ───
const TypingEllipsis = () => (
  <span className="inline-flex items-center gap-0.5 ml-1 align-baseline">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-typing-dot"
        style={{ animationDelay: `${i * 150}ms` }}
      />
    ))}
  </span>
);

// ─── Tape Strip (realistic torn-edge, brownish tint visible on light blue) ───
const TapeStrip = ({ className }: { className?: string }) => (
  <div
    className={cn("absolute -top-2 left-1/2 -translate-x-1/2 w-16 md:w-24 h-5 md:h-6 shadow-sm z-20", className)}
    style={TAPE_STYLE}
  />
);

// ─── Wavy Underline SVG ───
const WavyUnderline = ({ className }: { className?: string }) => (
  <svg className={cn("w-full h-3 mt-1", className)} viewBox="0 0 300 12" fill="none" xmlns="http://www.w3.org/2000/svg">
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
const SuggestionStrip = ({ text, isAction, onClick }: { text: string; isAction?: boolean; onClick: () => void }) => (
  <m.button
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.9 }}
    whileHover={{ scale: 1.05, rotate: -1 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={cn(
      "px-4 py-2 bg-[var(--c-paper)] border-2 rounded shadow-sm font-hand text-sm md:text-base text-[var(--c-ink)] opacity-80 hover:opacity-100 transition-opacity",
      isAction ? "border-amber-500/80 dark:border-amber-500/60" : "border-[var(--c-grid)]",
    )}
    style={{
      transform: `rotate(${isAction ? '-0.5' : '0.3'}deg)`,
    }}
  >
    {isAction && <Zap size={12} className="inline mr-1 -mt-0.5 text-amber-500" />}
    {text}
  </m.button>
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
  const hasAction = !!(message.navigateTo || message.themeAction || (message.openUrls && message.openUrls.length > 0) || message.feedbackAction);
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
    <m.div
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

        </div>
      </div>

      {/* Typing ellipsis — shows from note spawn until generation/typewriting finishes */}
      {showPencil && (
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

      {/* Action performed badge */}
      {hasAction && !isUser && (
        <div className={cn(
          "absolute bottom-1.5 right-3 flex items-center gap-0.5 font-hand text-[10px] text-amber-950 dark:text-amber-400",
        )}>
          <Zap size={10} />
          <span>action</span>
        </div>
      )}

      {/* Fallback links when popup was blocked */}
      {message.openUrls && message.openUrlsFailed && (
        <div className="mt-2 flex flex-col gap-1">
          {message.openUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-hand text-xs text-blue-700 dark:text-blue-400 underline underline-offset-2 decoration-dotted hover:decoration-solid"
            >
              Open link{message.openUrls!.length > 1 ? ` ${i + 1}` : ''} here ~
            </a>
          ))}
        </div>
      )}
    </m.div>
  );
});

// WelcomeNote removed — welcome message is now a permanent first assistant message in the chat

// ─── Rate Limit Note ───
const RateLimitNote = ({ seconds }: { seconds: number }) => (
  <m.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1, rotate: 2 }}
    className="relative max-w-sm mx-auto p-4 bg-[#ffccbc] dark:bg-[#3e2723] text-orange-900 dark:text-orange-200 shadow-md font-hand text-sm md:text-base"
  >
    <TapeStrip />
    Whoa, slow down! Even sticky notes need a breather. Try again in {seconds} seconds.
  </m.div>
);

// ─── Suggested Questions ───
// Initial suggestions shown before any conversation
const INITIAL_SUGGESTIONS = [
  "What's your tech stack?",
  "Tell me about Fluent UI",
  "Toggle the theme",
  "Report a bug",
];

// Follow-up suggestions shown after each LLM response (rotated randomly)
const FOLLOWUP_SUGGESTIONS = [
  // Conversational
  "What projects have you worked on?",
  "Tell me about your time at IIIT Delhi",
  "What's your favorite language?",
  // Action hints — teach users they can trigger actions
  "Switch to dark mode",
  "Open your GitHub profile",
  "Show me your resume PDF",
  "Take me to the projects page",
  "Open the Fluent UI repo",
  "Toggle the theme",
  "Open your LinkedIn",
  "Report a bug",
];

// Suggestions that trigger actions (used to show the Zap indicator)
const ACTION_SUGGESTIONS = new Set([
  "Switch to dark mode",
  "Open your GitHub profile",
  "Show me your resume PDF",
  "Take me to the projects page",
  "Open the Fluent UI repo",
  "Toggle the theme",
  "Open your LinkedIn",
  "Report a bug",
]);

// Pre-built responses for hardcoded action suggestions — avoids an LLM call.
// Each entry maps suggestion text → { content, ...action metadata }.
// `content` is the assistant's reply; action fields trigger the UI side-effect.
// The `themeAction` value 'toggle' is resolved at runtime by the action handler.
const HARDCODED_ACTIONS: Record<string, Omit<import('@/hooks/useStickyChat').ChatMessage, 'id' | 'role' | 'timestamp'>> = {
  "Switch to dark mode": { content: "Switching to dark mode for you ~", themeAction: 'dark' },
  "Toggle the theme": { content: "Toggling the theme ~", themeAction: 'toggle' },
  "Take me to the projects page": { content: "Here are my projects!", navigateTo: '/projects' },
  "Open your GitHub profile": { content: "Opening GitHub for you ~", openUrls: ['https://github.com/Dhruv-Mishra'] },
  "Show me your resume PDF": { content: "Here's my resume!", openUrls: ['/resources/resume.pdf'] },
  "Open the Fluent UI repo": { content: "Opening the Fluent UI Android repo ~", openUrls: ['https://github.com/microsoft/fluentui-android'] },
  "Open your LinkedIn": { content: "Opening LinkedIn for you ~", openUrls: ['https://www.linkedin.com/in/dhruv-mishra-id/'] },
  "Report a bug": { content: "Opening the feedback form for you ~", feedbackAction: true },
};

// Pick N random items from an array without duplicates
function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ═════════════════════════════════════════════════
// ─── Main StickyNoteChat Component ───
// ═════════════════════════════════════════════════
export default function StickyNoteChat({ compact = false }: { compact?: boolean }) {
  const { messages, isStreaming, error, sendMessage, addLocalExchange, clearMessages, markOpenUrlsFailed, rateLimitRemaining } = useStickyChat();
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

    const hasAction = lastMsg.navigateTo || lastMsg.themeAction || (lastMsg.openUrls && lastMsg.openUrls.length > 0) || lastMsg.feedbackAction;
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

      // Open feedback modal (dispatch to global instance in SketchbookLayout)
      if (lastMsg.feedbackAction) {
        window.dispatchEvent(new CustomEvent('open-feedback'));
      }

      // Open URLs in new tabs — handle popup blockers
      if (lastMsg.openUrls && lastMsg.openUrls.length > 0) {
        let anyBlocked = false;
        for (const url of lastMsg.openUrls) {
          const popup = window.open(url, '_blank', 'noopener,noreferrer');
          if (!popup) anyBlocked = true;
        }
        if (anyBlocked) {
          markOpenUrlsFailed(lastMsg.id);
        }
      }

      // Page navigation
      if (lastMsg.navigateTo) {
        router.push(lastMsg.navigateTo);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [messages, isStreaming, router, setTheme, resolvedTheme, markOpenUrlsFailed]);

  // Rotate suggestions after each new assistant response
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.id !== 'welcome');
    if (!lastAssistant || isStreaming) return;
    // Only update suggestions once per new assistant message
    if (lastSuggestionMsgRef.current === lastAssistant.id) return;
    lastSuggestionMsgRef.current = lastAssistant.id;
    setActiveSuggestions(pickRandom(FOLLOWUP_SUGGESTIONS, 3));
  }, [messages, isStreaming]);

  // Auto-scroll to newest note (only when messages change count or streaming ends)
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const countChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if ((countChanged || !isStreaming) && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isStreaming]);

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
    const hardcoded = HARDCODED_ACTIONS[text];
    if (hardcoded) {
      // Bypass the LLM — use the pre-built response + action metadata
      addLocalExchange(text, hardcoded);
    } else {
      sendMessage(text);
    }
  }, [addLocalExchange, sendMessage]);

  const hasMessages = messages.length > 1; // >1 because welcome message is always present
  const hasOldMessages = messages.some(m => m.isOld && m.id !== 'welcome');

  return (
    <div className={cn(
      "flex flex-col h-full",
      compact ? "max-h-full" : ""
    )}>
      {/* ─── Header ─── */}
      {!compact ? (
        <div className="text-center pt-2 pb-2 md:pt-4 md:pb-6 shrink-0">
          <m.h1
            initial={{ opacity: 0, rotate: -3 }}
            animate={{ opacity: 1, rotate: -2 }}
            className="text-4xl md:text-5xl font-hand font-bold text-[var(--c-heading)] inline-block"
          >
            Pass me a note
          </m.h1>
          <WavyUnderline />
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="font-hand text-lg md:text-xl text-[var(--c-ink)] opacity-60 mt-2"
          >
            Ask me anything — powered by AI, answered as Dhruv.
          </m.p>
        </div>
      ) : (
        <div className="shrink-0 pt-2 px-3">
          <WavyUnderline className="!mt-0 opacity-40" />
        </div>
      )}

      {/* ─── Messages Area ─── */}
      <div className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden px-2 md:px-6 py-4 flex flex-col gap-6 md:gap-7 ruler-scrollbar",
        compact && "px-2 pt-4 pb-2 gap-4",
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
            <m.div
              key={activeSuggestions.join()}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="flex flex-wrap justify-center gap-2 md:gap-3 mt-2"
            >
              {activeSuggestions.map(q => (
                <SuggestionStrip key={q} text={q} isAction={ACTION_SUGGESTIONS.has(q)} onClick={() => handleSuggestion(q)} />
              ))}
            </m.div>
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
        "shrink-0 px-2 md:px-6 pb-14 md:pb-4 pt-2",
        compact && "px-2 pb-2 pt-1",
      )}>
        {/* Clear desk button */}
        {hasMessages && (
          <div className="flex justify-end mb-2">
            <button
              onClick={() => { clearMessages(); setActiveSuggestions(INITIAL_SUGGESTIONS); lastSuggestionMsgRef.current = null; }}
              className="flex items-center gap-1.5 text-xs font-hand font-bold text-[var(--c-ink)] opacity-50 hover:opacity-90 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 px-2 py-1 rounded border border-transparent hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/20"
              title="Clear desk"
            >
              <Eraser size={14} />
              Clear desk
            </button>
          </div>
        )}

        {/* The input "sticky note" */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "relative bg-[var(--note-user)] rounded shadow-md border border-[var(--c-grid)]/20",
            compact ? "p-2" : "p-2 md:p-4",
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
            <m.button
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
            </m.button>
          </div>
        </m.div>
      </div>

    </div>
  );
}
