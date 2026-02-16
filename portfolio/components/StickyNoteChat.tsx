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

// ─── Typewriter hook: reveals text gradually (only for new AI messages) ───
// Supports erase→type transitions for filler text swaps and filler→real response.
// Uses a cancelled ref + single interval to avoid leaked interval races.
type TypewriterPhase = 'idle' | 'typing' | 'erasing';

function useTypewriter(text: string, isFiller: boolean, skip: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState(skip ? text : '');
  const [phase, setPhase] = useState<TypewriterPhase>('idle');
  const prevTextRef = useRef(skip ? text : '');
  const cancelRef = useRef(0); // Incrementing token — any interval checks this to self-cancel
  const eraseSpeed = Math.max(speed * 0.6, 8);

  const isTyping = phase === 'typing' || phase === 'erasing';

  useEffect(() => {
    // Bump cancel token to kill any running intervals from previous effect
    const token = ++cancelRef.current;
    const cancelled = () => cancelRef.current !== token;

    if (skip) {
      setDisplayed(text);
      setPhase('idle');
      prevTextRef.current = text;
      return;
    }

    // Empty text and nothing previously shown — noop
    if (text === '' && !prevTextRef.current) {
      setPhase('idle');
      return;
    }

    // Same text — no work
    if (text === prevTextRef.current) return;

    const prevText = prevTextRef.current;
    const newText = text;
    prevTextRef.current = newText;

    // Helper: type newText from char 0
    const startTyping = () => {
      setPhase('typing');
      let i = 0;
      const id = setInterval(() => {
        if (cancelled()) { clearInterval(id); return; }
        i++;
        if (i >= newText.length) {
          setDisplayed(newText);
          setPhase('idle');
          clearInterval(id);
        } else {
          setDisplayed(newText.slice(0, i));
        }
      }, speed);
    };

    // No previous text — just type forward
    if (!prevText) {
      startTyping();
      return;
    }

    // Erase old text, then type new text
    setPhase('erasing');
    let eraseLen = prevText.length;
    const eraseId = setInterval(() => {
      if (cancelled()) { clearInterval(eraseId); return; }
      eraseLen--;
      if (eraseLen <= 0) {
        setDisplayed('');
        clearInterval(eraseId);
        if (!cancelled()) startTyping();
      } else {
        setDisplayed(prevText.slice(0, eraseLen));
      }
    }, eraseSpeed);

    // Cleanup: bump token so all intervals self-cancel on next tick
    return () => { cancelRef.current++; };
  }, [text, skip, speed, eraseSpeed]);

  return { displayed, isTyping, isFiller: isFiller && (phase !== 'idle' || displayed === text) };
}

// ─── Typing Ellipsis — bouncing dots with scale wave, pure CSS ───
const TypingEllipsis = () => (
  <span className="inline-flex items-end gap-[3px] ml-1 h-4 align-baseline">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="inline-block w-[5px] h-[5px] rounded-full bg-current opacity-70 animate-bounce-dot"
        style={{ animationDelay: `${i * 160}ms` }}
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
  isLoading = false,
}: {
  message: ChatMessage;
  isLoading?: boolean;
}) {
  const isUser = message.role === 'user';
  const hasAction = !!(message.navigateTo || message.themeAction || (message.openUrls && message.openUrls.length > 0) || message.feedbackAction);
  const rotation = useRef(
    isUser
      ? (Math.random() * 1 + 0.5) // +0.5° to +1.5°
      : -(Math.random() * 1 + 0.5) // -0.5° to -1.5°
  ).current;

  // Typewriter effect for AI notes (skip for user msgs and old/restored messages)
  const { displayed, isTyping, isFiller: isDisplayingFiller } = useTypewriter(
    message.content,
    !!message.isFiller,
    isUser || !!message.isOld,
  );
  const showContent = isUser ? message.content : displayed;
  const showPencil = !isUser && (isLoading || isTyping);

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

      {/* Message content — rendered inline so the note grows naturally with typewritten text */}
      <div className="relative">
        <div className={cn(
          "whitespace-pre-wrap break-words leading-relaxed",
          // Filler text: same color, just faded + italic to distinguish from final response
          !isUser && isDisplayingFiller && "italic opacity-50",
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
  const { messages, isLoading, error, sendMessage, addLocalExchange, clearMessages, markOpenUrlsFailed, rateLimitRemaining, fetchSuggestions, suggestions: llmSuggestions, isSuggestionsLoading } = useStickyChat();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [input, setInput] = useState('');
  // Suggestions: 2 hardcoded (immediate) + 2 contextual (LLM or fallback)
  // Start empty to prevent flash on page return — hydration effect fills them
  const [baseSuggestions, setBaseSuggestions] = useState<string[]>([]);
  const [extraSuggestions, setExtraSuggestions] = useState<string[]>([]);
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handledActionsRef = useRef<Set<string>>(new Set());
  const hasFetchedSuggestionsRef = useRef<string | null>(null);
  const hasInitializedSuggestionsRef = useRef(false);
  const lastTypewriterIdRef = useRef<string | null>(null);

  // Handle LLM-triggered actions (navigation, theme switch, open URL)
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.isOld || isLoading || lastMsg.role !== 'assistant') return;
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
  }, [messages, isLoading, router, setTheme, resolvedTheme, markOpenUrlsFailed]);

  // One-time suggestion initialization after hydration — prevents flash on page return
  useEffect(() => {
    if (hasInitializedSuggestionsRef.current || messages.length === 0) return;
    hasInitializedSuggestionsRef.current = true;

    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.id !== 'welcome');
    if (lastAssistant?.isOld) {
      // Returning to chat with history — use cached LLM suggestions if available
      hasFetchedSuggestionsRef.current = lastAssistant.id;
      const base = pickRandom(FOLLOWUP_SUGGESTIONS, 2);
      setBaseSuggestions(base);
      if (llmSuggestions.length > 0) {
        setExtraSuggestions(llmSuggestions.slice(0, 2));
      } else {
        setExtraSuggestions(pickRandom(FOLLOWUP_SUGGESTIONS.filter(s => !base.includes(s)), 2));
      }
    } else {
      // Fresh visit — show initial suggestions
      setBaseSuggestions(INITIAL_SUGGESTIONS.slice(0, 2));
      setExtraSuggestions(INITIAL_SUGGESTIONS.slice(2));
    }
    setSuggestionsReady(true);
  }, [messages, llmSuggestions]);

  // After each NEW assistant response: pick 2 hardcoded + fetch 2 contextual
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.id !== 'welcome');
    if (!lastAssistant || isLoading || lastAssistant.isOld) return;
    if (hasFetchedSuggestionsRef.current === lastAssistant.id) return;
    hasFetchedSuggestionsRef.current = lastAssistant.id;
    // 2 hardcoded suggestions (shown once typewriter finishes)
    const hardcoded = pickRandom(FOLLOWUP_SUGGESTIONS, 2);
    setBaseSuggestions(hardcoded);
    setExtraSuggestions([]); // Clear contextual — will be filled by LLM or fallback
    // Fire background LLM request for 2 contextual suggestions
    fetchSuggestions();
  }, [messages, isLoading, fetchSuggestions]);

  // When LLM contextual suggestions arrive (or fail), fill the extra slots
  useEffect(() => {
    if (isSuggestionsLoading || !hasFetchedSuggestionsRef.current) return;
    if (llmSuggestions.length > 0) {
      setExtraSuggestions(llmSuggestions.slice(0, 2));
    } else {
      // LLM failed — fill with 2 more hardcoded (different from base)
      setExtraSuggestions(
        pickRandom(FOLLOWUP_SUGGESTIONS.filter(s => !baseSuggestions.includes(s)), 2)
      );
    }
  }, [isSuggestionsLoading, llmSuggestions, baseSuggestions]);

  // Gate suggestion visibility: hide during loading + typewriting, show after typewriter finishes
  useEffect(() => {
    if (isLoading) {
      setSuggestionsReady(false);
      return undefined;
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && !lastMsg.isOld && lastMsg.id !== 'welcome' && lastMsg.content) {
      if (lastTypewriterIdRef.current !== lastMsg.id) {
        lastTypewriterIdRef.current = lastMsg.id;
        setSuggestionsReady(false);
        // Estimate typewriter duration: erase old (if filler was showing) + type new chars * 18ms + buffer
        // Filler erase: ~50 chars * 11ms ≈ 550ms; be generous with 800ms extra for erase phase
        const eraseEstimate = 800;
        const typeEstimate = lastMsg.content.length * 18;
        const delay = Math.min(eraseEstimate + typeEstimate + 500, 10000);
        const timer = setTimeout(() => setSuggestionsReady(true), delay);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [isLoading, messages]);

  // Auto-scroll to newest note (only when messages change count or streaming ends)
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const countChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if ((countChanged || !isLoading) && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isLoading]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
    // Re-focus input
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [input, isLoading, sendMessage]);

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
                isLoading={isLoading && msg.role === 'assistant' && idx === messages.length - 1}
              />
            </div>
          );
        })}

        {/* Suggested questions — shown after typewriter finishes */}
        <AnimatePresence mode="wait">
          {!isLoading && suggestionsReady && (baseSuggestions.length > 0 || extraSuggestions.length > 0) && (
            <m.div
              key={[...baseSuggestions, ...extraSuggestions].join('|')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex flex-wrap justify-center gap-2 md:gap-3 mt-2"
            >
              {[...baseSuggestions, ...extraSuggestions].map(q => (
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
              onClick={() => { clearMessages(); setBaseSuggestions(INITIAL_SUGGESTIONS.slice(0, 2)); setExtraSuggestions(INITIAL_SUGGESTIONS.slice(2)); setSuggestionsReady(true); hasFetchedSuggestionsRef.current = null; lastTypewriterIdRef.current = null; }}
              className="flex items-center gap-1.5 text-xs font-hand font-bold text-[var(--c-ink)] opacity-50 hover:opacity-90 hover:text-red-600 dark:hover:text-red-400 transition-[color,opacity,background-color,border-color] duration-200 px-2 py-1 rounded border border-transparent hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/20"
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
              disabled={isLoading}
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
              disabled={!input.trim() || isLoading}
              className={cn(
                "p-2 rounded-full transition-colors shrink-0",
                input.trim() && !isLoading
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
