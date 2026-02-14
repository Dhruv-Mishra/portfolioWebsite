// hooks/useStickyChat.ts — Chat logic with streaming and localStorage persistence
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
  navigateTo?: string; // Page path to navigate to (parsed from [[NAVIGATE:/path]])
  themeAction?: 'dark' | 'light' | 'toggle'; // Theme switch action
  openUrl?: string; // External URL to open in new tab
  openUrlFailed?: boolean; // True if popup was blocked — show fallback link
}

interface UseStickyChat {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  addLocalExchange: (userText: string, response: Omit<ChatMessage, 'id' | 'role' | 'timestamp'>) => void;
  clearMessages: () => void;
  markOpenUrlFailed: (messageId: string) => void;
  rateLimitRemaining: number | null;
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Parse and strip action tags from message content
const NAVIGATE_RE = /\[\[NAVIGATE:(\/[a-z-]*)\]\]/i;
const THEME_RE = /\[\[THEME:(dark|light|toggle)\]\]/i;
const OPEN_RE = /\[\[OPEN:([a-z0-9-]+)\]\]/i;

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
  openUrl?: string;
}

function parseActions(text: string): ParsedActions {
  let content = text;
  let navigateTo: string | undefined;
  let themeAction: ('dark' | 'light' | 'toggle') | undefined;
  let openUrl: string | undefined;

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

  // Parse [[OPEN:key]]
  const openMatch = content.match(OPEN_RE);
  if (openMatch) {
    const key = openMatch[1].toLowerCase();
    if (OPEN_LINKS[key]) {
      openUrl = OPEN_LINKS[key];
    }
    content = content.replace(OPEN_RE, '').trim();
  }

  return { content, navigateTo, themeAction, openUrl };
}

// Strip all action tags for display (used during streaming)
const ALL_ACTION_TAGS_RE = /\[\[(NAVIGATE|THEME|OPEN):[^\]]*\]\]/gi;
function stripActionTags(text: string): string {
  return text.replace(ALL_ACTION_TAGS_RE, '').trim();
}

function getRandomFallback(): string {
  return FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
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
    // Strip isOld flag and welcome message before saving; keep action metadata for display
    const toSave = messages
      .filter(m => m.id !== 'welcome')
      .map(({ isOld: _, ...m }) => m)
      .slice(-CHAT_CONFIG.maxStoredMessages);
    localStorage.setItem(CHAT_CONFIG.storageKey, JSON.stringify(toSave));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function useStickyChat(): UseStickyChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasHydrated = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // Abort in-flight requests on unmount to prevent memory leaks
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
    }
  }, []);

  // Save to localStorage whenever messages change
  useEffect(() => {
    if (hasHydrated.current && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    // Enforce max user message length
    const trimmed = content.trim().slice(0, CHAT_CONFIG.maxUserMessageLength);
    if (!trimmed || isStreamingRef.current) return;

    // Check conversation turn limit (read from ref to avoid dependency)
    const currentMessages = messagesRef.current;
    const userTurns = currentMessages.filter(m => m.role === 'user').length;
    if (userTurns >= CHAT_CONFIG.maxConversationTurns) {
      // Add a gentle wrap-up note instead of calling the API
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

    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    // Prepare assistant placeholder
    const assistantId = generateId();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }]);

    // Client-side timeout: abort if no complete response within the limit
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Build conversation history (exclude welcome, limit context window)
      const recentMessages = messagesRef.current.filter(m => m.id !== 'welcome');
      const contextWindow = recentMessages.slice(-10); // Last 10 messages for context
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Error (${response.status})`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const data = trimmedLine.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const chunkContent = parsed.choices?.[0]?.delta?.content || '';
            if (chunkContent) {
              accumulated += chunkContent;
              // Strip action tags from displayed content during streaming
              const displayContent = stripActionTags(accumulated);
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: displayContent }
                    : m
                )
              );
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      // Final parse: extract all actions and clean content
      clearTimeout(timeoutId);
      if (accumulated) {
        const { content: finalContent, navigateTo, themeAction, openUrl } = parseActions(accumulated);
        // If the LLM only sent a tag with no text, provide a short acknowledgement
        const hasAction = !!(navigateTo || themeAction || openUrl);
        const displayContent = finalContent
          || (hasAction ? 'On it ~' : accumulated);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: displayContent, navigateTo, themeAction, openUrl }
              : m
          )
        );
      } else {
        // No content — show a friendly fallback
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: getRandomFallback() }
              : m
          )
        );
      }
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error && err.name === 'AbortError') {
        // Timeout abort: if we got partial content keep it, otherwise show fallback
        const isTimeout = abortControllerRef.current?.signal.reason === 'timeout';
        if (isTimeout) {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== assistantId) return m;
              return m.content
                ? m // keep partial streamed content
                : { ...m, content: getRandomFallback() };
            })
          );
        } else {
          // Manual/navigation abort — drop empty placeholder
          setMessages(prev => prev.filter(m => m.id !== assistantId || m.content));
        }
        return;
      }

      // Instead of showing an error, replace with a friendly fallback note
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: getRandomFallback() }
            : m
        )
      );
      // Don't set error — the fallback note handles it gracefully
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, []); // Stable: reads all mutable state via refs

  // Add a user message + pre-built assistant response without calling the LLM.
  // Used for hardcoded suggestion actions (theme toggle, navigation, URL open).
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHAT_CONFIG.storageKey);
    }
  }, []);

  const markOpenUrlFailed = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, openUrlFailed: true } : m)
    );
  }, []);

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    addLocalExchange,
    clearMessages,
    markOpenUrlFailed,
    rateLimitRemaining,
  };
}
