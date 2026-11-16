"use client";

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useRef, useEffect, useEffectEvent, useCallback, useLayoutEffect, useSyncExternalStore, memo, useMemo, type CSSProperties, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ImagePlus, Loader2, Pause, Play, RotateCcw, Send, Trash2, Volume2, X, Zap } from 'lucide-react';
import { useStickyChat, ChatMessage } from '@/hooks/useStickyChat';
import {
  MatrixDeniedNote,
  MatrixKeyRevealNote,
  extractRevealedKey,
} from '@/lib/matrixChatIntercept';
import { useAppHaptics } from '@/lib/haptics';
import { soundManager } from '@/lib/soundManager';
import { appendUserAction } from '@/lib/userActionJournal';
import type { ProjectSlug } from '@/lib/projectCatalog';
import { cn, pickRandom } from '@/lib/utils';
import { CHAT_CONFIG } from '@/lib/chatContext';
import PillScrollbar from '@/components/PillScrollbar';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import { MicButton } from '@/components/ui/MicButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { Modal } from '@/components/ui/Modal';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import {
  TTS_PLAYBACK_SPEEDS,
  useTtsPlayback,
  type TtsPlaybackSpeed,
  type TtsPlaybackStatus,
} from '@/hooks/useTtsPlayback';
import { ListeningOverlay } from '@/components/ui/ListeningOverlay';
import { useVoiceBackendPref } from '@/lib/voiceBackendPref';
import { useVoiceOutputPref } from '@/lib/voiceOutputPref';
import { useSpeakByDefaultPref } from '@/lib/speakByDefaultPref';
import { MOTION, TIMING_TOKENS, NOTE_ROTATION } from '@/lib/designTokens';
import {
  ACTION_REGISTRY,
  DISCO_ACTION_LABEL,
  DISCO_EXIT_ACTION_LABEL,
  FOLLOWUP_CONVERSATIONAL,
  getFollowupActions,
  getInitialChatSuggestions,
  getPromotedFollowupActions,
} from '@/lib/actions';
import { getSuggestionResponse } from '@/lib/suggestionResponses';
import { unlockSticker, useDiscoActive, useMatrixEscaped } from '@/hooks/useStickers';
import { Tooltip } from '@/components/ui/Tooltip';
import { runDiscoMode, runThemeSelection, runThemeToggle } from '@/lib/themeToggleAction';
import { requestVoiceMode } from '@/lib/voiceModeStore';
import {
  CLOSE_PROJECT_EVENT,
  OPEN_CHAT_EVENT,
  SEND_CHAT_MESSAGE_EVENT,
  registerSiteActionHost,
  attachSiteActionResult,
  type SendChatMessageEventDetail,
} from '@/lib/siteActionEvents';
import { compressChatImage, type ChatImageAttachment } from '@/lib/chatImageCompression';
import { getChatModel } from '@/lib/chatModels';
import { getChatModelDisplayName } from '@/lib/chatModelStatus';
import {
  appendComposerHistory,
  canNavigateComposerHistory,
  createComposerHistoryState,
  navigateComposerHistory,
  resetComposerHistoryNavigation,
} from '@/lib/composerHistory';
import {
  CHAT_MODEL_PREF_STORAGE_KEY,
  CHAT_MODEL_SWITCH_CLEAR_EVENT,
  useChatModelPref,
} from '@/lib/chatModelPref';
import '@/components/chat/chat.css';

const ChatProjectModal = dynamic(() => import('@/components/ChatProjectModal'), { ssr: false });

/** Delay (ms) before executing page navigation after action confirmation */
const NAVIGATION_DELAY_MS = TIMING_TOKENS.pauseMedium;
function getNextTtsPlaybackSpeed(current: TtsPlaybackSpeed): TtsPlaybackSpeed {
  const currentIndex = TTS_PLAYBACK_SPEEDS.indexOf(current);
  return TTS_PLAYBACK_SPEEDS[(currentIndex + 1) % TTS_PLAYBACK_SPEEDS.length];
}

// ─── Typewriter hook: reveals text gradually (only for new AI messages) ───
// Erases only back to the prefix shared with the next text, so streamed replies keep typing
// forward and a final correction rewrites just its tail. Start/complete callbacks fire only for
// final text (not filler, not provisional streamed text).
type TypewriterPhase = 'idle' | 'typing' | 'erasing';

function getSharedPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a.charCodeAt(index) === b.charCodeAt(index)) index += 1;
  return index;
}

// Types several characters per tick when far behind so the note never trails a fast stream.
function getTypeStep(backlog: number): number {
  if (backlog > 160) return Math.ceil(backlog / 40);
  if (backlog > 48) return 2;
  return 1;
}

function useTypewriter(
  text: string,
  isFiller: boolean,
  skip: boolean,
  speed = TIMING_TOKENS.typeSpeed,
  onStart?: () => void,
  onComplete?: () => void,
  isStreaming = false,
) {
  const [phase, setPhase] = useState<TypewriterPhase>('idle');
  const [displayedText, setDisplayedText] = useState(skip ? text : '');
  const displayedTextRef = useRef(skip ? text : '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef(0);
  const startedTextRef = useRef<string | null>(null);
  const completedTextRef = useRef<string | null>(null);
  const displayedIsFillerRef = useRef(false);
  const eraseSpeed = Math.max(speed * 0.6, 8); // base: TIMING_TOKENS.eraseSpeed
  const notifyStart = useEffectEvent(() => onStart?.());
  const notifyComplete = useEffectEvent(() => onComplete?.());
  const phaseRef = useRef<TypewriterPhase>('idle');

  const isTyping = phase === 'typing' || phase === 'erasing';
  const clearActiveTimer = useCallback(() => {
    runIdRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (skip) return;
    const activeRunId = ++runIdRef.current;
    const isFinalText = !isFiller && !isStreaming;

    const schedule = (callback: () => void, delay: number) => {
      timerRef.current = setTimeout(() => {
        if (runIdRef.current !== activeRunId) return;
        callback();
      }, delay);
    };

    const updateDisplayedText = (nextText: string) => {
      displayedTextRef.current = nextText;
      setDisplayedText(nextText);
    };

    const announceStart = (targetText: string) => {
      if (!isFinalText || startedTextRef.current === targetText) return;
      startedTextRef.current = targetText;
      notifyStart();
    };

    const finish = (finalText: string) => {
      updateDisplayedText(finalText);
      setPhase('idle');
      phaseRef.current = 'idle';
      timerRef.current = null;
      if (!isFinalText || completedTextRef.current === finalText) return;
      announceStart(finalText);
      completedTextRef.current = finalText;
      notifyComplete();
    };

    const startTyping = (targetText: string, startIndex = 0) => {
      setPhase('typing');
      phaseRef.current = 'typing';
      displayedIsFillerRef.current = isFiller;
      announceStart(targetText);

      const tick = (index: number) => {
        if (runIdRef.current !== activeRunId) return;

        const nextIndex = Math.min(targetText.length, index + getTypeStep(targetText.length - index));
        updateDisplayedText(targetText.slice(0, nextIndex));

        if (nextIndex >= targetText.length) {
          finish(targetText);
          return;
        }

        schedule(() => tick(nextIndex), speed);
      };

      if (startIndex >= targetText.length) {
        finish(targetText);
        return;
      }

      schedule(() => tick(startIndex), speed);
    };

    const startErasing = (fromText: string, toText: string, keepLength: number) => {
      setPhase('erasing');
      phaseRef.current = 'erasing';

      const tick = (remainingLength: number) => {
        if (runIdRef.current !== activeRunId) return;

        const nextLength = Math.max(keepLength, remainingLength - 1);
        updateDisplayedText(fromText.slice(0, nextLength));

        if (nextLength <= keepLength) {
          startTyping(toText, keepLength);
          return;
        }

        schedule(() => tick(nextLength), eraseSpeed);
      };

      schedule(() => tick(fromText.length), eraseSpeed);
    };

    const currentText = displayedTextRef.current;

    if (text === '' && !currentText) {
      setPhase('idle');
      phaseRef.current = 'idle';
      return;
    }

    if (text === currentText) {
      finish(text);
      return;
    }

    // Filler is never a draft of the reply, so it is always fully erased.
    const keepLength = isFiller || displayedIsFillerRef.current || phaseRef.current === 'erasing'
      ? 0
      : getSharedPrefixLength(currentText, text);
    if (keepLength === currentText.length) {
      startTyping(text, keepLength);
    } else {
      startErasing(currentText, text, keepLength);
    }

    return () => {
      clearActiveTimer();
    };
  }, [text, skip, speed, eraseSpeed, isFiller, isStreaming, clearActiveTimer]);

  return {
    displayedText: skip ? text : displayedText,
    isTyping: skip ? false : isTyping,
    isFiller: skip ? isFiller : phase === 'erasing' || isFiller,
  };
}

// ─── Typing Ellipsis — bouncing dots with staggered scale wave ───
// ─── Placeholder Typewriter — cycles through hint texts in the input box ———
const PLACEHOLDER_TEXTS = [
  'Write a note...',
  'Ask about my projects...',
  'What tech do I use?',
  'Tell me a fun fact...',
  'What games do I play?',
  'Ask me anything...',
] as const;
const PLACEHOLDER_TYPE_SPEED = TIMING_TOKENS.placeholderTypeSpeed;
const PLACEHOLDER_ERASE_SPEED = TIMING_TOKENS.placeholderEraseSpeed;
const PLACEHOLDER_PAUSE_MS = TIMING_TOKENS.pauseExtra;

const ACTION_SUGGESTION_SET = new Set(ACTION_REGISTRY.map(action => action.label));

function usePlaceholderTypewriter(isActive: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      // Show "Thinking..." when inactive (loading)
      if (ref.current) ref.current.textContent = 'Thinking...';
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const setDOM = (s: string) => { if (ref.current) ref.current.textContent = s; };

    const cycle = () => {
      if (cancelled) return;
      const text = PLACEHOLDER_TEXTS[idxRef.current % PLACEHOLDER_TEXTS.length];
      let i = 0;
      // Type phase
      interval = setInterval(() => {
        if (cancelled) { if (interval) clearInterval(interval); return; }
        i++;
        setDOM(text.slice(0, i));
        if (i >= text.length) {
          if (interval) clearInterval(interval);
          // Pause, then erase
          timer = setTimeout(() => {
            if (cancelled) return;
            let len = text.length;
            interval = setInterval(() => {
              if (cancelled) { if (interval) clearInterval(interval); return; }
              len--;
              setDOM(text.slice(0, len));
              if (len <= 0) {
                if (interval) clearInterval(interval);
                idxRef.current++;
                timer = setTimeout(cycle, TIMING_TOKENS.pauseShort);
              }
            }, PLACEHOLDER_ERASE_SPEED);
          }, PLACEHOLDER_PAUSE_MS);
        }
      }, PLACEHOLDER_TYPE_SPEED);
    };

    // Start after a short delay
    timer = setTimeout(cycle, TIMING_TOKENS.initialDelay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

  return ref;
}

const TypingEllipsis = memo(function TypingEllipsis() {
  return (
    <span className="chat-dots" aria-label="Typing">
      {[0, 1, 2].map(i => <span key={i} style={{ '--i': i } as CSSVars} />)}
    </span>
  );
});

// Eases a note's height while its text grows, instead of jumping a full line at each wrap.
// Writes the height straight to the DOM so streaming text does not cause extra React renders.
function useSmoothHeight(enabled: boolean) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!enabled || !outer || !inner || typeof ResizeObserver === 'undefined') return;

    const syncHeight = () => {
      outer.style.height = `${inner.offsetHeight}px`;
    };
    syncHeight();
    outer.style.overflow = 'hidden';
    const observer = new ResizeObserver(syncHeight);
    observer.observe(inner);

    return () => {
      observer.disconnect();
      outer.style.height = '';
      outer.style.overflow = '';
    };
  }, [enabled]);

  return { outerRef, innerRef };
}

/** How close to the bottom (px) still counts as reading the newest note. */
const STICK_SLACK_PX = 80;
/** Smaller layout changes, such as a line easing open while a reply is written, are followed without a glide. */
const GLIDE_MIN_PX = 24;
const GLIDE: KeyframeAnimationOptions = {
  duration: MOTION.durMs.enter,
  easing: `cubic-bezier(${MOTION.ease.paper.join(', ')})`,
  composite: 'add',
};

/**
 * The thread's only scroller. While the reader is at the bottom it pins the newest note from a ResizeObserver
 * callback, which runs after layout and before paint, so growth and scroll land in the same frame. A larger jump
 * (a new note, the chips) is pinned too, then glided with an additive translate on the thread: the compositor
 * animates it, and later pins cannot cut it short the way they cut off a smooth scroll.
 */
function useStickToBottom(scrollRef: RefObject<HTMLDivElement | null>, threadRef: RefObject<HTMLDivElement | null>) {
  const stuckRef = useRef(true);
  const glideRef = useRef(false);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const thread = threadRef.current;
    if (!scroller || !thread || typeof ResizeObserver === 'undefined') return;

    let height = thread.offsetHeight;
    let top = scroller.scrollTop;
    const bottomFor = (threadHeight: number) => thread.offsetTop + threadHeight - scroller.clientHeight;

    const onScroll = () => {
      const next = scroller.scrollTop;
      // Against the height last handled, so growth the observer has not seen yet cannot unstick the reader. Any move
      // up lets go at once, even while a reply keeps growing; coming back near the bottom takes hold again.
      const distance = bottomFor(height) - next;
      stuckRef.current = next < top ? distance < 2 : distance < STICK_SLACK_PX;
      top = next;
    };
    const observer = new ResizeObserver(() => {
      height = thread.offsetHeight;
      if (stuckRef.current) {
        scroller.scrollTop = bottomFor(height);
        const shift = scroller.scrollTop - top;
        const glide = glideRef.current
          && Math.abs(shift) >= GLIDE_MIN_PX
          && Math.abs(shift) < scroller.clientHeight
          && !document.documentElement.hasAttribute('data-reduced-motion');
        if (glide) thread.animate({ translate: [`0 ${shift}px`, '0 0'] }, GLIDE);
      }
      top = scroller.scrollTop;
    });

    // Border box: the room kept for the composer is padding, and a taller composer must pin as well.
    observer.observe(thread, { box: 'border-box' });
    observer.observe(scroller);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef, threadRef]);

  // Sending always brings the new note into view, gliding from then on.
  return useCallback(() => {
    stuckRef.current = true;
    glideRef.current = true;
  }, []);
}

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

function getChipStyle(index: number): CSSVars {
  return { '--i': index, '--disco-motion-delay': `${index * 110}ms` };
}

function pickFollowupAction(
  actions: readonly string[],
  options: Parameters<typeof getPromotedFollowupActions>[1],
): string[] {
  const candidates = getPromotedFollowupActions(actions, options);
  if (candidates.length === 0) return [];
  if (candidates[0] === DISCO_ACTION_LABEL || candidates[0] === DISCO_EXIT_ACTION_LABEL) return [candidates[0]];
  return pickRandom(candidates, 1);
}

function filterUnavailableSuggestions(suggestions: readonly string[], discoActive: boolean): string[] {
  const unavailable = discoActive ? DISCO_ACTION_LABEL : DISCO_EXIT_ACTION_LABEL;
  return suggestions.filter(suggestion => suggestion !== unavailable);
}

const INPUT_NOTE_DISCO_STYLE: CSSVars = { '--disco-motion-delay': '220ms' };
const INPUT_TOOLBAR_DISCO_STYLE: CSSVars = { '--disco-motion-delay': '120ms' };
const SHELL_DISCO_STYLE: CSSVars = { '--disco-motion-delay': '260ms' };
const HEAD_DISCO_STYLE: CSSVars = { '--disco-motion-delay': '80ms' };
const TITLE_DISCO_STYLE: CSSVars = { '--disco-motion-delay': '160ms' };
const SUB_DISCO_STYLE: CSSVars = { '--disco-motion-delay': '260ms' };

const CHAT_SWAY_PERIOD_MS = 900;
const CARD_HUE_PERIOD_MS = 6000;

function getStableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function mixHash(hash: number, salt: number): number {
  let mixed = (hash ^ salt) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function getNegativeDiscoDelay(hash: number, periodMs: number): string {
  const offsetMs = (hash % (periodMs - 1)) + 1;
  return `-${offsetMs}ms`;
}

/** Tilt, tape angle and disco offsets, all stable per message so a note never shifts between renders. */
function getNoteStyle(messageId: string, isUser: boolean): CSSVars {
  const hash = getStableHash(messageId);
  const normalized = (hash % 1000) / 1000;
  const rotation = NOTE_ROTATION.minDeg + normalized * NOTE_ROTATION.rangeDeg;

  return {
    '--tilt': `${isUser ? rotation : -rotation}deg`,
    '--tape-tilt': `${(mixHash(hash, 0x27d4eb2f) % 70) / 10 - 3.5}deg`,
    '--disco-motion-delay': getNegativeDiscoDelay(mixHash(hash, 0x9e3779b1), CHAT_SWAY_PERIOD_MS),
    '--disco-card-delay': getNegativeDiscoDelay(mixHash(hash, 0x85ebca6b), CARD_HUE_PERIOD_MS),
  };
}

const SuggestionStrip = memo(function SuggestionStrip({ text, isAction, onSelect, index = 0, skipEntrance }: { text: string; isAction?: boolean; onSelect: (text: string) => void; index?: number; skipEntrance?: boolean }) {
  const handleClick = useCallback(() => onSelect(text), [onSelect, text]);
  const isDisco = Boolean(isAction && (text === DISCO_ACTION_LABEL || text === DISCO_EXIT_ACTION_LABEL));
  const kind = isDisco ? 'disco' : isAction ? 'action' : 'suggestion';
  return (
    <button
      type="button"
      onClick={handleClick}
      data-kind={kind}
      data-enter={skipEntrance ? undefined : ''}
      data-disco-motion={isDisco ? 'wiggle' : 'bob'}
      className={cn('chat-chip focus-ring', kind !== 'disco' && 'paper-texture')}
      style={getChipStyle(index)}
    >
      <span className="chat-chip-kind">
        {isDisco ? <span aria-hidden="true">🪩</span> : isAction ? <Zap size={10} aria-hidden="true" /> : null}
        {kind}
      </span>
      {text}
    </button>
  );
});

// Shown once the visitor has escaped the matrix puzzle; goes straight to /matrix-notes with no API call.
const MatrixEscapeChip = memo(function MatrixEscapeChip({ onSelect, skipEntrance }: { onSelect: () => void; skipEntrance?: boolean }) {
  return (
    <button
      onClick={onSelect}
      type="button"
      aria-label="Enter the matrix — open the matrix-notes wall"
      data-kind="matrix"
      data-enter={skipEntrance ? undefined : ''}
      data-disco-motion="wiggle"
      className="chat-chip focus-ring"
      data-clickable
    >
      <span className="chat-chip-kind">
        <span aria-hidden="true">&gt;_</span>
        matrix
      </span>
      <span className="tracking-wide">Enter the Matrix →</span>
    </button>
  );
});

// ─── Matrix puzzle reply rendering ───
/**
 * Choose between plain text, MatrixDeniedNote, or MatrixKeyRevealNote
 * based on the message's `matrixInterceptKind` AND a content-based
 * fallback for reloaded (localStorage-restored) messages that may not
 * carry the flag because we don't persist it.
 */
function MatrixAwareAssistantText({
  message,
  displayedText,
}: {
  message: ChatMessage;
  displayedText: string;
}): React.ReactElement {
  const text = message.isOld ? message.content : displayedText;

  // Live flag takes precedence.
  if (message.matrixInterceptKind === 'denied') {
    return <MatrixDeniedNote content={text} />;
  }
  if (message.matrixInterceptKind === 'reveal') {
    const key = extractRevealedKey(message.content);
    if (key) return <MatrixKeyRevealNote password={key} />;
    return <span>{text}</span>;
  }

  // Reload-recovery path: restored messages may have lost the flag but still
  // carry the distinctive content. Only try to reconstruct once typewriting
  // has settled (displayedText === message.content) OR it's an old message.
  if (message.isOld || displayedText === message.content) {
    if (message.content === 'Only root should know that.') {
      return <MatrixDeniedNote content={message.content} />;
    }
    const key = extractRevealedKey(message.content);
    if (key && /^hello\s+dhruv/i.test(message.content)) {
      return <MatrixKeyRevealNote password={key} />;
    }
  }

  return <span>{text}</span>;
}

function restoreComposerFocusIfAppropriate(composer: HTMLDivElement | null): void {
  const activeElement = document.activeElement;
  const textarea = composer?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Chat message"]');
  const sendButton = composer?.querySelector<HTMLButtonElement>('button[aria-label="Send message"]');
  if (!textarea || (activeElement !== document.body && activeElement !== textarea && activeElement !== sendButton)) return;
  textarea.focus();
}

function canSpeakAssistantMessage(message: ChatMessage): boolean {
  const restoredMatrixReveal = extractRevealedKey(message.content) && /^hello\s+dhruv/i.test(message.content);

  return message.role === 'assistant' &&
    message.id !== 'welcome' &&
    !message.isFiller &&
    !message.oracleEmitted &&
    !message.matrixInterceptKind &&
    message.content !== 'Only root should know that.' &&
    !restoredMatrixReveal &&
    message.content.trim().length > 0;
}

function getSpeakButtonCopy(status: TtsPlaybackStatus, isActive: boolean): { ariaLabel: string; title: string } {
  if (!isActive) {
    return { ariaLabel: 'Play assistant response', title: 'Play response' };
  }

  if (status === 'loading') return { ariaLabel: 'Cancel spoken response', title: 'Cancel voice' };
  if (status === 'playing') return { ariaLabel: 'Pause assistant response', title: 'Pause response' };
  if (status === 'paused') return { ariaLabel: 'Resume assistant response', title: 'Resume response' };
  if (status === 'error') return { ariaLabel: 'Retry assistant response voice', title: 'Try voice again' };

  return { ariaLabel: 'Play assistant response', title: 'Play response' };
}

const SpeakResponseButton = memo(function SpeakResponseButton({
  isActive,
  onClick,
  status,
}: {
  isActive: boolean;
  onClick: () => void;
  status: TtsPlaybackStatus;
}) {
  const busy = isActive && status === 'loading';
  const pressed = isActive && status === 'playing';
  const copy = getSpeakButtonCopy(status, isActive);

  const icon = (() => {
    if (busy) return <Loader2 size={13} className="animate-spin" aria-hidden="true" />;
    if (isActive && status === 'playing') return <Pause size={13} aria-hidden="true" />;
    if (isActive && status === 'paused') return <Play size={13} aria-hidden="true" />;
    return <Volume2 size={13} aria-hidden="true" />;
  })();

  return (
    <Tooltip label={copy.title}>
      <button
        type="button"
        aria-busy={busy || undefined}
        aria-label={copy.ariaLabel}
        aria-pressed={pressed}
        onClick={onClick}
        title={copy.title}
        data-state={isActive && status === 'error' ? 'error' : undefined}
        className="chat-tts-btn focus-ring"
      >
        {icon}
      </button>
    </Tooltip>
  );
});

const SpeakControlsTray = memo(function SpeakControlsTray({
  isLoading,
  onCycleSpeed,
  onRestart,
  onSpeak,
  playbackSpeed,
  speakIsActive,
  status,
}: {
  isLoading: boolean;
  onCycleSpeed: () => void;
  onRestart: () => void;
  onSpeak: () => void;
  playbackSpeed: TtsPlaybackSpeed;
  speakIsActive: boolean;
  status: TtsPlaybackStatus;
}) {
  return (
    <div role="group" aria-label="Spoken response controls" className="chat-tts">
      <SpeakResponseButton isActive={speakIsActive} status={status} onClick={onSpeak} />
      <Tooltip label={`Voice speed ${playbackSpeed}x`}>
        <button
          type="button"
          aria-label={`Voice speed ${playbackSpeed}x. Change speed`}
          onClick={onCycleSpeed}
          className="chat-tts-btn focus-ring"
        >
          {playbackSpeed}x
        </button>
      </Tooltip>
      <Tooltip label="Restart response">
        <button
          type="button"
          aria-label="Restart spoken response"
          onClick={onRestart}
          disabled={isLoading}
          className="chat-tts-btn focus-ring"
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
});

// ─── Single Sticky Note ───
const StickyNote = memo(function StickyNote({
  message,
  isLoading = false,
  isTtsActive = false,
  onSpeak,
  onRetry,
  onTtsRestart,
  onTtsSpeedChange,
  onTypewriterStart,
  onTypewriterDone,
  showTtsControls = false,
  ttsPlaybackSpeed = 1,
  ttsPlaybackError = null,
  ttsStatus = 'idle',
}: {
  message: ChatMessage;
  isLoading?: boolean;
  isTtsActive?: boolean;
  onSpeak?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
  onTtsRestart?: (message: ChatMessage) => void;
  onTtsSpeedChange?: (message: ChatMessage) => void;
  onTypewriterStart?: (message: ChatMessage) => void;
  onTypewriterDone?: (messageId: string) => void;
  showTtsControls?: boolean;
  ttsPlaybackSpeed?: TtsPlaybackSpeed;
  ttsPlaybackError?: string | null;
  ttsStatus?: TtsPlaybackStatus;
}) {
  const isUser = message.role === 'user';
  const from = isUser ? 'user' : 'ai';
  const hasAction = !!(message.navigateTo || message.themeAction || (message.openUrls && message.openUrls.length > 0) || message.feedbackAction || message.projectSlug || message.voiceSessionAction || message.fieldFill || message.preferenceAction || message.guestbookSubmit);
  const noteStyle = useMemo(() => getNoteStyle(message.id, isUser), [message.id, isUser]);
  const isWelcome = message.id === 'welcome';

  // Typewriter effect for AI notes (skip for user msgs and old/restored messages)
  const { displayedText, isFiller: isDisplayingFiller, isTyping } = useTypewriter(
    message.content,
    !!message.isFiller,
    isUser || !!message.isOld,
    TIMING_TOKENS.typeSpeed,
    onTypewriterStart ? () => onTypewriterStart(message) : undefined,
    onTypewriterDone ? () => onTypewriterDone(message.id) : undefined,
    !!message.isStreaming,
  );
  const { outerRef: textHeightRef, innerRef: textRef } = useSmoothHeight(!isUser && (isTyping || !!message.isStreaming));
  const showPencil = !isUser && isLoading;
  const canSpeak = canSpeakAssistantMessage(message) && !isDisplayingFiller && !message.isStreaming;

  return (
    <div
      className="chat-slot"
      data-from={from}
      // Restored notes are already on the board; new ones (and the welcome card) are placed on it.
      data-enter={!message.isOld || isWelcome ? '' : undefined}
      data-old={message.isOld && !isWelcome ? '' : undefined}
      style={noteStyle}
    >
      <div className="chat-note note-material" data-from={from}>
        {isUser ? (
          <span aria-hidden="true" className="chat-mark">Y</span>
        ) : (
          <>
            <TapeStrip className="chat-tape" />
            <div className="chat-note-head">
              <span aria-hidden="true" className="chat-mark">D</span>
              {canSpeak && onSpeak ? (
                showTtsControls && onTtsRestart && onTtsSpeedChange ? (
                  <SpeakControlsTray
                    isLoading={ttsStatus === 'loading'}
                    playbackSpeed={ttsPlaybackSpeed}
                    onCycleSpeed={() => onTtsSpeedChange(message)}
                    onRestart={() => onTtsRestart(message)}
                    onSpeak={() => onSpeak(message)}
                    speakIsActive={isTtsActive}
                    status={ttsStatus}
                  />
                ) : (
                  <SpeakResponseButton
                    isActive={isTtsActive}
                    status={ttsStatus}
                    onClick={() => onSpeak(message)}
                  />
                )
              ) : null}
            </div>
          </>
        )}

        <div ref={textHeightRef} className="chat-note-grow">
          <div
            ref={textRef}
            data-site-chat-user={isUser ? '' : undefined}
            data-filler={!isUser && isDisplayingFiller ? '' : undefined}
            className="chat-note-text"
          >
            {isUser ? (
              message.content
            ) : (
              <MatrixAwareAssistantText message={message} displayedText={displayedText} />
            )}
          </div>
        </div>
        {isUser && message.imagePreviewDataUrl ? (
          <div className="chat-photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- transient request data URL must not use Next image optimization. */}
            <img src={message.imagePreviewDataUrl} alt="" />
            <span className="min-w-0 truncate">
              Image attached{message.imageName ? `: ${message.imageName}` : ''}
            </span>
          </div>
        ) : null}
        {!isUser && isTtsActive && ttsStatus === 'error' && ttsPlaybackError ? (
          <p className="chat-note-error" role="status">
            {ttsPlaybackError}
          </p>
        ) : null}
        {!isUser && onRetry && !isDisplayingFiller && displayedText === message.content ? (
          <button type="button" onClick={() => onRetry(message)} className="chat-retry focus-ring">
            <RotateCcw size={13} aria-hidden="true" />
            Try again
          </button>
        ) : null}

        {/* Fallback links when popup was blocked */}
        {message.openUrls && message.openUrlsFailed ? (
          <div className="chat-links">
            {message.openUrls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="chat-link">
                Open link{message.openUrls!.length > 1 ? ` ${i + 1}` : ''} here ~
              </a>
            ))}
          </div>
        ) : null}

        <div className="chat-note-foot">
          <span className="chat-sign">— {isUser ? 'You' : 'Dhruv'}</span>
          {/* Shown from the moment the note appears until the reply has been generated. */}
          {showPencil ? <TypingEllipsis /> : null}
          {!showPencil && hasAction && !isUser ? (
            <span className="chat-badge">
              <Zap size={10} aria-hidden="true" />
              action
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});

// WelcomeNote removed — welcome message is now a permanent first assistant message in the chat

// ─── Rate Limit Note ───
const RateLimitNote = memo(function RateLimitNote({ seconds }: { seconds: number }) {
  return (
    <div className="chat-alert note-material" data-tone="rate">
      <TapeStrip />
      Whoa, slow down! Even sticky notes need a breather. Try again in {seconds} seconds.
    </div>
  );
});

const ServiceErrorNote = memo(function ServiceErrorNote({ message }: { message: string }) {
  return (
    <div className="chat-alert note-material" data-tone="error">
      <TapeStrip />
      {message}
    </div>
  );
});

// ─── Chat Input Area (isolated to prevent keystroke re-renders of message list) ───
interface ChatInputAreaProps {
  onSend: (text: string, image?: ChatImageAttachment, focusWasInComposer?: boolean) => Promise<boolean>;
  isLoading: boolean;
  hasMessages: boolean;
  onClear: () => void;
  composerRef: React.RefObject<HTMLDivElement | null>;
}

const subscribeToComposerHydration = () => () => { };
const getClientComposerHydrationSnapshot = () => true;
const getServerComposerHydrationSnapshot = () => false;

/**
 * Confirmation modal body — sketchbook-styled disclaimer card with a
 * descriptive paragraph and two action buttons. Production-grade
 * accessibility: focuses the cancel button on mount (safer default than
 * confirm), labelled via `ariaLabelledBy` on the parent <Modal>.
 */
const ConfirmContent = memo(function ConfirmContent({
  titleId,
  title,
  body,
  confirmLabel,
  confirmTone,
  onCancel,
  onConfirm,
}: {
  titleId: string;
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone: 'danger' | 'primary';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Auto-focus the safe option (cancel) so an accidental Enter doesn't
  // commit a destructive action — matches WCAG dialog guidance.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <h2 id={titleId} className="font-hand text-xl font-bold leading-tight text-[var(--c-heading)] md:text-2xl">
        {title}
      </h2>
      <p className="font-hand text-sm leading-relaxed md:text-base">
        {body}
      </p>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
        <button ref={cancelRef} type="button" onClick={onCancel} className="chat-btn focus-ring">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} data-tone={confirmTone} className="chat-btn focus-ring">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
});

const ChatInputArea = memo(function ChatInputArea({ onSend, isLoading, hasMessages, onClear, composerRef }: ChatInputAreaProps) {
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<ChatImageAttachment | null>(null);
  const [attachmentStatus, setAttachmentStatus] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerHistoryRef = useRef(createComposerHistoryState());
  const [historyCaretRequest, setHistoryCaretRequest] = useState(0);
  const historyCaretRequestSequenceRef = useRef(0);
  const pendingHistoryCaretRequestRef = useRef<number | null>(null);
  const imageCompressionAbortRef = useRef<AbortController | null>(null);
  const imageCompressionGenerationRef = useRef(0);
  const placeholderRef = usePlaceholderTypewriter(!isLoading);
  const { pref: voicePref, setPref: setVoicePref } = useVoiceBackendPref();
  const speech = useVoiceInput({ backend: voicePref });
  const baseInputRef = useRef('');
  // Confirmation modal state — lifted into the input area so both the
  // Clear-chat action and the Local Transcription opt-in flow can share
  // the production-grade `Modal` shell (portal, focus trap, scroll lock,
  // Escape dismissal). null = no modal open.
  type ConfirmKind = 'clear' | 'enableLocal' | null;
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const { modelId } = useChatModelPref();
  const modelPrefHydrated = useSyncExternalStore(
    subscribeToComposerHydration,
    getClientComposerHydrationSnapshot,
    getServerComposerHydrationSnapshot,
  );
  const model = getChatModel(modelId);
  const modelDisplayName = getChatModelDisplayName(model);
  const supportsImages = modelPrefHydrated && (model?.supportsImages ?? false);
  const imageMaxPixels = model && 'imageMaxPixels' in model ? model.imageMaxPixels : undefined;

  useEffect(() => {
    const clearAttachmentForModelSwitch = () => {
      imageCompressionGenerationRef.current += 1;
      imageCompressionAbortRef.current?.abort('model-switch');
      imageCompressionAbortRef.current = null;
      setAttachment(null);
      setAttachmentStatus(null);
      setIsCompressingImage(false);
    };
    const clearAttachmentForCrossTabModelSwitch = (event: StorageEvent) => {
      if (event.key === CHAT_MODEL_PREF_STORAGE_KEY) clearAttachmentForModelSwitch();
    };
    window.addEventListener(CHAT_MODEL_SWITCH_CLEAR_EVENT, clearAttachmentForModelSwitch);
    window.addEventListener('storage', clearAttachmentForCrossTabModelSwitch);
    return () => {
      imageCompressionGenerationRef.current += 1;
      imageCompressionAbortRef.current?.abort('unmount');
      imageCompressionAbortRef.current = null;
      window.removeEventListener(CHAT_MODEL_SWITCH_CLEAR_EVENT, clearAttachmentForModelSwitch);
      window.removeEventListener('storage', clearAttachmentForCrossTabModelSwitch);
    };
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || isCompressingImage) return;
    const submittedMessage = input.trim();
    if (speech.isListening) speech.stop();
    const focusWasInComposer = composerRef.current?.contains(document.activeElement) ?? false;
    void onSend(submittedMessage, attachment ?? undefined, focusWasInComposer).then((accepted) => {
      if (accepted) {
        composerHistoryRef.current = appendComposerHistory(composerHistoryRef.current, submittedMessage);
      }
    });
    setInput('');
    setAttachment(null);
    setAttachmentStatus(null);
    speech.reset();
    baseInputRef.current = '';
  }, [attachment, composerRef, input, isCompressingImage, isLoading, onSend, speech]);

  const handleImageSelection = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    imageCompressionAbortRef.current?.abort('superseded');
    const controller = new AbortController();
    imageCompressionAbortRef.current = controller;
    const compressionGeneration = imageCompressionGenerationRef.current + 1;
    imageCompressionGenerationRef.current = compressionGeneration;
    setIsCompressingImage(true);
    setAttachmentStatus('Preparing image...');
    try {
      const nextAttachment = await compressChatImage(file, controller.signal, { maxPixels: imageMaxPixels });
      if (imageCompressionGenerationRef.current !== compressionGeneration || !supportsImages) return;
      setAttachment(nextAttachment);
      setAttachmentStatus(`Image ready, ${Math.ceil(nextAttachment.bytes / 1024)} KB.`);
    } catch (error) {
      if (imageCompressionGenerationRef.current !== compressionGeneration || controller.signal.aborted) return;
      setAttachment(null);
      setAttachmentStatus(error instanceof Error ? error.message : 'That image could not be prepared.');
    } finally {
      if (imageCompressionGenerationRef.current === compressionGeneration) {
        setIsCompressingImage(false);
      }
      if (imageCompressionAbortRef.current === controller) {
        imageCompressionAbortRef.current = null;
      }
    }
  }, [imageMaxPixels, supportsImages]);

  // Live-merge speech transcript into the textarea. While the mic is
  // actively listening we DON'T touch `setInput` — every interim token
  // would otherwise force the auto-grow textarea to re-measure and the
  // box would jitter taller as words come in. Instead we keep the latest
  // spoken string in a ref and the `ListeningOverlay` shows the live
  // interim text. The accumulated buffer is committed to `input` once
  // the user releases the mic (isListening flips false) so the resize
  // happens exactly once.
  const pendingTranscriptRef = useRef('');
  useEffect(() => {
    const spoken = (speech.transcript + (speech.interimTranscript ? ' ' + speech.interimTranscript : '')).trim();
    if (!spoken) {
      if (!speech.isListening) pendingTranscriptRef.current = '';
      return;
    }
    const merged = (baseInputRef.current
      ? baseInputRef.current.replace(/\s+$/, '') + ' ' + spoken
      : spoken
    ).slice(0, CHAT_CONFIG.maxUserMessageLength);
    if (speech.isListening) {
      // Buffer only — do not trigger a re-render / resize per token.
      pendingTranscriptRef.current = merged;
      return;
    }
    // Listening just ended (or transcribing finalised) — commit once.
    if (pendingTranscriptRef.current || merged) {
      composerHistoryRef.current = resetComposerHistoryNavigation(composerHistoryRef.current);
      setInput(pendingTranscriptRef.current || merged);
      pendingTranscriptRef.current = '';
    }
  }, [speech.transcript, speech.interimTranscript, speech.isListening]);

  const handleMicToggle = useCallback(() => {
    if (speech.isListening) {
      speech.stop();
      return;
    }
    if (speech.requiresLocalTranscription) {
      setConfirmKind('enableLocal');
      return;
    }
    baseInputRef.current = input;
    speech.reset();
    speech.start();
  }, [input, speech]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    composerHistoryRef.current = resetComposerHistoryNavigation(composerHistoryRef.current);
    setInput(event.target.value.slice(0, CHAT_CONFIG.maxUserMessageLength));
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const textarea = event.currentTarget;
      const direction = event.key === 'ArrowUp' ? 'up' : 'down';
      const isEligibleForHistory = canNavigateComposerHistory(
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd,
        direction,
      );

      if (isEligibleForHistory) {
        const result = navigateComposerHistory(
          composerHistoryRef.current,
          input,
          direction,
        );
        if (result.didNavigate) {
          event.preventDefault();
          composerHistoryRef.current = result.state;
          const nextCaretRequest = ++historyCaretRequestSequenceRef.current;
          pendingHistoryCaretRequestRef.current = nextCaretRequest;
          setHistoryCaretRequest(nextCaretRequest);
          setInput(result.value);
          return;
        }
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend, input]);

  // Auto-grow the textarea up to its CSS max-height. We measure the
  // intrinsic scrollHeight after every value change in a layout effect so
  // the resize is committed before the browser paints — no flicker, no
  // jumpiness. Past max-height the textarea's own `overflow-y: auto`
  // kicks in and the user scrolls inside the input.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Reset to 'auto' first so shrinking works as text is deleted.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  useLayoutEffect(() => {
    if (pendingHistoryCaretRequestRef.current !== historyCaretRequest) return;
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    pendingHistoryCaretRequestRef.current = null;
  }, [historyCaretRequest]);

  const showModel = modelPrefHydrated && model;

  return (
    <div ref={composerRef} data-chat-composer className="chat-composer">
      <div className="chat-dock">
        {showModel || supportsImages || hasMessages ? (
          <div
            data-disco-motion="shimmy"
            data-disco-chat-input-bar
            className="chat-tools"
            style={INPUT_TOOLBAR_DISCO_STYLE}
          >
            {showModel ? (
              <Link
                href="/settings?focus=ai-model"
                prefetch={false}
                data-chat-model-settings-link
                className="chat-model focus-ring"
                title={`${modelDisplayName} · ${supportsImages ? 'Vision' : 'Text'}`}
                aria-label={`Current AI model: ${modelDisplayName}. Change in Settings`}
              >
                <span>{modelDisplayName} · {supportsImages ? 'Vision' : 'Text'}</span>
              </Link>
            ) : null}
            {supportsImages ? (
              <Tooltip label="Attach image">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isCompressingImage}
                  className="chat-tool focus-ring"
                  title="Attach image"
                  aria-label="Attach image"
                >
                  {isCompressingImage ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={15} aria-hidden="true" />}
                </button>
              </Tooltip>
            ) : null}
            {hasMessages ? (
              <Tooltip label="Clear chat history">
                <button
                  type="button"
                  onClick={() => setConfirmKind('clear')}
                  data-tone="danger"
                  className="chat-tool focus-ring"
                  title="Clear chat history"
                  aria-label="Clear chat history"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
        {speech.requiresLocalTranscription || speech.error ? (
          <div className="chat-status" aria-live="polite">
            {speech.requiresLocalTranscription
              ? 'This browser needs Local Transcription for the mic.'
              : speech.error}
          </div>
        ) : null}
        {supportsImages ? (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose image to attach"
            className="sr-only"
            onChange={handleImageSelection}
          />
        ) : null}
        {attachment ? (
          <div className="chat-attachment">
            {/* eslint-disable-next-line @next/next/no-img-element -- transient request data URL must not use Next image optimization. */}
            <img src={attachment.dataUrl} alt="" />
            <span>{attachment.filename} ({Math.ceil(attachment.bytes / 1024)} KB)</span>
            <Tooltip label="Remove image">
              <button
                type="button"
                onClick={() => { setAttachment(null); setAttachmentStatus(null); }}
                data-tone="danger"
                className="chat-tool focus-ring"
                aria-label="Remove attached image"
                title="Remove image"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        ) : null}
        {attachmentStatus ? (
          <p className="chat-status" data-align="start" aria-live="polite">
            {attachmentStatus}
          </p>
        ) : null}

        {/* The pad keeps dictation, the draft and the send plane together. */}
        <div
          data-disco-motion="bob"
          data-disco-chat-input
          className="chat-pad note-material"
          style={INPUT_NOTE_DISCO_STYLE}
        >
          <div className="chat-pad-row">
            {speech.isSupported ? (
              <MicButton
                isListening={speech.isListening}
                isLoading={speech.isLoading}
                isTranscribing={speech.isTranscribing}
                isRequestingPermission={speech.isRequestingPermission}
                loadProgress={speech.loadProgress}
                onClick={handleMicToggle}
                disabled={isLoading}
                size={15}
                title={speech.requiresLocalTranscription ? 'Enable Local Transcription to dictate on this browser' : undefined}
              />
            ) : null}
            <div className="flex min-w-0 flex-1 items-end gap-1" onClick={() => inputRef.current?.focus()}>
              <div className="chat-field">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isLoading || isCompressingImage || speech.isListening || speech.isTranscribing}
                  aria-label="Chat message"
                  data-voice-field="chat-composer"
                  // Grows with the draft (layout effect above) up to its CSS max-height, then scrolls.
                  className={cn('chat-input', (speech.isListening || speech.isTranscribing) && 'invisible')}
                />
                {/* Typewriter placeholder at the textarea's own size, so typing never reflows the pad. */}
                {!input && !speech.isListening && !speech.isTranscribing && (
                  <span ref={placeholderRef} aria-hidden className="chat-placeholder" />
                )}
                <ListeningOverlay
                  isListening={speech.isListening}
                  isTranscribing={speech.isTranscribing}
                  backend={speech.backend}
                  interim={speech.interimTranscript}
                  analyser={speech.analyser}
                />
              </div>

              {(input.length > 0 || speech.isListening || speech.isTranscribing) && (
                <ClearButton
                  onClick={() => {
                    if (speech.isListening) speech.stop();
                    speech.reset();
                    baseInputRef.current = '';
                    pendingTranscriptRef.current = '';
                    composerHistoryRef.current = resetComposerHistoryNavigation(composerHistoryRef.current);
                    setInput('');
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  size={14}
                />
              )}

              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isLoading || isCompressingImage}
                className="chat-send focus-ring"
                title="Send note"
                aria-label="Send message"
              >
                <Send aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Confirmation modal (Clear chat / Enable Local Transcription) ─── */}
      <Modal
        isOpen={confirmKind !== null}
        onClose={() => setConfirmKind(null)}
        ariaLabelledBy="chat-confirm-title"
        className="chat-confirm sheet-material"
      >
        {confirmKind === 'clear' && (
          <ConfirmContent
            titleId="chat-confirm-title"
            title="Clear this conversation?"
            body="This erases the entire chat from this device — every note in the thread above will be removed and cannot be recovered. Your suggestions will reset to the starter set."
            confirmLabel="Clear chat"
            confirmTone="danger"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => {
              setConfirmKind(null);
              onClear();
            }}
          />
        )}
        {confirmKind === 'enableLocal' && (
          <ConfirmContent
            titleId="chat-confirm-title"
            title="Enable Local Transcription?"
            body="Switches voice input from the browser's online speech API to an on-device Whisper model. First use downloads about 60-170 MB, depending on your browser, and stores it in the browser cache when available. Recorded audio stays on this device. The browser may download the files again if it clears the cache."
            confirmLabel="Download & enable"
            confirmTone="primary"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => {
              setConfirmKind(null);
              setVoicePref('whisper');
            }}
          />
        )}
      </Modal>
    </div>
  );
});

// ═════════════════════════════════════════════════
// ─── Main StickyNoteChat Component ───
// ═════════════════════════════════════════════════
export default function StickyNoteChat() {
  const { messages, isLoading, error, sendMessage, retryMessage, sendHardcoded, clearMessages, markOpenUrlsFailed, rateLimitRemaining, fetchSuggestions, suggestions: llmSuggestions, isSuggestionsLoading } = useStickyChat();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { clear, closePanel, error: errorHaptic, externalLink, navigate, openPanel, selection, submit, success, warning } = useAppHaptics();
  const { pref: voiceOutput } = useVoiceOutputPref();
  const { enabled: speakByDefault } = useSpeakByDefaultPref();
  const {
    activeMessageId: ttsActiveMessageId,
    error: ttsPlaybackError,
    playbackSpeed: ttsPlaybackSpeed,
    restart: restartTtsPlayback,
    setPlaybackSpeed: setTtsPlaybackSpeed,
    status: ttsPlaybackStatus,
    stop: stopTtsPlayback,
    toggle: toggleTtsPlayback,
  } = useTtsPlayback({ preferClientSpeech: voiceOutput === 'device' });
  // Suggestions: 2 hardcoded (immediate) + 2 contextual (LLM or fallback)
  // Start empty to prevent flash on page return — hydration effect fills them
  const [baseSuggestions, setBaseSuggestions] = useState<string[]>([]);
  const [extraSuggestions, setExtraSuggestions] = useState<string[]>([]);
  const [readyForAssistantId, setReadyForAssistantId] = useState<string | null>('welcome');
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<ProjectSlug | null>(null);
  const [projectModalLoaded, setProjectModalLoaded] = useState(false);
  const [ttsControlsMessageId, setTtsControlsMessageId] = useState<string | null>(null);

  const followupActions = useMemo(() => getFollowupActions(), []);
  const matrixEscaped = useMatrixEscaped();
  const discoActive = useDiscoActive();
  const shellRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const followNewNote = useStickToBottom(messagesScrollRef, threadRef);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handledActionsRef = useRef<Set<string>>(new Set());
  const pendingActionsRef = useRef<Map<string, ChatMessage>>(new Map());
  const hasFetchedSuggestionsRef = useRef<string | null>(null);
  const committedExtrasForIdRef = useRef<string | null>(null);
  const [hasHadInteraction, setHasHadInteraction] = useState(false);
  const hasInitializedSuggestionsRef = useRef(false);
  const completedAssistantHapticRef = useRef<string | null>(null);
  const announcedAssistantReplyRef = useRef<string | null>(null);
  const autoSpokenAssistantRef = useRef<string | null>(null);
  const composerFocusRequestSequenceRef = useRef(0);
  const restoreComposerFocusAfterRemoteSendRef = useRef<number | null>(null);
  const remoteSendLoadingStartedForFocusRef = useRef<number | null>(null);
  const previousLoadingRef = useRef(isLoading);
  const lastErrorRef = useRef<string | null>(null);
  const [assistantReplyAnnouncement, setAssistantReplyAnnouncement] = useState<{ id: string; text: string } | null>(null);

  // The thread reserves room under its last note for the composer. Written as a CSS variable so a growing draft
  // does not re-render the conversation.
  useLayoutEffect(() => {
    const composer = composerRef.current;
    const shell = shellRef.current;
    if (!composer || !shell || typeof ResizeObserver === 'undefined') return;

    const measureComposer = () => shell.style.setProperty('--chat-composer-height', `${composer.offsetHeight}px`);
    measureComposer();
    const observer = new ResizeObserver(measureComposer);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    for (const message of messages) {
      if (message.isOld || message.role !== 'assistant') continue;
      if (handledActionsRef.current.has(message.id)) continue;

      const hasAction = message.navigateTo || message.themeAction || (message.openUrls && message.openUrls.length > 0) || message.feedbackAction || message.projectSlug || message.voiceSessionAction || message.fieldFill || message.preferenceAction || message.guestbookSubmit;
      if (!hasAction) continue;

      handledActionsRef.current.add(message.id);
      pendingActionsRef.current.set(message.id, message);
    }
  }, [messages]);

  useEffect(() => () => {
    if (navigationTimeoutRef.current !== null) {
      clearTimeout(navigationTimeoutRef.current);
    }
  }, []);

  // One-time suggestion initialization after hydration — prevents flash on page return
  useEffect(() => {
    if (hasInitializedSuggestionsRef.current || messages.length === 0) return;
    const timer = setTimeout(() => {
      if (hasInitializedSuggestionsRef.current) return;
      hasInitializedSuggestionsRef.current = true;

      const lastAssistant = messages.findLast(m => m.role === 'assistant' && m.id !== 'welcome');
      if (lastAssistant?.isOld) {
        // Returning to chat with history — use cached LLM suggestions if available
        hasFetchedSuggestionsRef.current = lastAssistant.id;
        committedExtrasForIdRef.current = lastAssistant.id;
        const base = [
          ...pickRandom(FOLLOWUP_CONVERSATIONAL, 1),
          ...pickFollowupAction(followupActions, { discoActive }),
        ];
        setBaseSuggestions(base);
        const availableLlmSuggestions = filterUnavailableSuggestions(llmSuggestions, discoActive);
        if (availableLlmSuggestions.length > 0) {
          setExtraSuggestions(availableLlmSuggestions.slice(0, 2));
        } else {
          setExtraSuggestions([
            ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => !base.includes(s)), 1),
            ...pickFollowupAction(followupActions, { discoActive, exclude: base }),
          ]);
        }
      } else {
        // Fresh visit — show initial suggestions
        const initialSuggestions = getInitialChatSuggestions(discoActive);
        setBaseSuggestions(initialSuggestions.base);
        setExtraSuggestions(initialSuggestions.extra);
      }
      const latestAssistant = messages.findLast(m => m.role === 'assistant');
      setReadyForAssistantId(latestAssistant?.id ?? 'welcome');
    }, 0);
    return () => clearTimeout(timer);
  }, [messages, llmSuggestions, followupActions, discoActive]);

  // After each NEW assistant response: pick 2 hardcoded + fetch 2 contextual.
  // Skip oracle-emitted (matrix puzzle) messages — they arrive in bursts
  // (filler preamble + reveal + interrogation questions), and rebuilding
  // the suggestion strip on each one would flicker badly and waste LLM
  // quota. Regular LLM-driven suggestions refresh once the oracle flow
  // ends and the user sends a normal chat turn.
  useEffect(() => {
    const lastAssistant = messages.findLast(m => m.role === 'assistant' && m.id !== 'welcome');
    if (!lastAssistant || isLoading || lastAssistant.isOld || lastAssistant.oracleEmitted) return;
    if (hasFetchedSuggestionsRef.current === lastAssistant.id) return;
    const timer = setTimeout(() => {
      if (hasFetchedSuggestionsRef.current === lastAssistant.id) return;
      hasFetchedSuggestionsRef.current = lastAssistant.id;
      committedExtrasForIdRef.current = null;

      const lastUserMsg = messages.findLast(m => m.role === 'user');
      const lastUserText = lastUserMsg?.content?.toLowerCase() || '';
      const hardcoded = [
        ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => s.toLowerCase() !== lastUserText), 1),
        ...pickFollowupAction(followupActions, { discoActive, lastUserText }),
      ];
      setBaseSuggestions(hardcoded);
      setExtraSuggestions([]);
      if (lastAssistant.clientOnly) {
        committedExtrasForIdRef.current = lastAssistant.id;
        setExtraSuggestions([
          ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => !hardcoded.includes(s)), 1),
          ...pickFollowupAction(followupActions, { discoActive, exclude: hardcoded }),
        ]);
        return;
      }
      fetchSuggestions();
    }, 0);
    return () => clearTimeout(timer);
  }, [messages, isLoading, fetchSuggestions, followupActions, discoActive]);

  // When LLM contextual suggestions arrive (or fail), fill the extra slots.
  // Race guard (P2-4 / P2-5): commit at most ONCE per assistant id, gated on
  // `hasFetchedSuggestionsRef` (set by the trigger effect to lastAssistant.id).
  // Without this, a stale `llmSuggestions` carried over between turns could
  // overwrite the freshly-cleared `extraSuggestions` for the new turn.
  useEffect(() => {
    const targetId = hasFetchedSuggestionsRef.current;
    if (isSuggestionsLoading || !targetId) return;
    if (committedExtrasForIdRef.current === targetId) return;
    const timer = setTimeout(() => {
      if (committedExtrasForIdRef.current === targetId) return;
      committedExtrasForIdRef.current = targetId;
      const availableLlmSuggestions = filterUnavailableSuggestions(llmSuggestions, discoActive);
      if (availableLlmSuggestions.length > 0) {
        setExtraSuggestions(availableLlmSuggestions.slice(0, 2));
      } else {
        setExtraSuggestions([
          ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => !baseSuggestions.includes(s)), 1),
          ...pickFollowupAction(followupActions, { discoActive, exclude: baseSuggestions }),
        ]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isSuggestionsLoading, llmSuggestions, baseSuggestions, followupActions, discoActive]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (discoActive) {
        setBaseSuggestions(current => {
          const available = current.filter(suggestion => suggestion !== DISCO_ACTION_LABEL && suggestion !== DISCO_EXIT_ACTION_LABEL);
          return [DISCO_EXIT_ACTION_LABEL, ...available].slice(0, Math.max(1, current.length || 2));
        });
        setExtraSuggestions(current => current.filter(suggestion => suggestion !== DISCO_ACTION_LABEL && suggestion !== DISCO_EXIT_ACTION_LABEL));
        return;
      }

      setBaseSuggestions(current => {
        const available = current.filter(suggestion => suggestion !== DISCO_ACTION_LABEL && suggestion !== DISCO_EXIT_ACTION_LABEL);
        if (current.length === 0) return available;
        return [DISCO_ACTION_LABEL, ...available].slice(0, Math.max(1, current.length));
      });
      setExtraSuggestions(current => current.filter(suggestion => suggestion !== DISCO_ACTION_LABEL && suggestion !== DISCO_EXIT_ACTION_LABEL));
    }, 0);
    return () => clearTimeout(timer);
  }, [discoActive]);

  // Gate suggestion visibility: hide during loading, show when typewriter signals completion.
  // Also executes any pending actions (navigation, theme, URLs) once the note is fully typed.
  const executeAction = useCallback((action: ChatMessage) => {
    if (navigationTimeoutRef.current !== null) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    // Chat-driven UI action fires → chat-conductor sticker. We check if ANY
    // real side-effect is about to run (not just the reply text). Idempotent
    // via the store — repeated chat actions won't re-toast.
    if (
      action.themeAction ||
      action.feedbackAction ||
      action.projectSlug ||
      action.voiceSessionAction ||
      action.fieldFill ||
      action.preferenceAction ||
      action.guestbookSubmit ||
      (action.openUrls && action.openUrls.length > 0) ||
      action.navigateTo
    ) {
      unlockSticker('chat-conductor');
    }

    // Theme switching
    if (action.themeAction) {
      selection();
      if (action.themeAction === 'toggle') {
        runThemeToggle({
          discoActive,
          isDark: resolvedTheme === 'dark',
          setTheme,
        });
      } else if (action.themeAction === 'disco') {
        runDiscoMode(true);
      } else if (action.themeAction === 'disco-off') {
        runDiscoMode(false);
      } else {
        runThemeSelection({
          discoActive,
          theme: action.themeAction,
          setTheme,
        });
      }
    }

    // Open feedback modal
    if (action.feedbackAction) {
      openPanel();
      window.dispatchEvent(new CustomEvent('open-feedback'));
    }

    if (action.projectSlug) {
      openPanel();
      setProjectModalLoaded(true);
      setSelectedProjectSlug(action.projectSlug);
      appendUserAction({ kind: 'project.open', slug: action.projectSlug });
    }


    if (action.voiceSessionAction) {
      requestVoiceMode({ source: 'chat', topic: 'chat' });
    }

    if (action.fieldFill || action.preferenceAction || action.guestbookSubmit) {
      void Promise.all([
        import('@/lib/siteToolExecutor'),
        import('@/lib/siteToolValidation'),
      ]).then(([{ executeSiteTool }, { parseSiteToolCall }]) => {
        const call = action.fieldFill
          ? { id: `${action.id}-fill`, name: 'fill_field' as const, args: action.fieldFill }
          : action.preferenceAction
            ? { id: `${action.id}-pref`, name: 'set_preference' as const, args: action.preferenceAction }
            : { id: `${action.id}-guestbook`, name: 'submit_guestbook' as const, args: action.guestbookSubmit! };
        const parsed = parseSiteToolCall(call);
        if (!parsed) return;
        void executeSiteTool(parsed, {
          router,
          setTheme,
          resolvedTheme,
          discoActive,
        });
      });
    }

    // Open URLs in new tabs — handle popup blockers
    if (action.openUrls && action.openUrls.length > 0) {
      externalLink();
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
      navigate();
      const dest = action.navigateTo;
      navigationTimeoutRef.current = setTimeout(() => {
        navigationTimeoutRef.current = null;
        router.push(dest);
      }, NAVIGATION_DELAY_MS);
    }
  }, [discoActive, externalLink, markOpenUrlsFailed, navigate, openPanel, resolvedTheme, router, selection, setTheme]);

  const handleTypewriterStart = useCallback((message: ChatMessage) => {
    if (
      !speakByDefault ||
      !canSpeakAssistantMessage(message) ||
      ttsActiveMessageId === message.id ||
      autoSpokenAssistantRef.current === message.id
    ) {
      return;
    }

    autoSpokenAssistantRef.current = message.id;
    setTtsControlsMessageId(message.id);
    void toggleTtsPlayback(message.id, message.content, {
      preferClientSpeech: voiceOutput === 'device',
    });
  }, [speakByDefault, toggleTtsPlayback, ttsActiveMessageId, voiceOutput]);

  const handleTypewriterDone = useCallback((messageId: string) => {
    setReadyForAssistantId(messageId);

    const completedMessage = messages.find(message => message.id === messageId);
    if (
      completedMessage &&
      messageId !== 'welcome' &&
      !completedMessage.isOld &&
      !completedMessage.isFiller &&
      completedMessage.matrixInterceptKind !== 'denied' &&
      announcedAssistantReplyRef.current !== messageId
    ) {
      announcedAssistantReplyRef.current = messageId;
      setAssistantReplyAnnouncement({
        id: messageId,
        text: `Assistant reply: ${completedMessage.content}`,
      });
    }

    const action = pendingActionsRef.current.get(messageId);
    if (!action) return;

    pendingActionsRef.current.delete(messageId);
    executeAction(action);
  }, [executeAction, messages]);

  // Stable identities let memoized StickyNotes skip re-rendering while replies stream in.
  const typewriterHandlersRef = useRef({ start: handleTypewriterStart, done: handleTypewriterDone });
  useLayoutEffect(() => {
    typewriterHandlersRef.current = { start: handleTypewriterStart, done: handleTypewriterDone };
  }, [handleTypewriterStart, handleTypewriterDone]);
  const notifyNoteTypewriterStart = useCallback((message: ChatMessage) => typewriterHandlersRef.current.start(message), []);
  const notifyNoteTypewriterDone = useCallback((messageId: string) => typewriterHandlersRef.current.done(messageId), []);

  useEffect(() => {
    const lastAssistant = messages.findLast((message) => message.role === 'assistant' && message.id !== 'welcome');
    if (!lastAssistant || lastAssistant.isOld || isLoading) {
      return;
    }

    if (completedAssistantHapticRef.current === lastAssistant.id) {
      return;
    }

    completedAssistantHapticRef.current = lastAssistant.id;

    // Oracle-emitted (matrix puzzle) messages arrive in bursts — filler
    // preamble, reveal, interrogation questions. Firing the success haptic
    // + chat-receive sound on each would feel spammy and drown out the
    // oracle's atmosphere. Skip the feedback cues for those; the regular
    // LLM reply path still announces with haptic + sound as before.
    if (lastAssistant.oracleEmitted) {
      return;
    }

    success();
    // Audible "reply arrived" cue paired with the success haptic. The sound
    // is a gentle descending chirp so it doesn't compete with the upward
    // chat-send cue.
    soundManager.play('chat-receive');
  }, [isLoading, messages, success]);

  useEffect(() => {
    if (!error) {
      lastErrorRef.current = null;
      return;
    }

    if (lastErrorRef.current === error) {
      return;
    }

    lastErrorRef.current = error;
    if (rateLimitRemaining) {
      warning();
      return;
    }

    errorHaptic();
  }, [error, errorHaptic, rateLimitRemaining, warning]);

  const handleSendFromInput = useCallback(async (text: string, image?: ChatImageAttachment, focusWasInComposer = false): Promise<boolean> => {
    setHasHadInteraction(true);
    followNewNote();
    stopTtsPlayback();
    submit();
    soundManager.play('chat-send');
    const focusRequestId = ++composerFocusRequestSequenceRef.current;
    restoreComposerFocusAfterRemoteSendRef.current = focusWasInComposer ? focusRequestId : null;
    remoteSendLoadingStartedForFocusRef.current = null;
    if (!image && sendHardcoded(text, getSuggestionResponse(text))) {
      appendUserAction({ kind: 'chat.sent' });
      restoreComposerFocusAfterRemoteSendRef.current = null;
      if (focusWasInComposer) restoreComposerFocusIfAppropriate(composerRef.current);
      return true;
    }
    const accepted = sendMessage(text, image);
    void accepted.then((wasAccepted) => {
      if (wasAccepted) {
        appendUserAction({ kind: 'chat.sent' });
      }
      if (
        !wasAccepted &&
        restoreComposerFocusAfterRemoteSendRef.current === focusRequestId &&
        remoteSendLoadingStartedForFocusRef.current !== focusRequestId
      ) {
        restoreComposerFocusAfterRemoteSendRef.current = null;
      }
    });
    return accepted;
  }, [followNewNote, sendMessage, sendHardcoded, stopTtsPlayback, submit]);

  useEffect(() => {
    const handler = (raw: Event) => {
      const event = raw as CustomEvent<SendChatMessageEventDetail>;
      const message = event.detail?.message?.trim();
      if (!message) return;
      if (isLoading) {
        attachSiteActionResult(event, {
          ok: false,
          spokenText: 'Chat is busy with the current note.',
          errorCode: 'chat-busy',
        });
        return;
      }
      attachSiteActionResult(event, handleSendFromInput(message).then((accepted) => (
        accepted
          ? {
            ok: true,
            spokenText: 'Queued that note.',
            data: { accepted: true, nextAction: 'Want me to wait for the reply, or ask something else?' },
          }
          : {
            ok: false,
            spokenText: 'Chat is not open right now.',
            errorCode: 'chat-unavailable',
          }
      )));
    };
    const openHandler = (raw: Event) => {
      raw.preventDefault();
    };
    const unregister = registerSiteActionHost('chat');
    window.addEventListener(SEND_CHAT_MESSAGE_EVENT, handler);
    window.addEventListener(OPEN_CHAT_EVENT, openHandler);
    return () => {
      unregister();
      window.removeEventListener(SEND_CHAT_MESSAGE_EVENT, handler);
      window.removeEventListener(OPEN_CHAT_EVENT, openHandler);
    };
  }, [handleSendFromInput, isLoading]);

  useEffect(() => {
    if (isLoading && !previousLoadingRef.current) {
      remoteSendLoadingStartedForFocusRef.current = restoreComposerFocusAfterRemoteSendRef.current;
    }

    const focusRequestId = restoreComposerFocusAfterRemoteSendRef.current;
    const remoteSendCompleted =
      previousLoadingRef.current &&
      !isLoading &&
      focusRequestId !== null &&
      remoteSendLoadingStartedForFocusRef.current === focusRequestId;
    previousLoadingRef.current = isLoading;
    if (!remoteSendCompleted) return;

    restoreComposerFocusAfterRemoteSendRef.current = null;
    remoteSendLoadingStartedForFocusRef.current = null;
    restoreComposerFocusIfAppropriate(composerRef.current);
  }, [isLoading]);

  const handleSuggestion = useCallback((text: string) => {
    setHasHadInteraction(true);
    followNewNote();
    stopTtsPlayback();
    selection();
    soundManager.play('chat-send');
    // Hardcoded suggestions and exact action labels short-circuit all chat
    // APIs so deterministic chips keep working even when staging backends are
    // unavailable or origin/rate-limit checks reject live requests.
    const canned = getSuggestionResponse(text);
    if (sendHardcoded(text, canned)) {
      appendUserAction({ kind: 'chat.sent' });
      return;
    }
    const accepted = sendMessage(text);
    void accepted.then((wasAccepted) => {
      if (wasAccepted) {
        appendUserAction({ kind: 'chat.sent' });
      }
    });
  }, [followNewNote, selection, sendMessage, sendHardcoded, stopTtsPlayback]);

  const handleRetryMessage = useCallback((message: ChatMessage) => {
    stopTtsPlayback();
    selection();
    followNewNote();
    if (retryMessage(message.id)) soundManager.play('chat-send');
  }, [followNewNote, retryMessage, selection, stopTtsPlayback]);

  const handleSpeakMessage = useCallback((message: ChatMessage) => {
    autoSpokenAssistantRef.current = message.id;
    setTtsControlsMessageId(message.id);
    void toggleTtsPlayback(message.id, message.content, { preferClientSpeech: voiceOutput === 'device' });
  }, [toggleTtsPlayback, voiceOutput]);

  const handleTtsRestart = useCallback((message: ChatMessage) => {
    setTtsControlsMessageId(message.id);
    void restartTtsPlayback(message.id, message.content, { preferClientSpeech: voiceOutput === 'device' });
  }, [restartTtsPlayback, voiceOutput]);

  const handleTtsSpeedChange = useCallback((message: ChatMessage) => {
    setTtsPlaybackSpeed(getNextTtsPlaybackSpeed(ttsPlaybackSpeed));
    setTtsControlsMessageId(message.id);
  }, [setTtsPlaybackSpeed, ttsPlaybackSpeed]);

  const handleClearDesk = useCallback(() => {
    if (navigationTimeoutRef.current !== null) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    clear();
    stopTtsPlayback();
    clearMessages();
    const initialSuggestions = getInitialChatSuggestions(discoActive);
    setBaseSuggestions(initialSuggestions.base);
    setExtraSuggestions(initialSuggestions.extra);
    setReadyForAssistantId('welcome');
    hasFetchedSuggestionsRef.current = null;
    hasInitializedSuggestionsRef.current = false;
    pendingActionsRef.current.clear();
    handledActionsRef.current.clear();
    setSelectedProjectSlug(null);
  }, [clear, clearMessages, discoActive, stopTtsPlayback]);

  const handleCloseProjectModal = useCallback(() => {
    closePanel();
    setSelectedProjectSlug(null);
  }, [closePanel]);

  useEffect(() => {
    const handler = (raw: Event) => {
      handleCloseProjectModal();
      attachSiteActionResult(raw, {
        ok: true,
        spokenText: 'Closing that project.',
      });
    };
    window.addEventListener(CLOSE_PROJECT_EVENT, handler);
    return () => window.removeEventListener(CLOSE_PROJECT_EVENT, handler);
  }, [handleCloseProjectModal]);

  const handleEnterMatrix = useCallback(() => {
    selection();
    soundManager.play('chat-send');
    navigate();
    router.push('/matrix-notes');
  }, [navigate, router, selection]);

  const hasMessages = messages.length > 1; // >1 because welcome message is always present
  const hasOldMessages = messages.some(m => m.isOld && m.id !== 'welcome');
  const lastAssistantId = messages.findLast(m => m.role === 'assistant')?.id;
  const showSuggestions = !isLoading
    && !!lastAssistantId
    && readyForAssistantId === lastAssistantId
    && (baseSuggestions.length > 0 || extraSuggestions.length > 0 || matrixEscaped);
  const chipSlots = 4 - (matrixEscaped ? 1 : 0);
  const shownBaseSuggestions = baseSuggestions.slice(0, chipSlots);
  const shownExtraSuggestions = extraSuggestions.slice(0, Math.max(0, chipSlots - baseSuggestions.length));

  return (
    <div
      ref={shellRef}
      className="chat-shell flex h-full max-h-full flex-col"
      data-disco-chat-shell
      data-disco-motion="breath"
      style={SHELL_DISCO_STYLE}
    >
      {projectModalLoaded ? <ChatProjectModal projectSlug={selectedProjectSlug} onClose={handleCloseProjectModal} /> : null}
      <div className="sr-only" aria-live="polite">
        {ttsPlaybackStatus === 'loading' ? 'Loading spoken response.' : null}
        {ttsPlaybackStatus === 'playing' ? 'Playing assistant response.' : null}
        {ttsPlaybackStatus === 'paused' ? 'Assistant response paused.' : null}
        {ttsPlaybackStatus === 'error' ? (ttsPlaybackError ?? 'Could not play assistant response.') : null}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {assistantReplyAnnouncement ? (
          <span key={assistantReplyAnnouncement.id}>{assistantReplyAnnouncement.text}</span>
        ) : null}
      </div>
      {/* ─── Header ─── */}
      <div data-disco-motion="bob" style={HEAD_DISCO_STYLE} className="chat-head">
        <h1 data-disco-motion="wiggle" style={TITLE_DISCO_STYLE} className="chat-title font-hand font-bold">
          Pass me a note
        </h1>
        <WavyUnderline />
        <p data-disco-motion="shimmy" style={SUB_DISCO_STYLE} className="chat-sub font-hand">
          Ask me anything ~
        </p>
      </div>

      {/* ─── Messages + Input (overlaid) ─── */}
      <div className="relative min-h-0 flex-1">
        <PillScrollbar scrollRef={messagesScrollRef} />
        <div ref={messagesScrollRef} className="chat-scroll">
          <div ref={threadRef} className="chat-thread">
            {/* Messages (welcome note is always first) */}
            {messages.map((msg, idx) => {
              // Show "old notes" divider before the first non-welcome old message
              const showDivider = hasOldMessages && msg.isOld && msg.id !== 'welcome' &&
                !messages.slice(0, idx).some(m => m.isOld && m.id !== 'welcome');

              return (
                <div key={msg.id}>
                  {showDivider && <div className="chat-divider">old notes</div>}
                  <StickyNote
                    message={msg}
                    isLoading={isLoading && msg.role === 'assistant' && idx === messages.length - 1}
                    isTtsActive={ttsActiveMessageId === msg.id}
                    onSpeak={handleSpeakMessage}
                    onRetry={msg.retryPrompt && !isLoading && idx === messages.length - 1 ? handleRetryMessage : undefined}
                    onTtsRestart={handleTtsRestart}
                    onTtsSpeedChange={handleTtsSpeedChange}
                    onTypewriterStart={msg.role === 'assistant' && !msg.isOld && msg.id !== 'welcome' ? notifyNoteTypewriterStart : undefined}
                    onTypewriterDone={msg.role === 'assistant' && !msg.isOld && msg.id !== 'welcome' ? notifyNoteTypewriterDone : undefined}
                    showTtsControls={ttsControlsMessageId === msg.id && ttsActiveMessageId === msg.id && ttsPlaybackStatus !== 'idle'}
                    ttsPlaybackSpeed={ttsPlaybackSpeed}
                    ttsPlaybackError={ttsPlaybackError}
                    ttsStatus={ttsActiveMessageId === msg.id ? ttsPlaybackStatus : 'idle'}
                  />
                </div>
              );
            })}

            {/* Suggestions appear once the latest reply has finished typing; contextual extras join the
              hardcoded ones when they arrive, without re-mounting them. */}
            {showSuggestions ? (
              <div className="chat-chips">
                {matrixEscaped && (
                  <MatrixEscapeChip onSelect={handleEnterMatrix} skipEntrance={!hasHadInteraction} />
                )}
                {[...shownBaseSuggestions, ...shownExtraSuggestions].map((q, i) => (
                  <SuggestionStrip
                    key={`${i < shownBaseSuggestions.length ? 'base' : 'extra'}-${q}`}
                    text={q}
                    isAction={ACTION_SUGGESTION_SET.has(q)}
                    onSelect={handleSuggestion}
                    index={i}
                    skipEntrance={!hasHadInteraction}
                  />
                ))}
              </div>
            ) : null}

            {error && rateLimitRemaining && (
              <RateLimitNote seconds={rateLimitRemaining} />
            )}

            {error && !rateLimitRemaining && (
              <ServiceErrorNote message={error} />
            )}
          </div>
        </div>

        {/* ─── Input Area (isolated component to prevent keystroke re-renders) ─── */}
        <ChatInputArea
          onSend={handleSendFromInput}
          isLoading={isLoading}
          hasMessages={hasMessages}
          onClear={handleClearDesk}
          composerRef={composerRef}
        />
      </div>

    </div>
  );
}
