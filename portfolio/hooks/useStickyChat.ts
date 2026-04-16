// hooks/useStickyChat.ts — Chat logic with buffered LLM responses and localStorage persistence
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { CHAT_CONFIG, WELCOME_MESSAGE, getContextualFallback } from '@/lib/chatContext';
import { hasActionExecution, type ActionExecution } from '@/lib/actions';
import { sanitizeAssistantReplyText } from '@/lib/chatSanitization';
import { rateLimiter, RATE_LIMITS } from '@/lib/rateLimit';
import type { ProjectSlug } from '@/lib/projectCatalog';
import { pickRandom } from '@/lib/utils';
import { TIMING_TOKENS } from '@/lib/designTokens';
import { FILLER_DELAYS } from '@/lib/llmConfig';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isOld?: boolean; // Messages loaded from localStorage
  isFiller?: boolean; // True when showing thinking/filler text (not final response)
  navigateTo?: string; // Page path to navigate to
  themeAction?: 'dark' | 'light' | 'toggle'; // Theme switch action
  openUrls?: string[]; // External URLs to open in new tabs
  openUrlsFailed?: boolean; // True if any popup was blocked — show fallback links
  feedbackAction?: boolean; // True when the feedback modal should open
  projectSlug?: ProjectSlug; // Open a specific project modal on the current page
  signature?: string; // Server signature for trusted assistant history replay
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

function getDisplayErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Chat service is unavailable right now. Try again in a sec.';
}

function isRecoverableServerFailure(status: number): boolean {
  return status >= 500;
}

function isRecoverableClientFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  if (error.name === 'AbortError') {
    return false;
  }

  return !/rate limited|conversation is too long|context is too large|messages are required|required/i.test(error.message);
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// (stripActionTags removed — no longer needed without streaming)

// Tiered filler messages — each tier shown at its corresponding delay.
// Written to sound like Dhruv: casual, thoughtful, a little nerdy, and still in-theme.
const FILLER_5S = [
  "Let me think for a sec, I want to answer this properly...",
  "One sec, flipping through the mental sketchbook...",
  "Working on it. I have thoughts, just lining them up...",
  "Hang on, I am piecing this together...",
  "Give me a moment, I do not want to hand-wave this one...",
  "Scribbling out a real answer, not just vibes...",
];

const FILLER_10S = [
  "Still with me. This needs a slightly less lazy answer...",
  "Pulling a few details together so I do not butcher it...",
  "Almost there, just connecting the useful dots...",
  "This is the kind of question I would usually answer with a whiteboard...",
  "Trying to keep this crisp instead of dumping raw brain-noise on you...",
  "One more minute, I am tightening the answer up...",
];

const FILLER_15S = [
  "Okay, this one is taking actual brainpower now...",
  "Still here. I am making sure the answer is worth the wait...",
  "This got bigger than a quick sticky note, but I am on it...",
  "Running through the mental notes and trimming the nonsense...",
  "I could answer faster, but it would be worse. So, doing it properly...",
  "This is somewhere between a reply and a mini design review now...",
];

const FILLER_20S = [
  "At this point I have promoted the problem from sticky note to full notebook page...",
  "Pretty sure this answer wants coffee, a whiteboard, and maybe a compiler...",
  "My brain is doing the software-engineer thing where it checks edge cases before speaking...",
  "Still cooking. Trying to make this useful, not just impressive-looking...",
  "If this were an interview, this is the part where I ask for a marker...",
  "This is taking long enough that it now feels performance-sensitive...",
];

const FILLER_30S = [
  "Still on it. I am deep enough in the weeds that I should at least come back with something solid...",
  "This answer has officially crossed from quick reply into proper thought...",
  "I am still here, just making sure I do not give you a polished-sounding wrong answer...",
  "Somewhere between system design mode and overthinking mode right now...",
  "This is one of those answers where the last 20 percent takes most of the time...",
  "I promise I did not wander off, I am just debugging the wording in my head...",
];

const FILLER_40S = [
  "Okay, this is taking long enough that I owe you a good answer now...",
  "Still writing. At this point the response has gone from sticky note to mini essay...",
  "Hanging in there. Trying to return something thoughtful instead of AI-flavored wallpaper...",
  "I am in the final stretch, just pressure-testing the answer before I hand it over...",
  "This turned into the conversational equivalent of a long compile, but it is still running...",
  "If I had a real notepad here, this would be page two already...",
];

const FILLER_TIERS = [
  { delay: FILLER_DELAYS.tier1, pool: FILLER_5S },
  { delay: FILLER_DELAYS.tier2, pool: FILLER_10S },
  { delay: FILLER_DELAYS.tier3, pool: FILLER_15S },
  { delay: FILLER_DELAYS.tier4, pool: FILLER_20S },
  { delay: FILLER_DELAYS.tier5, pool: FILLER_30S },
  { delay: FILLER_DELAYS.tier6, pool: FILLER_40S },
];

const PENDING_CHAT_STORAGE_KEY = `${CHAT_CONFIG.storageKey}:pending`;
const PENDING_CHAT_TTL_MS = 120_000;

interface PendingChatRecovery {
  assistantId: string;
  prompt: string;
  timestamp: number;
  userId: string;
}

function loadPendingChatRecovery(): PendingChatRecovery | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = sessionStorage.getItem(PENDING_CHAT_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<PendingChatRecovery>;
    if (
      typeof parsed.prompt !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.assistantId !== 'string' ||
      typeof parsed.timestamp !== 'number'
    ) {
      sessionStorage.removeItem(PENDING_CHAT_STORAGE_KEY);
      return null;
    }

    if (Date.now() - parsed.timestamp > PENDING_CHAT_TTL_MS) {
      sessionStorage.removeItem(PENDING_CHAT_STORAGE_KEY);
      return null;
    }

    return parsed as PendingChatRecovery;
  } catch {
    sessionStorage.removeItem(PENDING_CHAT_STORAGE_KEY);
    return null;
  }
}

function savePendingChatRecovery(recovery: PendingChatRecovery) {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(PENDING_CHAT_STORAGE_KEY, JSON.stringify(recovery));
  } catch {
    // Ignore storage failures.
  }
}

function clearPendingChatRecovery() {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(PENDING_CHAT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function recoverMessagesWithPendingFallback(messages: ChatMessage[]): ChatMessage[] {
  const pending = loadPendingChatRecovery();
  if (!pending) {
    return messages;
  }

  const fallbackContent = getContextualFallback(pending.prompt);
  let recovered = false;

  const nextMessages = messages.map((message) => {
    if (message.id !== pending.assistantId) {
      return message;
    }

    recovered = true;
    return {
      ...message,
      content: message.content || fallbackContent,
      isOld: true,
      isFiller: false,
    };
  });

  if (!recovered) {
    nextMessages.push({
      id: pending.assistantId,
      role: 'assistant',
      content: fallbackContent,
      timestamp: pending.timestamp + 1,
      isOld: true,
    });
  }

  clearPendingChatRecovery();
  return nextMessages;
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured to omit from saved data
      .map(({ isOld: _isOld, isFiller: _isFiller, ...m }) => m)
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
  const fillerCleanupRef = useRef<(() => void) | null>(null);
  const hasHydrated = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  // Abort in-flight requests and cancel filler timers on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort('unmount');
      suggestionsAbortRef.current?.abort('unmount');
      fillerCleanupRef.current?.();
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
      setMessages(recoverMessagesWithPendingFallback([welcomeMsg, ...filtered]));

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
    const id = setTimeout(() => saveMessages(messages), TIMING_TOKENS.storageSaveDebounce);
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
    // Immediately guard against double-fire — blocks concurrent sends before React
    // re-renders and syncs the ref from state. Without this, rapid double-clicks
    // could bypass the guard since setIsLoading(true) only updates the ref on next render.
    isLoadingRef.current = true;

    // Rate limit check
    const allowed = rateLimiter.check('chat', RATE_LIMITS.CHAT_API);
    if (!allowed) {
      isLoadingRef.current = false; // Reset guard — rate limit rejection is not a loading state
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
    const pendingAssistant: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    const optimisticMessages = [...messagesRef.current, userMsg, pendingAssistant];
    setMessages(optimisticMessages);
    saveMessages(optimisticMessages);
    savePendingChatRecovery({
      assistantId,
      prompt: trimmed,
      timestamp: pendingAssistant.timestamp,
      userId: userMsg.id,
    });
    setIsLoading(true);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // Cancel any filler timers from a still-in-flight previous message
    fillerCleanupRef.current?.();
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
    const clearFillerTimers = () => { fillerTimerIds.forEach(t => clearTimeout(t)); fillerCleanupRef.current = null; };
    fillerCleanupRef.current = clearFillerTimers;

    try {
      // Build conversation history
      const recentMessages = messagesRef.current.filter(m => m.id !== 'welcome');
      const contextWindow = recentMessages.slice(-10);
      const conversationMessages = [
        ...contextWindow.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ...(m.role === 'assistant'
            ? {
                signature: m.signature,
                action: {
                  navigateTo: m.navigateTo,
                  themeAction: m.themeAction,
                  openUrls: m.openUrls,
                  feedbackAction: m.feedbackAction,
                  projectSlug: m.projectSlug,
                },
              }
            : {}),
        })),
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
        if (isRecoverableServerFailure(response.status)) {
          setError(null);
          clearPendingChatRecovery();
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: getContextualFallback(trimmed), isFiller: false }
                : m
            )
          );
          return;
        }

        throw new Error(errorData.error || `Error (${response.status})`);
      }

      const data = await response.json();
      clearPendingChatRecovery();
      const rawReply: string = data.reply || '';
      const safeReply = sanitizeAssistantReplyText(rawReply);
      const serverAction = hasActionExecution(data.action as ActionExecution | null | undefined)
        ? data.action as ActionExecution
        : null;

      if (safeReply || serverAction) {
        const hasAction = hasActionExecution(serverAction);
        const displayContent = safeReply || (hasAction ? 'On it ~' : getContextualFallback(trimmed));

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content: displayContent,
                  isFiller: false,
                  navigateTo: serverAction?.navigateTo,
                  themeAction: serverAction?.themeAction,
                  openUrls: serverAction?.openUrls,
                  feedbackAction: serverAction?.feedbackAction,
                  projectSlug: serverAction?.projectSlug,
                  signature: typeof data.signature === 'string' ? data.signature : undefined,
                }
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
        const reason = abortControllerRef.current?.signal.reason;
        if (reason === 'clear') {
          clearPendingChatRecovery();
          // clearMessages already wiped state — nothing to do
          return;
        }
        if (reason === 'timeout') {
          clearPendingChatRecovery();
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

      if (isRecoverableClientFailure(err)) {
        setError(null);
        clearPendingChatRecovery();
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: getContextualFallback(trimmed), isFiller: false }
              : m
          )
        );
        return;
      }

      setError(getDisplayErrorMessage(err));

      setMessages(prev =>
        prev.filter(m => m.id !== assistantId)
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []); // Stable: reads all mutable state via refs

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
    // Abort any in-flight LLM request and suggestions fetch
    abortControllerRef.current?.abort('clear');
    abortControllerRef.current = null;
    suggestionsAbortRef.current?.abort('clear');
    suggestionsAbortRef.current = null;
    clearPendingChatRecovery();
    // Cancel any pending filler timers
    fillerCleanupRef.current?.();
    // Reset all state
    setMessages(prev => prev.filter(m => m.id === 'welcome'));
    setIsLoading(false);
    setError(null);
    setSuggestions([]);
    setIsSuggestionsLoading(false);
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
