// hooks/useStickyChat.ts — Chat logic with buffered LLM responses and localStorage persistence
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { CHAT_CONFIG, WELCOME_MESSAGE, getContextualFallback } from '@/lib/chatContext';
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

// Tiered filler messages — each tier shown at its corresponding delay.
// Written as short, first-person "thinking out loud" lines that fit a sticky-note chat
// from a software engineer. No question-specific context needed.
const FILLER_5S = [
  "Hmm, let me think about this...",
  "Give me a sec, putting my thoughts together...",
  "One moment — organizing my notes...",
  "Let me dig into this for you...",
  "Working on it, hang tight...",
  "Hold on — juggling a few conversations here...",
];

const FILLER_10S = [
  "Still on it — this needs a bit more thought...",
  "Pulling up some details, almost there...",
  "Taking a bit longer than I expected — bear with me!",
  "Writing you a proper answer, one sec...",
  "Almost done — just connecting a few dots...",
  "Talking to a lot of people today — you're next in line!",
];

const FILLER_15S = [
  "Okay, this one's taking some real brainpower...",
  "Deep in thought — haven't forgotten about you!",
  "Still here! Just making sure I get this right.",
  "This turned out to be a bigger topic than I thought...",
  "Running through my mental notes, almost there...",
  "I've gotten really popular lately — hard to keep up!",
];

const FILLER_20S = [
  "Is this an NP-hard problem? Please stand by...",
  "My brain's running O(n!) on this one — hang in there...",
  "Pretty sure this needs a whiteboard and three cups of coffee...",
  "Brute-forcing every possible answer at this point...",
  "Segfault in my brain. Restarting thought process...",
  "Managing this many conversations is basically distributed systems at this point...",
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
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const hasHydrated = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort('unmount');
      suggestionsAbortRef.current?.abort('unmount');
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
          // Support both formats: { suggestions: [...] } and plain [...]
          const arr = Array.isArray(parsed) ? parsed : parsed?.suggestions;
          if (Array.isArray(arr) && arr.length > 0) {
            setSuggestions(arr);
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

    // Abort any in-flight suggestion request to prevent stale results / leaks
    suggestionsAbortRef.current?.abort('superseded');
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    setSuggestions([]);
    setIsSuggestionsLoading(true);
    const contextMessages = currentMessages
      .slice(-4)
      .map(m => ({ role: m.role, content: m.content }));

    fetch('/api/chat/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: contextMessages }),
      signal: controller.signal,
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
      .catch((err) => {
        // Only set empty on real failures, not abort
        if (err?.name !== 'AbortError') setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSuggestionsLoading(false);
      });
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim().slice(0, CHAT_CONFIG.maxUserMessageLength);
    if (!trimmed || isLoadingRef.current) return;

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
              ? { ...m, content: getContextualFallback(trimmed), isFiller: false }
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
                ? { ...m, content: getContextualFallback(trimmed), isFiller: false }
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
            ? { ...m, content: getContextualFallback(trimmed), isFiller: false }
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
