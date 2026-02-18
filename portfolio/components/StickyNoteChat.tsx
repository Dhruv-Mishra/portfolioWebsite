"use client";

import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { m, AnimatePresence } from 'framer-motion';
import { Send, Eraser, Zap } from 'lucide-react';
import { useStickyChat, ChatMessage } from '@/hooks/useStickyChat';
import { cn } from '@/lib/utils';
import { CHAT_CONFIG } from '@/lib/chatContext';
import PillScrollbar from '@/components/PillScrollbar';
import { TAPE_STYLE } from '@/lib/constants';

// ─── Typewriter hook: reveals text gradually (only for new AI messages) ───
// Supports erase→type transitions for filler text swaps and filler→real response.
// Uses a cancelled ref + single interval to avoid leaked interval races.
// FIX: If new text arrives while erasing, we queue it and finish the erase first
// instead of cancelling mid-erase and restarting (which caused the "re-show" bug).
type TypewriterPhase = 'idle' | 'typing' | 'erasing';

function useTypewriter(
  text: string,
  isFiller: boolean,
  skip: boolean,
  speed = 18,
  onComplete?: () => void,
  onTypingTick?: () => void,
) {
  const [phase, setPhase] = useState<TypewriterPhase>('idle');
  const textNodeRef = useRef<HTMLSpanElement>(null);
  const prevTextRef = useRef(skip ? text : '');
  const cancelRef = useRef(0);
  const eraseSpeed = Math.max(speed * 0.6, 8);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onTypingTickRef = useRef(onTypingTick);
  onTypingTickRef.current = onTypingTick;
  // Queue: if text changes during erase, store the target here.
  // The erase-completion handler will pick it up instead of re-running the effect.
  const queuedTextRef = useRef<string | null>(null);
  const isFillerRef = useRef(isFiller);
  isFillerRef.current = isFiller;
  const phaseRef = useRef<TypewriterPhase>('idle');

  const isTyping = phase === 'typing' || phase === 'erasing';

  useEffect(() => {
    const setDOM = (s: string) => { if (textNodeRef.current) textNodeRef.current.textContent = s; };

    if (skip) {
      setDOM(text);
      setPhase('idle');
      phaseRef.current = 'idle';
      prevTextRef.current = text;
      queuedTextRef.current = null;
      return;
    }

    if (text === '' && !prevTextRef.current) {
      setPhase('idle');
      phaseRef.current = 'idle';
      return;
    }

    if (text === prevTextRef.current) return;

    // If currently erasing, queue the new text — the erase handler will pick it up
    if (phaseRef.current === 'erasing') {
      queuedTextRef.current = text;
      return;
    }

    const prevText = prevTextRef.current;
    const newText = text;

    const startTyping = (targetText: string) => {
      setPhase('typing');
      phaseRef.current = 'typing';
      let i = 0;
      // Scroll callback counter — fire every 3 chars to avoid excessive scrolling
      let tickCounter = 0;
      const id = setInterval(() => {
        // Check if newer text arrived while we're typing
        if (queuedTextRef.current !== null && queuedTextRef.current !== targetText) {
          clearInterval(id);
          const queued = queuedTextRef.current;
          queuedTextRef.current = null;
          // Erase current typed text, then type the queued text
          const currentlyShown = targetText.slice(0, i);
          startErase(currentlyShown, queued);
          return;
        }
        i++;
        tickCounter++;
        if (i >= targetText.length) {
          setDOM(targetText);
          prevTextRef.current = targetText;
          setPhase('idle');
          phaseRef.current = 'idle';
          clearInterval(id);
          onTypingTickRef.current?.();
          if (!isFillerRef.current) onCompleteRef.current?.();
        } else {
          setDOM(targetText.slice(0, i));
          if (tickCounter % 3 === 0) onTypingTickRef.current?.();
        }
      }, speed);
    };

    const startErase = (textToErase: string, nextText: string) => {
      setPhase('erasing');
      phaseRef.current = 'erasing';
      let eraseLen = textToErase.length;
      const eraseId = setInterval(() => {
        eraseLen--;
        if (eraseLen <= 0) {
          setDOM('');
          clearInterval(eraseId);
          prevTextRef.current = '';
          // Check if an even newer text arrived while erasing
          const finalTarget = queuedTextRef.current ?? nextText;
          queuedTextRef.current = null;
          startTyping(finalTarget);
        } else {
          setDOM(textToErase.slice(0, eraseLen));
        }
      }, eraseSpeed);
    };

    if (!prevText) {
      startTyping(newText);
      return;
    }

    startErase(prevText, newText);

    return () => {
      // On cleanup, cancel by incrementing token — but the queue-based approach
      // means in-flight erases won't re-trigger the full effect
      cancelRef.current++;
    };
  }, [text, skip, speed, eraseSpeed]);

  return { textNodeRef, isTyping, isFiller: phase === 'erasing' || isFiller };
}

// ─── Typing Ellipsis — bouncing dots with staggered scale wave ───
const TypingEllipsis = () => (
  <span className="inline-flex items-end gap-[3px] ml-1 h-4 align-baseline">
    {[0, 1, 2].map(i => (
      <m.span
        key={i}
        className="inline-block w-[5px] h-[5px] rounded-full bg-current"
        animate={{
          y: [0, -7, 0, 0],
          scale: [1, 1.35, 1, 1],
          opacity: [0.35, 1, 0.35, 0.35],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: i * 0.16,
        }}
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

// Hoisted animation constants — avoids allocation per StickyNote render
const NOTE_SPRING = { type: 'spring' as const, stiffness: 300, damping: 20, duration: 0.4 };

// ─── Suggested Question Strip ───
// Static rotation styles hoisted to module scope to avoid re-creating objects per render
const SUGGESTION_STYLE_ACTION = { transform: 'rotate(-0.5deg)' } as const;
const SUGGESTION_STYLE_NORMAL = { transform: 'rotate(0.3deg)' } as const;

const SuggestionStrip = ({ text, isAction, onClick, index = 0, skipEntrance }: { text: string; isAction?: boolean; onClick: () => void; index?: number; skipEntrance?: boolean }) => (
  <m.button
    initial={skipEntrance ? false : { opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.9 }}
    transition={skipEntrance ? { duration: 0 } : { delay: index * 0.07, duration: 0.2 }}
    whileHover={{ scale: 1.05, rotate: -1 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    title={isAction ? 'This will perform an action' : undefined}
    className={cn(
      "px-4 py-2 bg-[var(--c-paper)] border-2 rounded shadow-sm font-hand text-sm md:text-base text-[var(--c-ink)] opacity-80 hover:opacity-100 transition-opacity",
      isAction ? "border-amber-500/80 dark:border-amber-500/60" : "border-[var(--c-grid)]",
    )}
    style={isAction ? SUGGESTION_STYLE_ACTION : SUGGESTION_STYLE_NORMAL}
  >
    {isAction && (
      <span className="inline-flex items-center gap-0.5 mr-1.5 text-amber-600 dark:text-amber-400">
        <Zap size={11} className="-mt-0.5" />
        <span className="text-[10px] font-bold uppercase tracking-wide">action</span>
        <span className="text-amber-400/60 dark:text-amber-500/40">|</span>
      </span>
    )}
    {text}
  </m.button>
);

// ─── Single Sticky Note ───
const StickyNote = memo(function StickyNote({
  message,
  isLoading = false,
  onTypewriterDone,
  onTypingTick,
}: {
  message: ChatMessage;
  isLoading?: boolean;
  onTypewriterDone?: () => void;
  onTypingTick?: () => void;
}) {
  const isUser = message.role === 'user';
  const hasAction = !!(message.navigateTo || message.themeAction || (message.openUrls && message.openUrls.length > 0) || message.feedbackAction);
  const rotation = useRef(
    isUser
      ? (Math.random() * 1 + 0.5) // +0.5° to +1.5°
      : -(Math.random() * 1 + 0.5) // -0.5° to -1.5°
  ).current;

  // Typewriter effect for AI notes (skip for user msgs and old/restored messages)
  const { textNodeRef, isFiller: isDisplayingFiller } = useTypewriter(
    message.content,
    !!message.isFiller,
    isUser || !!message.isOld,
    18,
    onTypewriterDone,
    onTypingTick,
  );
  const showPencil = !isUser && isLoading;

  return (
    <m.div
      initial={isUser
        ? { opacity: 0, y: 30, rotate: rotation + 5 }
        : { opacity: 0, x: 50, rotate: rotation - 5 }
      }
      animate={{ opacity: message.isOld ? 0.7 : 1, y: 0, x: 0, rotate: rotation }}
      transition={NOTE_SPRING}
      className={cn(
        "relative max-w-[85%] md:max-w-[70%] mx-auto p-4 md:p-5 pb-6 md:pb-8 shadow-md font-hand text-base md:text-lg",
        isUser
          ? "bg-[var(--note-user)] text-[var(--note-user-ink)]"
          : "bg-[var(--note-ai)] text-[var(--note-ai-ink)]",
        message.isOld && "sepia-[.15] dark:sepia-0",
      )}
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
        )}
        // Prevent note from collapsing to 0 height during erase→type transition
        style={{ minHeight: '1.5em' }}
        >
          {isUser ? (
            message.content
          ) : (
            <span ref={textNodeRef}>{message.isOld ? message.content : ''}</span>
          )}
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
  "What do you work on at Microsoft?",
  "What's your tech stack?",
  "Toggle the theme",
  "Report a bug",
];

// Follow-up suggestions — split into pools so we can guarantee
// at least one conversational suggestion per batch.
const FOLLOWUP_CONVERSATIONAL = [
  "What projects have you worked on?",
  "Tell me about your time at IIIT Delhi",
  "What's your favorite language?",
  "How did you get into competitive programming?",
  "What do you enjoy most about your work?",
  "Tell me about your research",
  "What are your hobbies?",
  "Tell me about your PC build",
  "What games do you play?",
];

// Theme-dependent actions are resolved at render time via getFollowupActions()
const FOLLOWUP_ACTIONS_BASE = [
  "Open your GitHub profile",
  "Show me your resume PDF",
  "Take me to the projects page",
  "Open the Fluent UI repo",
  "Open your LinkedIn",
  "Show your Codeforces profile",
  "Report a bug",
];
const FOLLOWUP_ACTIONS_DARK_ONLY = ["Switch to light mode"];
const FOLLOWUP_ACTIONS_LIGHT_ONLY = ["Switch to dark mode", "Toggle the theme"];

// Keyword patterns → HARDCODED_ACTIONS key. Used to fuzzy-match LLM suggestions
// to known executable actions. Only matches when an action verb is present to
// avoid false positives on conversational questions.
const ACTION_MATCHERS: [RegExp, string][] = [
  [/\b(switch|change|enable)\b.*\bdark\s*mode\b/i, "Switch to dark mode"],
  [/\btoggle\b.*\btheme\b/i, "Toggle the theme"],
  [/\b(switch|change|enable)\b.*\blight\s*mode\b/i, "Switch to light mode"],
  [/\b(go|take|navigate|visit)\b.*\bprojects?\s*page\b/i, "Take me to the projects page"],
  [/\b(open|show|view|see)\b.*\bgithub\b/i, "Open your GitHub profile"],
  [/\b(open|show|view|see)\b.*\bresume\b/i, "Show me your resume PDF"],
  [/\b(open|show|view|see)\b.*\bfluent\s*ui\b.*\brepo\b/i, "Open the Fluent UI repo"],
  [/\b(open|show|view|see)\b.*\blinkedin\b/i, "Open your LinkedIn"],
  [/\b(open|show|view|see)\b.*\bcodeforces\b/i, "Show your Codeforces profile"],
  [/\breport\b.*\bbug\b|\bfeedback\s*form\b|\bsubmit\b.*\bfeedback\b/i, "Report a bug"],
];

// Try to match suggestion text to a known executable action.
// Returns the HARDCODED_ACTIONS key if matched, null otherwise.
function resolveAction(text: string): string | null {
  // Exact match (case-insensitive) against HARDCODED_ACTIONS keys
  const exactKey = Object.keys(HARDCODED_ACTIONS).find(
    k => k.toLowerCase() === text.toLowerCase(),
  );
  if (exactKey) return exactKey;
  // Keyword-based fuzzy match
  for (const [pattern, key] of ACTION_MATCHERS) {
    if (pattern.test(text)) return key;
  }
  return null;
}

// Pre-built responses for hardcoded action suggestions — avoids an LLM call.
// Each entry maps suggestion text → { content, ...action metadata }.
// `content` is the assistant's reply; action fields trigger the UI side-effect.
// The `themeAction` value 'toggle' is resolved at runtime by the action handler.
const HARDCODED_ACTIONS: Record<string, Omit<import('@/hooks/useStickyChat').ChatMessage, 'id' | 'role' | 'timestamp'>> = {
  "Switch to dark mode": { content: "Switching to dark mode for you ~", themeAction: 'dark' },
  "Switch to light mode": { content: "Switching to light mode for you ~", themeAction: 'light' },
  "Toggle the theme": { content: "Toggling the theme ~", themeAction: 'toggle' },
  "Take me to the projects page": { content: "Here are my projects!", navigateTo: '/projects' },
  "Open your GitHub profile": { content: "Opening GitHub for you ~", openUrls: ['https://github.com/Dhruv-Mishra'] },
  "Show me your resume PDF": { content: "Here's my resume!", openUrls: ['/resources/resume.pdf'] },
  "Open the Fluent UI repo": { content: "Opening the Fluent UI Android repo ~", openUrls: ['https://github.com/microsoft/fluentui-android'] },
  "Open your LinkedIn": { content: "Opening LinkedIn for you ~", openUrls: ['https://www.linkedin.com/in/dhruv-mishra-id/'] },
  "Show your Codeforces profile": { content: "Opening Codeforces for you ~", openUrls: ['https://codeforces.com/profile/DhruvMishra'] },
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

  // Compute theme-aware action pool (avoids showing "Switch to dark" when already dark)
  // Memoized — only recomputes when theme actually changes
  const followupActions = useMemo(() => [
    ...FOLLOWUP_ACTIONS_BASE,
    ...(resolvedTheme === 'dark' ? FOLLOWUP_ACTIONS_DARK_ONLY : FOLLOWUP_ACTIONS_LIGHT_ONLY),
  ], [resolvedTheme]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handledActionsRef = useRef<Set<string>>(new Set());
  const hasFetchedSuggestionsRef = useRef<string | null>(null);
  const hasHadInteractionRef = useRef(false);
  const hasInitializedSuggestionsRef = useRef(false);

  // Handle LLM-triggered actions (navigation, theme switch, open URL)
  // Actions are executed when the typewriter finishes typing the response,
  // so the user reads the full note before any side-effect fires.
  // We store a ref of pending actions — the typewriter callback drains it.
  const pendingActionRef = useRef<ChatMessage | null>(null);
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.isOld || isLoading || lastMsg.role !== 'assistant') return;
    if (handledActionsRef.current.has(lastMsg.id)) return;

    const hasAction = lastMsg.navigateTo || lastMsg.themeAction || (lastMsg.openUrls && lastMsg.openUrls.length > 0) || lastMsg.feedbackAction;
    if (!hasAction) return;

    handledActionsRef.current.add(lastMsg.id);
    pendingActionRef.current = lastMsg;
  }, [messages, isLoading]);

  // One-time suggestion initialization after hydration — prevents flash on page return
  useEffect(() => {
    if (hasInitializedSuggestionsRef.current || messages.length === 0) return;
    hasInitializedSuggestionsRef.current = true;

    const lastAssistant = messages.findLast(m => m.role === 'assistant' && m.id !== 'welcome');
    if (lastAssistant?.isOld) {
      // Returning to chat with history — use cached LLM suggestions if available
      hasFetchedSuggestionsRef.current = lastAssistant.id;
      const base = [
        ...pickRandom(FOLLOWUP_CONVERSATIONAL, 1),
        ...pickRandom(followupActions, 1),
      ];
      setBaseSuggestions(base);
      if (llmSuggestions.length > 0) {
        setExtraSuggestions(llmSuggestions.slice(0, 2));
      } else {
        setExtraSuggestions([
          ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => !base.includes(s)), 1),
          ...pickRandom(followupActions.filter(s => !base.includes(s)), 1),
        ]);
      }
    } else {
      // Fresh visit — show initial suggestions
      setBaseSuggestions(INITIAL_SUGGESTIONS.slice(0, 2));
      setExtraSuggestions(INITIAL_SUGGESTIONS.slice(2));
    }
    setSuggestionsReady(true);
  }, [messages, llmSuggestions, followupActions]);

  // After each NEW assistant response: pick 2 hardcoded + fetch 2 contextual
  useEffect(() => {
    const lastAssistant = messages.findLast(m => m.role === 'assistant' && m.id !== 'welcome');
    if (!lastAssistant || isLoading || lastAssistant.isOld) return;
    if (hasFetchedSuggestionsRef.current === lastAssistant.id) return;
    hasFetchedSuggestionsRef.current = lastAssistant.id;

    // Exclude the suggestion the user just clicked (= their last message text)
    const lastUserMsg = messages.findLast(m => m.role === 'user');
    const lastUserText = lastUserMsg?.content?.toLowerCase() || '';

    // 2 hardcoded suggestions: 1 conversational + 1 action (shown once typewriter finishes)
    const hardcoded = [
      ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => s.toLowerCase() !== lastUserText), 1),
      ...pickRandom(followupActions.filter(s => s.toLowerCase() !== lastUserText), 1),
    ];
    setBaseSuggestions(hardcoded);
    setExtraSuggestions([]); // Clear contextual — will be filled by LLM or fallback
    // Fire background LLM request for 2 contextual suggestions
    fetchSuggestions();
  }, [messages, isLoading, fetchSuggestions, followupActions]);

  // When LLM contextual suggestions arrive (or fail), fill the extra slots
  useEffect(() => {
    if (isSuggestionsLoading || !hasFetchedSuggestionsRef.current) return;
    if (llmSuggestions.length > 0) {
      setExtraSuggestions(llmSuggestions.slice(0, 2));
    } else {
      // LLM failed — fill with 1 conversational + 1 action (different from base)
      setExtraSuggestions([
        ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => !baseSuggestions.includes(s)), 1),
        ...pickRandom(followupActions.filter(s => !baseSuggestions.includes(s)), 1),
      ]);
    }
  }, [isSuggestionsLoading, llmSuggestions, baseSuggestions, followupActions]);

  // Gate suggestion visibility: hide during loading, show when typewriter signals completion.
  // Also executes any pending actions (navigation, theme, URLs) once the note is fully typed.
  const onLastTypewriterDone = useCallback(() => {
    setSuggestionsReady(true);

    // Drain pending action
    const action = pendingActionRef.current;
    if (!action) return;
    pendingActionRef.current = null;

    // Theme switching
    if (action.themeAction) {
      if (action.themeAction === 'toggle') {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
      } else {
        setTheme(action.themeAction);
      }
    }

    // Open feedback modal
    if (action.feedbackAction) {
      window.dispatchEvent(new CustomEvent('open-feedback'));
    }

    // Open URLs in new tabs — handle popup blockers
    if (action.openUrls && action.openUrls.length > 0) {
      let anyBlocked = false;
      for (const url of action.openUrls) {
        const popup = window.open(url, '_blank', 'noopener,noreferrer');
        if (!popup) anyBlocked = true;
      }
      if (anyBlocked) {
        markOpenUrlsFailed(action.id);
      }
    }

    // Page navigation — slight delay so the user can read the confirmation
    if (action.navigateTo) {
      const dest = action.navigateTo;
      setTimeout(() => router.push(dest), 600);
    }
  }, [router, setTheme, resolvedTheme, markOpenUrlsFailed]);
  useEffect(() => {
    if (isLoading) {
      setSuggestionsReady(false);
    }
  }, [isLoading]);

  // Auto-scroll to newest note (on message count change, streaming end, or suggestions appearing)
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const countChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if ((countChanged || !isLoading) && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isLoading]);

  // Scroll down when suggestions first appear (e.g. on page load) so they're not hidden behind input
  useEffect(() => {
    if (suggestionsReady && !isLoading && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [suggestionsReady, isLoading]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    hasHadInteractionRef.current = true;
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
    hasHadInteractionRef.current = true;
    // Resolve to a known action (exact or fuzzy match) — bypasses LLM, executes directly
    const actionKey = resolveAction(text);
    if (actionKey) {
      addLocalExchange(text, HARDCODED_ACTIONS[actionKey]);
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
        <div className="text-center pt-12 pb-2 md:pt-10 md:pb-6 shrink-0">
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
            Ask me anything ~
          </m.p>
        </div>
      ) : (
        <div className="shrink-0 pt-2 px-3">
          <WavyUnderline className="!mt-0 opacity-40" />
        </div>
      )}

      {/* ─── Messages + Input (overlaid) ─── */}
      <div className="relative flex-1 min-h-0">
      {/* ─── Custom pill scrollbar ─── */}
      <PillScrollbar scrollRef={messagesScrollRef} />
      {/* ─── Messages Area ─── */}
      <div
        ref={messagesScrollRef}
        className={cn(
        "absolute inset-0 overflow-y-auto overflow-x-hidden px-2 md:px-6 py-4 pb-36 md:pb-28 flex flex-col gap-6 md:gap-7 scrollbar-hidden",
        compact && "px-2 pt-4 pb-24 gap-4",
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
                onTypewriterDone={idx === messages.length - 1 && msg.role === 'assistant' ? onLastTypewriterDone : undefined}
                onTypingTick={idx === messages.length - 1 && msg.role === 'assistant' ? () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) : undefined}
              />
            </div>
          );
        })}

        {/* Suggested questions — shown after typewriter finishes.
            Base (hardcoded) suggestions render immediately when ready;
            Extra (LLM) suggestions animate in alongside without re-mounting base. */}
        <AnimatePresence>
          {!isLoading && suggestionsReady && (baseSuggestions.length > 0 || extraSuggestions.length > 0) && (
              <m.div
                key="suggestions-container"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex flex-wrap justify-center gap-2 md:gap-3 mt-2"
              >
                {baseSuggestions.map((q, i) => (
                  <SuggestionStrip
                    key={q}
                    text={q}
                    isAction={!!resolveAction(q)}
                    onClick={() => handleSuggestion(q)}
                    index={i}
                    skipEntrance={!hasHadInteractionRef.current}
                  />
                ))}
                <AnimatePresence>
                  {extraSuggestions.map((q, i) => (
                    <SuggestionStrip
                      key={q}
                      text={q}
                      isAction={!!resolveAction(q)}
                      onClick={() => handleSuggestion(q)}
                      index={i}
                      skipEntrance={!hasHadInteractionRef.current}
                    />
                  ))}
                </AnimatePresence>
              </m.div>
        )}
        </AnimatePresence>

        {/* Rate limit note */}
        {error && rateLimitRemaining && (
          <RateLimitNote seconds={rateLimitRemaining} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area (floating overlay with gradient fade) ─── */}
      <div className={cn(
        "absolute bottom-0 inset-x-0 pointer-events-none",
        "before:absolute before:inset-x-0 before:bottom-full before:h-16 before:bg-gradient-to-t before:from-[var(--c-bg)] before:to-transparent",
      )}>
      <div className={cn(
        "pointer-events-auto bg-[var(--c-bg)] px-2 md:px-6 pb-22 md:pb-4 pt-2",
        compact && "px-2 pb-2 pt-1",
      )}>
        {/* Clear desk button */}
        {hasMessages && (
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                clearMessages();
                setBaseSuggestions(INITIAL_SUGGESTIONS.slice(0, 2));
                setExtraSuggestions(INITIAL_SUGGESTIONS.slice(2));
                setSuggestionsReady(true);
                hasFetchedSuggestionsRef.current = null;
                hasInitializedSuggestionsRef.current = false;
                pendingActionRef.current = null;
                handledActionsRef.current.clear();
              }}
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
          animate={{ opacity: 0.92, y: 0 }}
          className={cn(
            "relative bg-[var(--note-user)] rounded shadow-md border border-[var(--c-grid)]/20",
            compact ? "p-2" : "p-2 md:p-4",
          )}
          style={{
            transform: 'rotate(0.5deg)',
          }}
        >

          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates to textarea focus for mobile UX */}
          <div className="flex items-end gap-2" onClick={() => inputRef.current?.focus()}>
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
      </div>

    </div>
  );
}
