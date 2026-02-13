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
}

interface UseStickyChat {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  rateLimitRemaining: number | null;
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Parse and strip [[NAVIGATE:/path]] from message content
const NAVIGATE_RE = /\[\[NAVIGATE:(\/[a-z-]*)\]\]/i;
function parseNavigation(text: string): { content: string; navigateTo?: string } {
  const match = text.match(NAVIGATE_RE);
  if (match) {
    const path = match[1];
    const validPaths = ['/', '/about', '/projects', '/resume', '/chat'];
    if (validPaths.includes(path)) {
      return { content: text.replace(NAVIGATE_RE, '').trim(), navigateTo: path };
    }
  }
  return { content: text };
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
    // Mark all loaded messages as "old", clear navigation triggers
    return parsed.map(m => ({ ...m, isOld: true, navigateTo: undefined }));
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    // Strip isOld/navigateTo and welcome message before saving
    const toSave = messages
      .filter(m => m.id !== 'welcome')
      .map(({ isOld: _, navigateTo: __, ...m }) => m)
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
    if (!trimmed || isStreaming) return;

    // Check conversation turn limit
    const userTurns = messages.filter(m => m.role === 'user').length;
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

    try {
      // Build conversation history (exclude welcome, limit context window)
      const recentMessages = messages.filter(m => m.id !== 'welcome');
      const contextWindow = recentMessages.slice(-10); // Last 10 messages for context
      const conversationMessages = [
        ...contextWindow.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: trimmed },
      ];

      abortControllerRef.current = new AbortController();

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
              // Strip navigation tags from displayed content during streaming
              const { content: displayContent } = parseNavigation(accumulated);
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

      // Final parse: extract navigation and clean content
      if (accumulated) {
        const { content: finalContent, navigateTo } = parseNavigation(accumulated);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: finalContent || accumulated, navigateTo }
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
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== assistantId || m.content));
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
  }, [isStreaming, messages]);

  const clearMessages = useCallback(() => {
    setMessages(prev => prev.filter(m => m.id === 'welcome'));
    setError(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHAT_CONFIG.storageKey);
    }
  }, []);

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
    rateLimitRemaining,
  };
}
