// hooks/useStickyChat.ts — Chat logic with buffered LLM responses and localStorage persistence
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { CHAT_CONFIG, WELCOME_MESSAGE, FALLBACK_MESSAGES } from '@/lib/chatContext';
import { rateLimiter, RATE_LIMITS } from '@/lib/rateLimit';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isOld?: boolean; // Messages loaded from localStorage
  isFiller?: boolean; // True when showing thinking/filler text (not final response)
  navigateTo?: string; // Page path to navigate to (parsed from [[NAVIGATE:/path]])
  themeAction?: 'dark' | 'light' | 'toggle'; // Theme switch action
  openUrls?: string[]; // External URLs to open in new tabs (parsed from [[OPEN:key]])
  openUrlsFailed?: boolean; // True if any popup was blocked — show fallback links
  feedbackAction?: boolean; // True when [[FEEDBACK]] tag is parsed
}

interface UseStickyChat {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  addLocalExchange: (userText: string, response: Omit<ChatMessage, 'id' | 'role' | 'timestamp'>) => void;
  clearMessages: () => void;
  markOpenUrlsFailed: (messageId: string) => void;
  rateLimitRemaining: number | null;
  fetchSuggestions: () => void;
  suggestions: string[];
  isSuggestionsLoading: boolean;
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Parse and strip action tags from message content
const NAVIGATE_RE = /\[\[NAVIGATE:(\/[a-z-]*)\]\]/i;
const THEME_RE = /\[\[THEME:(dark|light|toggle)\]\]/i;
const OPEN_RE = /\[\[OPEN:([a-z0-9-]+)\]\]/gi;  // global: find ALL OPEN tags
const OPEN_SINGLE_RE = /\[\[OPEN:[a-z0-9-]+\]\]/gi; // for stripping
const FEEDBACK_RE = /\[\[FEEDBACK\]\]/i;

// Map OPEN: keys to actual URLs
const OPEN_LINKS: Record<string, string> = {
  github: 'https://github.com/Dhruv-Mishra',
  linkedin: 'https://www.linkedin.com/in/dhruv-mishra-id/',
  codeforces: 'https://codeforces.com/profile/DhruvMishra',
  cphistory: 'https://zibada.guru/gcj/profile/Dhruv985',
  email: 'mailto:dhruvmishra.id@gmail.com',
  phone: 'tel:+919599377944',
  resume: '/resources/resume.pdf',
  'project-fluentui': 'https://github.com/microsoft/fluentui-android',
  'project-courseevaluator': 'https://github.com/Dhruv-Mishra/Course-Similarity-Evaluator',
  'project-ivc': 'https://github.com/Dhruv-Mishra/Instant-Vital-Checkup-IVC',
  'project-portfolio': 'https://github.com/Dhruv-Mishra/portfolio-website',
  'project-recommender': 'https://github.com/Dhruv-Mishra/Age-and-Context-Sensitive-Hybrid-Entertaintment-Recommender-System',
  'project-atomvault': 'https://github.com/Dhruv-Mishra/AtomVault',
  'project-bloomfilter': 'https://repository.iiitd.edu.in/jspui/handle/123456789/1613',
};

interface ParsedActions {
  content: string;
  navigateTo?: string;
  themeAction?: 'dark' | 'light' | 'toggle';
  openUrls?: string[];
  feedbackAction?: boolean;
}

function parseActions(text: string): ParsedActions {
  let content = text;
  let navigateTo: string | undefined;
  let themeAction: ('dark' | 'light' | 'toggle') | undefined;
  const openUrls: string[] = [];

  // Parse [[NAVIGATE:/path]]
  const navMatch = content.match(NAVIGATE_RE);
  if (navMatch) {
    const path = navMatch[1];
    const validPaths = ['/', '/about', '/projects', '/resume', '/chat'];
    if (validPaths.includes(path)) {
      navigateTo = path;
    }
    content = content.replace(NAVIGATE_RE, '').trim();
  }

  // Parse [[THEME:dark|light|toggle]]
  const themeMatch = content.match(THEME_RE);
  if (themeMatch) {
    themeAction = themeMatch[1].toLowerCase() as 'dark' | 'light' | 'toggle';
    content = content.replace(THEME_RE, '').trim();
  }

  // Parse ALL [[OPEN:key]] tags (supports multiple)
  const openMatches = [...text.matchAll(OPEN_RE)];
  for (const match of openMatches) {
    const key = match[1].toLowerCase();
    if (OPEN_LINKS[key]) {
      openUrls.push(OPEN_LINKS[key]);
    }
  }
  content = content.replace(OPEN_SINGLE_RE, '').trim();

  // Parse [[FEEDBACK]]
  let feedbackAction: boolean | undefined;
  const feedbackMatch = content.match(FEEDBACK_RE);
  if (feedbackMatch) {
    feedbackAction = true;
    content = content.replace(FEEDBACK_RE, '').trim();
  }

  return {
    content,
    navigateTo,
    themeAction,
    openUrls: openUrls.length > 0 ? openUrls : undefined,
    feedbackAction,
  };
}

// (stripActionTags removed — no longer needed without streaming)

function getRandomFallback(): string {
  return FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
}

// Tiered filler messages — each tier shown at its corresponding delay
const FILLER_5S = [
  "This one's making me think hard...",
  "Hmm, let me think about this...",
  "Still working on this one...",
  "Give me a moment, this is a good one...",
  "Thinking extra hard on this one...",
];

const FILLER_10S = [
  "Did anyone ever tell you that you could be a quizmaster?",
  "Is this an interview? Because I'm polishing my basics again...",
  "You're really putting me through my paces here!",
  "Hold on, I'm flipping through my mental textbook...",
  "Wow, you don't ask the easy ones, do you?",
];

const FILLER_15S = [
  "Using 100% brain power...",
  "Calling on every last braincell and neuron!",
  "Pretty sure steam is coming out of my ears right now...",
  "My neurons are having a team meeting about this one.",
  "If I had a whiteboard, it would be COVERED right now.",
];

const FILLER_20S = [
  "Is this an NP-hard problem? You might have to wait a few lifetimes...",
  "How many stars in the sky would have been an easier question :P",
  "I think you just discovered a new millennium prize problem.",
  "My brain's running O(n!) on this — please stand by...",
  "At this point I'm just brute-forcing every possible answer.",
];

const FILLER_TIMEOUT = [
  "You win! I give up, you're too good for me!",
  "I zoned out there — do you mind repeating yourself?",
  "My brain just blue-screened. Can we try that again?",
  "Error 418: I'm a teapot, not a supercomputer.",
  "Okay, you officially broke me. Well played.",
];

const FILLER_TIERS = [
  { delay: 2_000, pool: FILLER_5S },
  { delay: 8_000, pool: FILLER_10S },
  { delay: 14_000, pool: FILLER_15S },
  { delay: 20_000, pool: FILLER_20S },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function loadMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CHAT_CONFIG.storageKey);
    if (!stored) return [];
    const parsed: ChatMessage[] = JSON.parse(stored);
    // Mark all loaded messages as "old" (isOld prevents actions from re-triggering)
    return parsed.map(m => ({ ...m, isOld: true }));
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    // Strip isOld/isFiller flags and welcome message before saving; keep action metadata for display
    const toSave = messages
      .filter(m => m.id !== 'welcome')
      .map(({ isOld: _, isFiller: _f, ...m }) => m)
      .slice(-CHAT_CONFIG.maxStoredMessages);
    localStorage.setItem(CHAT_CONFIG.storageKey, JSON.stringify(toSave));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function useStickyChat(): UseStickyChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasHydrated = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort('unmount');
    };
  }, []);

  // Load from localStorage after mount (hydration-safe)
  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      const stored = loadMessages();
      const welcomeMsg: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: WELCOME_MESSAGE,
        timestamp: 0,
        isOld: true,
      };
      const filtered = stored.filter(m => m.id !== 'welcome');
      setMessages([welcomeMsg, ...filtered]);

      // Restore cached LLM suggestions
      try {
        const cachedSuggestions = localStorage.getItem(CHAT_CONFIG.suggestionsStorageKey);
        if (cachedSuggestions) {
          const parsed = JSON.parse(cachedSuggestions);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSuggestions(parsed);
          }
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Save to localStorage when messages change (skip while loading)
  useEffect(() => {
    if (!hasHydrated.current || messages.length === 0) return;
    if (isLoadingRef.current) return;
    const id = setTimeout(() => saveMessages(messages), 300);
    return () => clearTimeout(id);
  }, [messages]);

  // Fetch LLM-generated suggestions based on conversation context
  const fetchSuggestions = useCallback(() => {
    const currentMessages = messagesRef.current.filter(m => m.id !== 'welcome');
    if (currentMessages.length === 0) return;

    setSuggestions([]);
    setIsSuggestionsLoading(true);
    const contextMessages = currentMessages
      .slice(-4)
      .map(m => ({ role: m.role, content: m.content }));

    fetch('/api/chat/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: contextMessages }),
    })
      .then(res => res.ok ? res.json() : { suggestions: [] })
      .then(data => {
        const newSuggestions: string[] = data.suggestions || [];
        setSuggestions(newSuggestions);
        // Cache to localStorage so they survive page switches
        try {
          if (newSuggestions.length > 0) {
            localStorage.setItem(CHAT_CONFIG.suggestionsStorageKey, JSON.stringify(newSuggestions));
          }
        } catch { /* ignore */ }
      })
      .catch(() => { /* silently fail — hardcoded fallbacks will show */ })
      .finally(() => setIsSuggestionsLoading(false));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim().slice(0, CHAT_CONFIG.maxUserMessageLength);
    if (!trimmed || isLoadingRef.current) return;

    // Check conversation turn limit
    const currentMessages = messagesRef.current;
    const userTurns = currentMessages.filter(m => m.role === 'user').length;
    if (userTurns >= CHAT_CONFIG.maxConversationTurns) {
      const wrapUpMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      const limitMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: "We've been passing quite a few notes! 📝 I think we've covered a lot. Check out my resume, projects, or about page for even more details!",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, wrapUpMsg, limitMsg]);
      return;
    }

    // Rate limit check
    const allowed = rateLimiter.check('chat', RATE_LIMITS.CHAT_API);
    if (!allowed) {
      const remaining = rateLimiter.getRemainingTime('chat', RATE_LIMITS.CHAT_API);
      setRateLimitRemaining(remaining);
      setError(`Whoa, slow down! Even sticky notes need a breather. Try again in ${remaining} seconds.`);
      return;
    }
    setRateLimitRemaining(null);
    setError(null);

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    // Add assistant placeholder (empty content — typewriter will reveal it)
    const assistantId = generateId();
    setMessages(prev => [...prev, userMsg, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }]);
    setIsLoading(true);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // Tiered filler timers — each one updates the placeholder with a progressively funnier message
    const fillerTimerIds: ReturnType<typeof setTimeout>[] = [];
    for (const tier of FILLER_TIERS) {
      const tid = setTimeout(() => {
        if (!isLoadingRef.current) return;
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: pickRandom(tier.pool), isFiller: true }
              : m
          )
        );
      }, tier.delay);
      fillerTimerIds.push(tid);
    }
    const clearFillerTimers = () => fillerTimerIds.forEach(t => clearTimeout(t));

    try {
      // Build conversation history
      const recentMessages = messagesRef.current.filter(m => m.id !== 'welcome');
      const contextWindow = recentMessages.slice(-10);
      const conversationMessages = [
        ...contextWindow.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: trimmed },
      ];

      abortControllerRef.current = new AbortController();
      timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort('timeout');
      }, CHAT_CONFIG.responseTimeoutMs);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationMessages }),
        signal: abortControllerRef.current.signal,
      });

      clearTimeout(timeoutId);
      clearFillerTimers();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Error (${response.status})`);
      }

      const data = await response.json();
      const rawReply: string = data.reply || '';

      if (rawReply) {
        // Parse action tags from the complete response
        const { content: finalContent, navigateTo, themeAction, openUrls, feedbackAction } = parseActions(rawReply);
        const hasAction = !!(navigateTo || themeAction || (openUrls && openUrls.length > 0) || feedbackAction);
        const displayContent = finalContent || (hasAction ? 'On it ~' : rawReply);

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: displayContent, isFiller: false, navigateTo, themeAction, openUrls, feedbackAction }
              : m
          )
        );
      } else {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: getRandomFallback(), isFiller: false }
              : m
          )
        );
      }
    } catch (err) {
      clearTimeout(timeoutId);
      clearFillerTimers();

      if (err instanceof Error && err.name === 'AbortError') {
        const isTimeout = abortControllerRef.current?.signal.reason === 'timeout';
        if (isTimeout) {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: pickRandom(FILLER_TIMEOUT), isFiller: false }
                : m
            )
          );
        } else {
          // Manual/navigation abort — drop empty placeholder
          setMessages(prev => prev.filter(m => m.id !== assistantId || m.content));
        }
        return;
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: getRandomFallback(), isFiller: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []); // Stable: reads all mutable state via refs

  // Add a user message + pre-built assistant response without calling the LLM.
  const addLocalExchange = useCallback((userText: string, response: Omit<ChatMessage, 'id' | 'role' | 'timestamp'>) => {
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      timestamp: Date.now(),
      ...response,
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages(prev => prev.filter(m => m.id === 'welcome'));
    setError(null);
    setSuggestions([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHAT_CONFIG.storageKey);
      localStorage.removeItem(CHAT_CONFIG.suggestionsStorageKey);
    }
  }, []);

  const markOpenUrlsFailed = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, openUrlsFailed: true } : m)
    );
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    addLocalExchange,
    clearMessages,
    markOpenUrlsFailed,
    rateLimitRemaining,
    fetchSuggestions,
    suggestions,
    isSuggestionsLoading,
  };
}
