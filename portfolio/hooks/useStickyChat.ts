// hooks/useStickyChat.ts — Chat logic with buffered LLM responses and localStorage persistence
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { CHAT_CONFIG, WELCOME_MESSAGE, getContextualFallback } from '@/lib/chatContext';
import { clearTtsAudioCache, pruneTtsAudioCache } from '@/lib/ttsAudioCache';
import { getActionFallbackReply, hasActionExecution, resolveExactActionLabel, type ActionExecution } from '@/lib/actions';
import { sanitizeAssistantReplyText } from '@/lib/chatSanitization';
import { CHAT_RESPONSE_ENDPOINT, CHAT_SUGGESTIONS_ENDPOINT } from '@/lib/chatEndpoints';
import { rateLimiter, RATE_LIMITS } from '@/lib/rateLimit';
import type { ProjectSlug } from '@/lib/projectCatalog';
import { pickRandom } from '@/lib/utils';
import { TIMING_TOKENS } from '@/lib/designTokens';
import { FILLER_DELAYS } from '@/lib/llmConfig';
import {
  CHAT_MODEL_PREF_STORAGE_KEY,
  CHAT_MODEL_SWITCH_CLEAR_EVENT,
  getChatModelPref,
} from '@/lib/chatModelPref';
import type { ChatImageAttachment } from '@/lib/chatImageCompression';
import {
  advanceInterrogation,
  drawDeniedFillerLines,
  drawRevealFillerLines,
  estimateTypewriterDuration,
  interceptMatrixPrompt,
  isInterrogationActive,
  ORACLE_ANSWER_PAUSE_MS,
  ORACLE_MESSAGE_GAP_MS,
  resetInterrogationState,
  startInterrogation,
  type InterrogationTransition,
  type MatrixInterceptKind,
} from '@/lib/matrixChatIntercept';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isOld?: boolean; // Messages loaded from localStorage
  isFiller?: boolean; // True when showing thinking/filler text (not final response)
  clientOnly?: boolean; // True when emitted by a deterministic frontend-only path
  navigateTo?: string; // Page path to navigate to
  themeAction?: 'dark' | 'light' | 'toggle' | 'disco' | 'disco-off'; // Theme switch action
  openUrls?: string[]; // External URLs to open in new tabs
  openUrlsFailed?: boolean; // True if any popup was blocked — show fallback links
  feedbackAction?: boolean; // True when the feedback modal should open
  projectSlug?: ProjectSlug; // Open a specific project modal on the current page
  commandPaletteAction?: boolean; // True when the command palette should open
  signature?: string; // Server signature for trusted assistant history replay
  /**
   * Matrix puzzle reply kind — set by the client-side regex intercept for
   * `give password` / `sudo give password`. Controls special rendering in
   * StickyNoteChat (red "denied" text or copyable key pill).
   */
  matrixInterceptKind?: 'denied' | 'reveal';
  /**
   * True on any assistant message emitted by the local matrix-puzzle
   * oracle orchestrator (filler preamble, key reveal, interrogation
   * questions, closing lines). Used to EXCLUDE these synthetic messages
   * from the LLM conversation context window so the remote model never
   * sees — and thus never imitates — the oracle's scripted voice.
   */
  oracleEmitted?: boolean;
  imagePreviewDataUrl?: string;
  imageName?: string;
  imageBytes?: number;
}

interface UseStickyChat {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, image?: ChatImageAttachment) => Promise<boolean>;
  sendCanned: (userText: string, response: string, action?: ActionExecution | null) => boolean;
  sendHardcoded: (userText: string, response: string | null) => boolean;
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
  modelId: ReturnType<typeof getChatModelPref>;
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
      typeof parsed.timestamp !== 'number' ||
      parsed.modelId !== getChatModelPref()
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

function clearPendingChatRecovery(assistantId?: string) {
  if (typeof window === 'undefined') return;

  try {
    if (assistantId) {
      const stored = sessionStorage.getItem(PENDING_CHAT_STORAGE_KEY);
      if (!stored) return;
      const pending = JSON.parse(stored) as Partial<PendingChatRecovery>;
      if (pending.assistantId !== assistantId) return;
    }
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
    // Strip ephemeral flags (isOld / isFiller / oracleEmitted) and the welcome
    // message before saving; keep action metadata for display. On reload,
    // oracle messages restore as plain assistant notes (fine — the
    // interrogation state is deliberately NOT persisted per brief).
    const toSave = messages
      .filter(m => m.id !== 'welcome')
      .map((message) => {
        const persistentMessage = { ...message };
        delete persistentMessage.isOld;
        delete persistentMessage.isFiller;
        delete persistentMessage.clientOnly;
        delete persistentMessage.oracleEmitted;
        delete persistentMessage.imagePreviewDataUrl;
        delete persistentMessage.imageName;
        delete persistentMessage.imageBytes;
        return persistentMessage;
      })
      .slice(-CHAT_CONFIG.maxStoredMessages);
    localStorage.setItem(CHAT_CONFIG.storageKey, JSON.stringify(toSave));
    void pruneTtsAudioCache(['welcome', ...toSave.map(message => message.id)]);
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
  const isLoadingRef = useRef(isLoading);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // ── Matrix oracle scheduler refs (must be declared BEFORE the unmount
  // effect so the effect's cleanup can close over the same Set reference).
  // Pending timers from the oracle orchestrator — cleared on clearMessages()
  // / unmount. Without this, a user clearing the desk mid-interrogation
  // would still see later oracle beats land.
  const oracleTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const oracleBusyRef = useRef(false);

  // Abort in-flight requests and cancel filler timers on unmount.
  // Capture the timers Set in a local variable so the cleanup callback
  // reads the same reference React saw at commit time (React lint rule).
  useEffect(() => {
    const timers = oracleTimersRef.current;
    return () => {
      abortControllerRef.current?.abort('unmount');
      suggestionsAbortRef.current?.abort('unmount');
      fillerCleanupRef.current?.();
      // Cancel any pending oracle sequencer timers (matrix puzzle).
      for (const id of timers) clearTimeout(id);
      timers.clear();
      oracleBusyRef.current = false;
      resetInterrogationState();
    };
  }, []);

  // Load from localStorage after mount (hydration-safe)
  useEffect(() => {
    let suggestionsHydrationTimer: ReturnType<typeof setTimeout> | null = null;
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
            suggestionsHydrationTimer = setTimeout(() => setSuggestions(arr), 0);
          }
        }
      } catch { /* ignore */ }
    }
    return () => {
      if (suggestionsHydrationTimer) clearTimeout(suggestionsHydrationTimer);
    };
  }, []);

  // Save to localStorage when messages change (skip while loading)
  useEffect(() => {
    if (!hasHydrated.current || messages.length === 0) return;
    if (isLoading) return;
    const id = setTimeout(() => saveMessages(messages), TIMING_TOKENS.storageSaveDebounce);
    return () => clearTimeout(id);
  }, [isLoading, messages]);

  // Fetch LLM-generated suggestions based on conversation context.
  // Skip oracle-emitted (matrix puzzle) messages — same reasoning as the
  // main chat context: don't let the LLM imitate the scripted voice.
  const fetchSuggestions = useCallback(() => {
    const currentMessages = messagesRef.current.filter(
      (m) => m.id !== 'welcome' && !m.oracleEmitted,
    );
    if (currentMessages.length === 0) return;

    // Abort any in-flight suggestion request to prevent stale results / leaks
    suggestionsAbortRef.current?.abort('superseded');
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    // Bounded timeout — suggestions are decorative, so cap the wait well under the
    // main chat timeout. Without this, a stuck connection would leave the loading
    // spinner spinning forever.
    const timeoutId = setTimeout(() => {
      controller.abort('timeout');
    }, CHAT_CONFIG.suggestionsTimeoutMs);

    setSuggestions([]);
    setIsSuggestionsLoading(true);
    const contextMessages = currentMessages
      .slice(-4)
      .map(m => ({ role: m.role, content: m.content }));

    fetch(CHAT_SUGGESTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: contextMessages }),
      signal: controller.signal,
    })
      .then(res => res.ok ? res.json() : { suggestions: [] })
      .then(data => {
        if (suggestionsAbortRef.current !== controller) return;
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
        if (suggestionsAbortRef.current === controller && err?.name !== 'AbortError') {
          setSuggestions([]);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (suggestionsAbortRef.current === controller) {
          suggestionsAbortRef.current = null;
          setIsSuggestionsLoading(false);
        }
      });
  }, []);

  // ── Matrix oracle scheduler ────────────────────────────────────────────
  // (oracleTimersRef is declared earlier, above the unmount useEffect, so
  // the cleanup closure can capture the same Set reference.)

  const clearOracleTimers = useCallback(() => {
    for (const id of oracleTimersRef.current) {
      clearTimeout(id);
    }
    oracleTimersRef.current.clear();
  }, []);

  const beginOracleSchedule = useCallback(() => {
    oracleBusyRef.current = true;
    isLoadingRef.current = true;
    setIsLoading(true);
  }, []);

  const finishOracleSchedule = useCallback(() => {
    oracleBusyRef.current = false;
    isLoadingRef.current = false;
    setIsLoading(false);
  }, []);

  const scheduleOracle = useCallback((fn: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      oracleTimersRef.current.delete(id);
      fn();
    }, delayMs);
    oracleTimersRef.current.add(id);
  }, []);

  /**
   * Append a brand new assistant message. Returns its id so later scheduler
   * callbacks can target it. Automatically stamps `oracleEmitted: true`
   * so these synthetic messages are excluded from the LLM context window
   * (the remote model should never see — or learn to imitate — the
   * oracle's scripted voice).
   */
  const appendOracleMessage = useCallback(
    (init: Omit<ChatMessage, 'id' | 'role' | 'timestamp'>): string => {
      const id = generateId();
      const msg: ChatMessage = {
        id,
        role: 'assistant',
        timestamp: Date.now(),
        oracleEmitted: true,
        ...init,
      };
      setMessages((prev) => [...prev, msg]);
      return id;
    },
    [],
  );

  /**
   * Append a filler line as a NEW assistant message. Each filler gets its
   * own typewriter pass + preserved in the transcript — feels like a
   * streaming oracle rather than a cursor overwriting itself.
   *
   * We INTENTIONALLY omit `isFiller: true` here: the `isFiller` flag causes
   * the sticky note to render italic + 50% opacity, which is the right
   * treatment for the main chat's "thinking while the LLM is slow" cue, but
   * the wrong treatment for the oracle's scripted streaming filler. The
   * brief asks for the filler to render in the SAME visual style as regular
   * LLM streamed text, so we leave these as plain assistant notes — the
   * typewriter still fires per note on first mount.
   */
  const emitFillerLine = useCallback((line: string): string => {
    return appendOracleMessage({
      content: line,
    });
  }, [appendOracleMessage]);

  /**
   * Compute how many ms to wait before the NEXT oracle message should start
   * streaming, given the previous message's typewriter duration. The
   * guarantee is ≥ ORACLE_MESSAGE_GAP_MS of "settle time" after typing
   * finishes AND before the next message begins — the brief asked for a
   * ≥1000ms beat between discrete oracle messages so the cadence feels
   * intentional rather than machine-gunned.
   */
  const oracleStepDelay = useCallback((prevLine: string) => {
    return estimateTypewriterDuration(prevLine) + ORACLE_MESSAGE_GAP_MS;
  }, []);

  const playOracleTransition = useCallback(
    (transition: InterrogationTransition): void => {
      if (transition.kind === 'ask-next') {
        const { preamble, question } = transition;
        scheduleOracle(() => {
          emitFillerLine(preamble);
        }, 0);
        scheduleOracle(() => {
          appendOracleMessage({
            content: question,
            isFiller: false,
          });
          finishOracleSchedule();
        }, oracleStepDelay(preamble));
        return;
      }

      if (transition.kind === 'finish-reveal') {
        const { approval, releasePreamble, revealContent } = transition;
        scheduleOracle(() => {
          appendOracleMessage({
            content: approval,
            isFiller: false,
          });
        }, 0);
        const afterApproval = oracleStepDelay(approval);
        scheduleOracle(() => {
          emitFillerLine(releasePreamble);
        }, afterApproval);
        const afterRelease = afterApproval + oracleStepDelay(releasePreamble);
        scheduleOracle(() => {
          appendOracleMessage({
            content: revealContent,
            matrixInterceptKind: 'reveal',
            isFiller: false,
          });
          finishOracleSchedule();
        }, afterRelease);
        return;
      }

      scheduleOracle(() => {
        appendOracleMessage({
          content: transition.closing,
          isFiller: false,
        });
        finishOracleSchedule();
      }, 0);
    },
    [scheduleOracle, emitFillerLine, appendOracleMessage, oracleStepDelay, finishOracleSchedule],
  );

  /**
   * Play the pre-reveal / pre-interrogation filler pool.
   *
   * Behaviour by branch:
   *   - `denied` → fillers, then the red "Only root…" reply. No interrogation.
   *   - `reveal` → fillers, then kick off the interrogation. The key is
   *     NOT revealed here — the orchestrator waits for the user to pass
   *     all 4 interrogation checks (see `playOracleTransition`). A wrong
   *     or invalid answer aborts without the reveal.
   *
   * Each oracle message is separated from the next by
   * ORACLE_MESSAGE_GAP_MS settle time (post-typewriter). The user's own
   * message lands instantly — the cadence applies only to oracle beats.
   */
  const playOracleFillerSequence = useCallback(
    (options: {
      userText: string;
      fillerLines: string[];
      reveal: { content: string; matrixInterceptKind: MatrixInterceptKind };
      startInterrogationAfter: boolean;
    }): void => {
      const { userText, fillerLines, reveal, startInterrogationAfter } = options;

      // 1. User message goes in first (no placeholder — each filler is its
      //    own assistant note). No oracle gap on this one.
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // 2. Stream filler lines one at a time. The first filler lands after
      //    a short ≥ ORACLE_MESSAGE_GAP_MS beat (gives the user a moment
      //    to see their own note) and each subsequent one waits for the
      //    previous to finish typing + the settle gap.
      let offsetMs = ORACLE_MESSAGE_GAP_MS;
      for (const line of fillerLines) {
        const localLine = line;
        scheduleOracle(() => {
          emitFillerLine(localLine);
        }, offsetMs);
        offsetMs += oracleStepDelay(localLine);
      }

      if (startInterrogationAfter) {
        // 3a. Reveal branch — kick off interrogation. The first question's
        //     preamble lands after the final filler's settle gap. We do NOT
        //     emit the key reveal here; `playOracleTransition` emits it
        //     only after a successful `finish-reveal` transition.
        scheduleOracle(() => {
          const transition = startInterrogation();
          playOracleTransition(transition);
        }, offsetMs);
      } else {
        // 3b. Denied branch — emit the red denial as a real (non-filler)
        //     assistant line. The `matrixInterceptKind` makes StickyNoteChat
        //     render it via `MatrixDeniedNote`.
        scheduleOracle(() => {
          appendOracleMessage({
            content: reveal.content,
            matrixInterceptKind: reveal.matrixInterceptKind,
            isFiller: false,
          });
          finishOracleSchedule();
        }, offsetMs);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduleOracle, emitFillerLine, appendOracleMessage, oracleStepDelay, finishOracleSchedule],
  );

  /**
   * Handle a user message while interrogation is active. Always claims the
   * message (never forwards to the LLM) — parses it as yes/no/invalid and
   * either asks the next question or closes the channel.
   */
  const handleInterrogationUserReply = useCallback(
    (userText: string): void => {
      beginOracleSchedule();
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Give the user's note a beat to land before the oracle responds.
      scheduleOracle(() => {
        const transition = advanceInterrogation(userText);
        playOracleTransition(transition);
      }, ORACLE_ANSWER_PAUSE_MS);
    },
    [beginOracleSchedule, scheduleOracle, playOracleTransition],
  );

  const sendMessage = useCallback((content: string, image?: ChatImageAttachment): Promise<boolean> => {
    const trimmed = content.trim().slice(0, CHAT_CONFIG.maxUserMessageLength);
    if (!trimmed || isLoadingRef.current || oracleBusyRef.current) return Promise.resolve(false);

    // ── Interrogation takes priority over every other path ──
    // If a sudo-give-password flow armed an interrogation, EVERY user
    // message while it's active is claimed here (parsed as yes/no/invalid).
    // The regular LLM is never called during interrogation.
    if (isInterrogationActive()) {
      handleInterrogationUserReply(trimmed);
      return Promise.resolve(true);
    }

    // ── Matrix puzzle client-side intercept ──
    // Short-circuit before rate-limit / server fetch so this works offline
    // and without burning chat quota. See `lib/matrixChatIntercept.tsx`.
    // This path plays the oracle-thinking filler preamble before the final
    // reveal, then (for the sudo branch) kicks off an interrogation.
    const intercept = interceptMatrixPrompt(trimmed);
    if (intercept) {
      beginOracleSchedule();
      const fillerLines = intercept.kind === 'reveal'
        ? drawRevealFillerLines(3)
        : drawDeniedFillerLines(3);
      playOracleFillerSequence({
        userText: trimmed,
        fillerLines,
        reveal: {
          content: intercept.content,
          matrixInterceptKind: intercept.kind,
        },
        startInterrogationAfter: intercept.kind === 'reveal',
      });
      return Promise.resolve(true);
    }

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
      return Promise.resolve(false);
    }
    setRateLimitRemaining(null);
    setError(null);

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      ...(image ? {
        imagePreviewDataUrl: image.dataUrl,
        imageName: image.filename,
        imageBytes: image.bytes,
      } : {}),
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
      modelId: getChatModelPref(),
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
    const clearFillerTimers = () => {
      fillerTimerIds.forEach(t => clearTimeout(t));
      if (fillerCleanupRef.current === clearFillerTimers) {
        fillerCleanupRef.current = null;
      }
    };
    fillerCleanupRef.current = clearFillerTimers;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    void (async () => {
      try {
      // Build conversation history. Oracle-emitted (matrix puzzle) messages
      // are stripped from the context so the remote LLM never sees the
      // scripted voice and can't accidentally imitate it on subsequent
      // turns. The user's `give password` / `sudo give password` question
      // is NOT oracle-emitted so it stays in context — but that's fine
      // because the server's MATRIX_PUZZLE_BLOCK already teaches the LLM
      // the right response for those phrases anyway.
      const recentMessages = messagesRef.current.filter(
        (m) => m.id !== 'welcome' && !m.oracleEmitted,
      );
      const contextWindow = recentMessages.slice(-8);
      const conversationMessages = [
        ...contextWindow.map(m => {
          const action: ActionExecution = {
            navigateTo: m.navigateTo,
            themeAction: m.themeAction,
            openUrls: m.openUrls,
            feedbackAction: m.feedbackAction,
            projectSlug: m.projectSlug,
            commandPaletteAction: m.commandPaletteAction,
          };

          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
            ...(m.role === 'assistant'
              ? {
                  signature: m.signature,
                  ...(hasActionExecution(action) ? { action } : {}),
                }
              : {}),
          };
        }),
        { role: 'user' as const, content: trimmed },
      ];

      timeoutId = setTimeout(() => {
        controller.abort('timeout');
      }, CHAT_CONFIG.responseTimeoutMs);

      const response = await fetch(CHAT_RESPONSE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationMessages,
          model: getChatModelPref(),
          ...(image ? { image: { dataUrl: image.dataUrl } } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearFillerTimers();
      if (abortControllerRef.current !== controller) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (isRecoverableServerFailure(response.status)) {
          setError(null);
          clearPendingChatRecovery(assistantId);
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
      if (abortControllerRef.current !== controller) return;
      clearPendingChatRecovery(assistantId);
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
                  commandPaletteAction: serverAction?.commandPaletteAction,
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
      if (abortControllerRef.current !== controller) return;

      if (err instanceof Error && err.name === 'AbortError') {
        const reason = controller.signal.reason;
        if (reason === 'clear') {
          clearPendingChatRecovery(assistantId);
          // clearMessages already wiped state — nothing to do
          return;
        }
        if (reason === 'timeout') {
          clearPendingChatRecovery(assistantId);
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
        clearPendingChatRecovery(assistantId);
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
      if (abortControllerRef.current === controller) {
        isLoadingRef.current = false;
        setIsLoading(false);
        abortControllerRef.current = null;
      }
      }
    })();

    return Promise.resolve(true);
  }, [beginOracleSchedule, handleInterrogationUserReply, playOracleFillerSequence]); // Stable otherwise; reads state via refs

  const clearMessages = useCallback(() => {
    // Abort any in-flight LLM request and suggestions fetch
    abortControllerRef.current?.abort('clear');
    abortControllerRef.current = null;
    isLoadingRef.current = false;
    suggestionsAbortRef.current?.abort('clear');
    suggestionsAbortRef.current = null;
    clearPendingChatRecovery();
    // Cancel any pending filler timers
    fillerCleanupRef.current?.();
    // Cancel any oracle (matrix puzzle) sequencer timers too.
    clearOracleTimers();
    oracleBusyRef.current = false;
    resetInterrogationState();
    // Reset all state
    setMessages(prev => prev.filter(m => m.id === 'welcome'));
    setIsLoading(false);
    setError(null);
    setSuggestions([]);
    setIsSuggestionsLoading(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHAT_CONFIG.storageKey);
      localStorage.removeItem(CHAT_CONFIG.suggestionsStorageKey);
      void clearTtsAudioCache();
    }
  }, [clearOracleTimers]);

  useEffect(() => {
    const clearForModelSwitch = () => clearMessages();
    const clearForCrossTabModelSwitch = (event: StorageEvent) => {
      if (event.key === CHAT_MODEL_PREF_STORAGE_KEY) clearMessages();
    };
    window.addEventListener(CHAT_MODEL_SWITCH_CLEAR_EVENT, clearForModelSwitch);
    window.addEventListener('storage', clearForCrossTabModelSwitch);
    return () => {
      window.removeEventListener(CHAT_MODEL_SWITCH_CLEAR_EVENT, clearForModelSwitch);
      window.removeEventListener('storage', clearForCrossTabModelSwitch);
    };
  }, [clearMessages]);

  const markOpenUrlsFailed = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, openUrlsFailed: true } : m)
    );
  }, []);

  /**
  * Inject a user message + canned assistant reply locally — bypasses
   * the remote chat endpoint entirely. Used by the chat UI to short-circuit hardcoded
  * initial-suggestion clicks and exact action labels.
   *
   * No rate limiting, no filler timers, no oracle handoff: this is
   * intentionally a deterministic synchronous path, since the response is
   * baked at build time.
   */
  const sendCanned = useCallback((userText: string, response: string, action?: ActionExecution | null): boolean => {
    if (isLoadingRef.current) return false;
    const trimmed = userText.trim().slice(0, CHAT_CONFIG.maxUserMessageLength);
    if (!trimmed) return false;
    suggestionsAbortRef.current?.abort('hardcoded');
    suggestionsAbortRef.current = null;
    setSuggestions([]);
    setIsSuggestionsLoading(false);
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: now,
    };
    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: response,
      timestamp: now + 1,
      clientOnly: true,
      navigateTo: action?.navigateTo,
      themeAction: action?.themeAction,
      openUrls: action?.openUrls,
      feedbackAction: action?.feedbackAction,
      projectSlug: action?.projectSlug,
      commandPaletteAction: action?.commandPaletteAction,
    };
    const next = [...messagesRef.current, userMsg, assistantMsg];
    setMessages(next);
    saveMessages(next);
    setError(null);
    return true;
  }, []);

  const sendHardcoded = useCallback((userText: string, response: string | null) => {
    // Oracle answers must flow into sendMessage so the active interrogation
    // can parse them instead of being replaced with a canned reply or action.
    if (isInterrogationActive()) return false;

    const action = resolveExactActionLabel(userText);
    const fallback = action ? getActionFallbackReply(action) : null;
    const reply = response ?? fallback;

    if (!reply) return false;
    return sendCanned(userText, reply, action);
  }, [sendCanned]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    sendCanned,
    sendHardcoded,
    clearMessages,
    markOpenUrlsFailed,
    rateLimitRemaining,
    fetchSuggestions,
    suggestions,
    isSuggestionsLoading,
  };
}
