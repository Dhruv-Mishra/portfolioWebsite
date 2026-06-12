"use client";

import dynamic from 'next/dynamic';
import { useState, useRef, useEffect, useCallback, useLayoutEffect, memo, useMemo, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { m, AnimatePresence } from 'framer-motion';
import { Eraser, Loader2, Pause, Play, RotateCcw, Send, Volume2, Zap } from 'lucide-react';
import { useStickyChat, ChatMessage } from '@/hooks/useStickyChat';
import {
  MatrixDeniedNote,
  MatrixKeyRevealNote,
  extractRevealedKey,
} from '@/lib/matrixChatIntercept';
import { useAppHaptics } from '@/lib/haptics';
import { soundManager } from '@/lib/soundManager';
import type { ProjectSlug } from '@/lib/projectCatalog';
import { cn, pickRandom } from '@/lib/utils';
import { CHAT_CONFIG } from '@/lib/chatContext';
import PillScrollbar from '@/components/PillScrollbar';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { WavyUnderline } from '@/components/ui/WavyUnderline';
import { MicButton } from '@/components/ui/MicButton';
import { VoiceBackendToggle } from '@/components/ui/VoiceBackendToggle';
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
import { ANIMATION_TOKENS, TIMING_TOKENS, NOTE_ROTATION, NOTE_ENTRANCE, GRADIENT_TOKENS } from '@/lib/designTokens';
import {
  ACTION_REGISTRY,
  DISCO_ACTION_LABEL,
  FOLLOWUP_CONVERSATIONAL,
  getFollowupActions,
  getInitialChatSuggestions,
  getPromotedFollowupActions,
} from '@/lib/actions';
import { getSuggestionResponse } from '@/lib/suggestionResponses';
import { stickerBus } from '@/lib/stickerBus';
import { setDiscoActiveImperative, useDiscoActive, useMatrixEscaped } from '@/hooks/useStickers';
import { Tooltip } from '@/components/ui/Tooltip';

const ChatProjectModal = dynamic(() => import('@/components/ChatProjectModal'), { ssr: false });

/** Delay (ms) before executing page navigation after action confirmation */
const NAVIGATION_DELAY_MS = TIMING_TOKENS.pauseMedium;
const CLIENT_TTS_CONSENT_KEY = 'tts-client-speech-consent-v1';

function getNextTtsPlaybackSpeed(current: TtsPlaybackSpeed): TtsPlaybackSpeed {
  const currentIndex = TTS_PLAYBACK_SPEEDS.indexOf(current);
  return TTS_PLAYBACK_SPEEDS[(currentIndex + 1) % TTS_PLAYBACK_SPEEDS.length];
}

function readClientTtsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CLIENT_TTS_CONSENT_KEY) === 'accepted';
  } catch {
    return false;
  }
}

function writeClientTtsConsent(): void {
  try {
    window.localStorage.setItem(CLIENT_TTS_CONSENT_KEY, 'accepted');
  } catch { /* no-op */ }
}

// ─── Typewriter hook: reveals text gradually (only for new AI messages) ───
// Supports erase→type transitions for filler text swaps and filler→real response.
// State-driven rendering keeps the displayed note text in sync even when a new
// response lands mid-animation.
type TypewriterPhase = 'idle' | 'typing' | 'erasing';

function useTypewriter(text: string, isFiller: boolean, skip: boolean, speed = TIMING_TOKENS.typeSpeed, onComplete?: () => void) {
  const [phase, setPhase] = useState<TypewriterPhase>('idle');
  const [displayedText, setDisplayedText] = useState(skip ? text : '');
  const displayedTextRef = useRef(skip ? text : '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef(0);
  const eraseSpeed = Math.max(speed * 0.6, 8); // base: TIMING_TOKENS.eraseSpeed
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
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
    const activeRunId = ++runIdRef.current;

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

    const finish = (finalText: string, finalIsFiller: boolean) => {
      updateDisplayedText(finalText);
      setPhase('idle');
      phaseRef.current = 'idle';
      timerRef.current = null;
      if (!finalIsFiller) onCompleteRef.current?.();
    };

    const startTyping = (targetText: string, targetIsFiller: boolean, startIndex = 0) => {
      setPhase('typing');
      phaseRef.current = 'typing';

      const tick = (index: number) => {
        if (runIdRef.current !== activeRunId) return;

        const nextIndex = index + 1;
        updateDisplayedText(targetText.slice(0, nextIndex));

        if (nextIndex >= targetText.length) {
          finish(targetText, targetIsFiller);
          return;
        }

        schedule(() => tick(nextIndex), speed);
      };

      if (startIndex >= targetText.length) {
        finish(targetText, targetIsFiller);
        return;
      }

      schedule(() => tick(startIndex), speed);
    };

    const startErasing = (fromText: string, toText: string, toIsFiller: boolean) => {
      setPhase('erasing');
      phaseRef.current = 'erasing';

      const tick = (remainingLength: number) => {
        if (runIdRef.current !== activeRunId) return;

        const nextLength = remainingLength - 1;
        updateDisplayedText(fromText.slice(0, Math.max(0, nextLength)));

        if (nextLength <= 0) {
          startTyping(toText, toIsFiller);
          return;
        }

        schedule(() => tick(nextLength), eraseSpeed);
      };

      schedule(() => tick(fromText.length), eraseSpeed);
    };

    if (skip) {
      updateDisplayedText(text);
      setPhase('idle');
      phaseRef.current = 'idle';
      return;
    }

    const currentText = displayedTextRef.current;

    if (text === '' && !currentText) {
      setPhase('idle');
      phaseRef.current = 'idle';
      return;
    }

    if (text === currentText && phaseRef.current === 'idle') {
      return;
    }

    if (!currentText) {
      startTyping(text, isFiller);
      return;
    }

    startErasing(currentText, text, isFiller);

    return () => {
      clearActiveTimer();
    };
  }, [text, skip, speed, eraseSpeed, isFiller, clearActiveTimer]);

  return { displayedText, isTyping, isFiller: phase === 'erasing' || isFiller };
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

const TYPING_DOT_ANIMATE = {
  y: [0, -7, 0, 0],
  scale: [1, 1.35, 1, 1],
  opacity: [0.35, 1, 0.35, 0.35],
};
const TYPING_DOT_TRANSITION_BASE = { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const };

const TypingEllipsis = memo(function TypingEllipsis() {
  return (
    <span className="inline-flex items-end gap-[3px] ml-1 h-4 align-baseline" aria-label="Typing">
      {[0, 1, 2].map(i => (
        <m.span
          key={`dot-${i}`}
          className="inline-block w-[5px] h-[5px] rounded-full bg-current"
          animate={TYPING_DOT_ANIMATE}
          transition={{ ...TYPING_DOT_TRANSITION_BASE, delay: i * 0.16 }}
        />
      ))}
    </span>
  );
});

// Hoisted animation constants — avoids allocation per StickyNote render
const NOTE_SPRING = { type: 'spring' as const, ...ANIMATION_TOKENS.spring.default, duration: 0.4 };

// Hoisted inline style objects for StickyNote — avoids per-note allocation
const FOLD_STYLE_USER = { background: GRADIENT_TOKENS.foldCorner } as const;
const FOLD_STYLE_AI = { background: GRADIENT_TOKENS.foldCornerAlt } as const;
const MIN_HEIGHT_STYLE = { minHeight: '1.5em' } as const;

// ─── Suggested Question Strip ───
// Static rotation styles hoisted to module scope to avoid re-creating objects per render
const SUGGESTION_STYLE_ACTION = { transform: 'rotate(-0.5deg)' } as const;
const SUGGESTION_STYLE_NORMAL = { transform: 'rotate(0.3deg)' } as const;
// Disco "Engage disco mode" chip — vivid candy-palette gradient that mirrors
// the disco-on body background (pink → fuchsia → cyan → amber). Always shown
// in disco colors regardless of light/dark theme so the chip telegraphs what
// it does. Border is fuchsia for max contrast against the pink stops.
const SUGGESTION_STYLE_DISCO = {
  transform: 'rotate(-1deg)',
  backgroundImage:
    'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 25%, #c4b5fd 50%, #a5f3fc 75%, #fde68a 100%)',
  backgroundColor: '#fbcfe8',
} as const;

type DiscoMotionStyle = CSSProperties & {
  '--disco-motion-delay'?: string;
  '--disco-card-delay'?: string;
};

function getSuggestionStyle(isDisco: boolean, isAction: boolean | undefined, index: number): DiscoMotionStyle {
  const style: DiscoMotionStyle = {
    ...(isDisco ? SUGGESTION_STYLE_DISCO : (isAction ? SUGGESTION_STYLE_ACTION : SUGGESTION_STYLE_NORMAL)),
    '--disco-motion-delay': `${index * 110}ms`,
  };
  return style;
}

function pickFollowupAction(
  actions: readonly string[],
  options: Parameters<typeof getPromotedFollowupActions>[1],
): string[] {
  const candidates = getPromotedFollowupActions(actions, options);
  if (candidates.length === 0) return [];
  if (candidates[0] === DISCO_ACTION_LABEL) return [DISCO_ACTION_LABEL];
  return pickRandom(candidates, 1);
}

function filterUnavailableSuggestions(suggestions: readonly string[], discoActive: boolean): string[] {
  if (!discoActive) return [...suggestions];
  return suggestions.filter(suggestion => suggestion !== DISCO_ACTION_LABEL);
}

// RateLimitNote animation constants
const RATE_LIMIT_INITIAL = { opacity: 0, scale: 0.9 } as const;
const RATE_LIMIT_ANIMATE = { opacity: 1, scale: 1, rotate: 2 } as const;

// Chat heading animation constants
const HEADING_INITIAL = { opacity: 0, rotate: -3 } as const;
const HEADING_ANIMATE = { opacity: 1, rotate: -2 } as const;

// Suggestions container animation constants
const SUGGESTIONS_CONTAINER_INITIAL = { opacity: 0, y: 8 } as const;
const SUGGESTIONS_CONTAINER_ANIMATE = { opacity: 1, y: 0 } as const;
const SUGGESTIONS_CONTAINER_EXIT = { opacity: 0, y: -4 } as const;
const SUGGESTIONS_CONTAINER_TRANSITION = { duration: 0.2 } as const;

// Suggestion item animation constants
const SUGGESTION_ITEM_INITIAL = { opacity: 0, y: 10 } as const;
const SUGGESTION_ITEM_ANIMATE = { opacity: 1, y: 0 } as const;
const SUGGESTION_ITEM_EXIT = { opacity: 0, scale: 0.9 } as const;
const SUGGESTION_ITEM_SKIP_TRANSITION = { duration: 0 } as const;
const SUGGESTION_HOVER = { scale: 1.05, rotate: -1, transition: { type: "spring" as const, stiffness: 400, damping: 25 } } as const;
const SUGGESTION_TAP = { scale: 0.95 } as const;

// Input area animation constants
const INPUT_NOTE_STYLE = { transform: 'rotate(0.5deg)' } as const;
const INPUT_NOTE_DISCO_STYLE: DiscoMotionStyle = { ...INPUT_NOTE_STYLE, '--disco-motion-delay': '220ms' };
const INPUT_TOOLBAR_DISCO_STYLE: DiscoMotionStyle = { '--disco-motion-delay': '120ms' };
const INPUT_NOTE_INITIAL = { opacity: 0, y: 20 } as const;
const INPUT_NOTE_ANIMATE = { opacity: 0.92, y: 0 } as const;
const SEND_BUTTON_HOVER = { scale: 1.15, rotate: 10 } as const;
const SEND_BUTTON_TAP = { scale: 0.9 } as const;

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

function getMessageDiscoStyle(messageId: string): DiscoMotionStyle {
  const hash = getStableHash(messageId);

  return {
    '--disco-motion-delay': getNegativeDiscoDelay(mixHash(hash, 0x9e3779b1), CHAT_SWAY_PERIOD_MS),
    '--disco-card-delay': getNegativeDiscoDelay(mixHash(hash, 0x85ebca6b), CARD_HUE_PERIOD_MS),
  };
}

function getNoteRotation(messageId: string, isUser: boolean): number {
  const hash = getStableHash(messageId);

  const normalized = (hash % 1000) / 1000;
  const rotation = NOTE_ROTATION.minDeg + normalized * NOTE_ROTATION.rangeDeg;
  return isUser ? rotation : -rotation;
}

const SuggestionStrip = memo(function SuggestionStrip({ text, isAction, onSelect, index = 0, skipEntrance }: { text: string; isAction?: boolean; onSelect: (text: string) => void; index?: number; skipEntrance?: boolean }) {
  const handleClick = useCallback(() => onSelect(text), [onSelect, text]);
  const isDisco = Boolean(isAction && text === DISCO_ACTION_LABEL);
  const suggestionStyle = getSuggestionStyle(isDisco, isAction, index);
  return (
  <m.button
    initial={skipEntrance ? false : SUGGESTION_ITEM_INITIAL}
    animate={SUGGESTION_ITEM_ANIMATE}
    exit={SUGGESTION_ITEM_EXIT}
    transition={skipEntrance ? SUGGESTION_ITEM_SKIP_TRANSITION : { delay: index * 0.07, duration: 0.2 }}
    whileHover={SUGGESTION_HOVER}
    whileTap={SUGGESTION_TAP}
    onClick={handleClick}
    data-disco-motion={isDisco ? 'wiggle' : 'bob'}
    className={cn(
      "px-4 py-2 border-2 rounded shadow-sm font-hand text-sm md:text-base opacity-90 hover:opacity-100 transition-opacity flex flex-col items-start",
      isDisco
        ? "border-fuchsia-500/80 text-fuchsia-950 shadow-[0_0_14px_rgba(232,121,249,0.45)] hover:shadow-[0_0_22px_rgba(232,121,249,0.7)]"
        : cn(
            "bg-[var(--c-paper)] text-[var(--c-ink)]",
            isAction ? "border-amber-500/80 dark:border-amber-500/60" : "border-[var(--c-grid)]",
          ),
    )}
    style={suggestionStyle}
  >
    <span className={cn(
      "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-0.5",
      isDisco
        ? "text-fuchsia-700"
        : isAction ? "text-amber-600/70 dark:text-amber-400/70" : "text-[var(--c-ink)]/40",
    )}>
      {isDisco
        ? <span aria-hidden="true">🪩</span>
        : isAction ? <Zap size={10} className="text-amber-500" /> : <span className="text-[var(--c-ink)]/30">💬</span>}
      {isDisco ? 'disco' : (isAction ? 'action' : 'suggestion')}
    </span>
    {text}
  </m.button>
); });

// Hardcoded "Enter the Matrix" chip — only renders when the user has
// already escaped the puzzle. Distinct matrix-green diagonal-stripe styling
// so it visually pops next to the regular cream sticky-note chips, while
// keeping the sketchbook border treatment for cohesion. Click navigates
// directly to /matrix-notes — no API call.
const MATRIX_CHIP_STYLE = {
  transform: 'rotate(-1deg)',
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(0,255,65,0.18) 0px, rgba(0,255,65,0.18) 6px, rgba(6,78,59,0.55) 6px, rgba(6,78,59,0.55) 12px)',
  backgroundColor: '#022c22',
} as const;

const MatrixEscapeChip = memo(function MatrixEscapeChip({ onSelect, skipEntrance }: { onSelect: () => void; skipEntrance?: boolean }) {
  return (
    <m.button
      initial={skipEntrance ? false : SUGGESTION_ITEM_INITIAL}
      animate={SUGGESTION_ITEM_ANIMATE}
      exit={SUGGESTION_ITEM_EXIT}
      transition={skipEntrance ? SUGGESTION_ITEM_SKIP_TRANSITION : { duration: 0.25 }}
      whileHover={SUGGESTION_HOVER}
      whileTap={SUGGESTION_TAP}
      onClick={onSelect}
      type="button"
      aria-label="Enter the matrix — open the matrix-notes wall"
      data-disco-motion="wiggle"
      className="px-4 py-2 border-2 border-emerald-300/80 rounded shadow-[0_0_14px_rgba(16,185,129,0.45)] font-code text-sm md:text-base text-emerald-100 hover:text-white hover:shadow-[0_0_22px_rgba(16,185,129,0.7)] transition-shadow flex flex-col items-start"
      style={MATRIX_CHIP_STYLE}
      data-clickable
    >
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.22em] mb-0.5 text-emerald-200/90">
        <span aria-hidden="true">&gt;_</span>
        matrix
      </span>
      <span className="tracking-wide">Enter the Matrix →</span>
    </m.button>
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
  unframed = false,
}: {
  isActive: boolean;
  onClick: () => void;
  status: TtsPlaybackStatus;
  unframed?: boolean;
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
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors md:h-7 md:w-7',
          'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--note-ai-ink)]/60',
          unframed && 'border-transparent bg-transparent',
          isActive && status === 'error'
            ? 'border-rose-500/30 bg-rose-100/40 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
            : pressed
              ? 'border-[var(--note-ai-ink)]/25 bg-[var(--note-ai-ink)]/10 text-[var(--note-ai-ink)]'
              : 'border-[var(--note-ai-ink)]/15 bg-[var(--note-ai-ink)]/5 text-[var(--note-ai-ink)]/55 hover:text-[var(--note-ai-ink)] hover:bg-[var(--note-ai-ink)]/10',
          busy && 'cursor-progress opacity-70',
        )}
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
    <div
      role="group"
      aria-label="Spoken response controls"
      className={cn(
        'flex w-12 flex-col items-center gap-1 rounded-full border border-dashed border-[var(--note-ai-ink)]/20 bg-[var(--note-ai)]/95 p-1 shadow-md backdrop-blur-sm md:w-9',
      )}
    >
      <SpeakResponseButton
        isActive={speakIsActive}
        status={status}
        onClick={onSpeak}
        unframed
      />
      <Tooltip label={`Voice speed ${playbackSpeed}x`}>
        <button
          type="button"
          aria-label={`Voice speed ${playbackSpeed}x. Change speed`}
          onClick={onCycleSpeed}
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-full border font-hand text-[10px] font-bold transition-colors md:h-7 md:w-7',
            'border-[var(--note-ai-ink)]/35 bg-[var(--note-ai-ink)]/15 text-[var(--note-ai-ink)] hover:bg-[var(--note-ai-ink)]/20',
            'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--note-ai-ink)]/60',
          )}
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
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--note-ai-ink)]/15 bg-[var(--c-paper)]/45 text-[var(--note-ai-ink)]/65 transition-colors md:h-7 md:w-7',
            'hover:bg-[var(--note-ai-ink)]/10 hover:text-[var(--note-ai-ink)]',
            'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--note-ai-ink)]/60',
            isLoading && 'cursor-progress opacity-50',
          )}
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
  onTtsRestart,
  onTtsSpeedChange,
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
  onTtsRestart?: (message: ChatMessage) => void;
  onTtsSpeedChange?: (message: ChatMessage) => void;
  onTypewriterDone?: () => void;
  showTtsControls?: boolean;
  ttsPlaybackSpeed?: TtsPlaybackSpeed;
  ttsPlaybackError?: string | null;
  ttsStatus?: TtsPlaybackStatus;
}) {
  const isUser = message.role === 'user';
  const hasAction = !!(message.navigateTo || message.themeAction || (message.openUrls && message.openUrls.length > 0) || message.feedbackAction || message.projectSlug);
  const rotation = useMemo(() => getNoteRotation(message.id, isUser), [message.id, isUser]);
  const discoStyle = useMemo(() => getMessageDiscoStyle(message.id), [message.id]);

  // Typewriter effect for AI notes (skip for user msgs and old/restored messages)
  const { displayedText, isFiller: isDisplayingFiller } = useTypewriter(
    message.content,
    !!message.isFiller,
    isUser || !!message.isOld,
    TIMING_TOKENS.typeSpeed,
    onTypewriterDone,
  );
  const showPencil = !isUser && isLoading;
  const canSpeak = canSpeakAssistantMessage(message) && !isDisplayingFiller;

  return (
    <m.div
      initial={isUser
        ? { opacity: 0, y: NOTE_ENTRANCE.userY, rotate: rotation + NOTE_ENTRANCE.userRotateOffset }
        : { opacity: 0, x: NOTE_ENTRANCE.aiX, rotate: rotation + NOTE_ENTRANCE.aiRotateOffset }
      }
      animate={{ opacity: message.isOld ? NOTE_ENTRANCE.oldNoteOpacity : 1, y: 0, x: 0, rotate: rotation }}
      transition={NOTE_SPRING}
      /* Disco mode: each chat bubble shimmies side-to-side. The note-paper
         bg classes already trigger the hue-cycle; the shimmy is scoped by
         the site-wide selector on .bg-[var(--note-user)] / .bg-[var(--note-ai)].
         data-disco-motion is redundant here but documents the intent. */
      data-disco-motion="shimmy"
      style={discoStyle}
      className={cn(
        "relative max-w-[90%] sm:max-w-[85%] md:max-w-[70%] mx-auto p-4 md:p-5 pb-6 md:pb-8 shadow-md font-hand text-base md:text-lg",
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
        style={isUser ? FOLD_STYLE_USER : FOLD_STYLE_AI}
      />

      {canSpeak && onSpeak ? (
        <div className="absolute right-2 top-2 z-10">
          {showTtsControls && onTtsRestart && onTtsSpeedChange ? (
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
          )}
        </div>
      ) : null}

      {/* Message content — rendered inline so the note grows naturally with typewritten text */}
      <div className={cn("relative", canSpeak && "pr-8")}>
        <div className={cn(
          "whitespace-pre-wrap break-words leading-relaxed",
          // Filler text: same color, just faded + italic to distinguish from final response
          !isUser && isDisplayingFiller && "italic opacity-50",
        )}
        // Prevent note from collapsing to 0 height during erase→type transition
        style={MIN_HEIGHT_STYLE}
        >
          {isUser ? (
            message.content
          ) : (
            <MatrixAwareAssistantText message={message} displayedText={displayedText} />
          )}
        </div>
        {!isUser && isTtsActive && ttsStatus === 'error' && ttsPlaybackError ? (
          <p className="mt-2 font-sans text-xs leading-snug text-rose-700 dark:text-rose-300" role="status">
            {ttsPlaybackError}
          </p>
        ) : null}
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
              key={url}
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
const RateLimitNote = memo(function RateLimitNote({ seconds }: { seconds: number }) {
  return (
    <m.div
      initial={RATE_LIMIT_INITIAL}
      animate={RATE_LIMIT_ANIMATE}
      className="relative max-w-sm mx-auto p-4 bg-[#ffccbc] dark:bg-[#3e2723] text-orange-900 dark:text-orange-200 shadow-md font-hand text-sm md:text-base"
    >
      <TapeStrip />
      Whoa, slow down! Even sticky notes need a breather. Try again in {seconds} seconds.
    </m.div>
  );
});

const ServiceErrorNote = memo(function ServiceErrorNote({ message }: { message: string }) {
  return (
    <m.div
      initial={RATE_LIMIT_INITIAL}
      animate={{ opacity: 1, scale: 1, rotate: -1 }}
      className="relative max-w-sm mx-auto p-4 bg-[#ffd7d1] dark:bg-[#4a1f1a] text-rose-900 dark:text-rose-100 shadow-md font-hand text-sm md:text-base"
    >
      <TapeStrip />
      {message}
    </m.div>
  );
});

// ─── Chat Input Area (isolated to prevent keystroke re-renders of message list) ───
interface ChatInputAreaProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  compact: boolean;
  hasMessages: boolean;
  onClear: () => void;
}

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
      <h2
        id={titleId}
        className="font-hand text-xl md:text-2xl font-bold text-[var(--c-heading)] leading-tight"
      >
        {title}
      </h2>
      <p className="font-hand text-sm md:text-base text-[var(--c-ink)]/85 leading-relaxed">
        {body}
      </p>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-1">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="font-hand font-bold text-sm md:text-base px-4 py-2 rounded border-2 border-dashed border-[var(--c-ink)]/30 text-[var(--c-ink)]/80 hover:bg-[var(--c-ink)]/5 hover:border-[var(--c-ink)]/55 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            'font-hand font-bold text-sm md:text-base px-4 py-2 rounded border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
            confirmTone === 'danger'
              ? 'bg-red-100 border-red-500 text-red-800 hover:bg-red-200 dark:bg-red-950/40 dark:border-red-400 dark:text-red-200 dark:hover:bg-red-900/60 focus-visible:outline-red-500'
              : 'bg-amber-100 border-amber-600 text-amber-900 hover:bg-amber-200 dark:bg-amber-500/30 dark:border-amber-300 dark:text-amber-100 dark:hover:bg-amber-500/50 focus-visible:outline-amber-500',
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
});

const ChatInputArea = memo(function ChatInputArea({ onSend, isLoading, compact, hasMessages, onClear }: ChatInputAreaProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const placeholderRef = usePlaceholderTypewriter(!isLoading);
  const { pref: voicePref, setPref: setVoicePref, togglePref: toggleVoicePref } = useVoiceBackendPref();
  const speech = useVoiceInput({ backend: voicePref });
  const baseInputRef = useRef('');
  // Confirmation modal state — lifted into the input area so both the
  // Clear-chat action and the Local Transcription opt-in flow can share
  // the production-grade `Modal` shell (portal, focus trap, scroll lock,
  // Escape dismissal). null = no modal open.
  type ConfirmKind = 'clear' | 'enableLocal' | null;
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    if (speech.isListening) speech.stop();
    onSend(input.trim());
    setInput('');
    speech.reset();
    baseInputRef.current = '';
    setTimeout(() => inputRef.current?.focus(), TIMING_TOKENS.refocusDelay);
  }, [input, isLoading, onSend, speech]);

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

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

  return (
    <div className={cn(
      "absolute inset-x-0 pointer-events-none",
      // Lift the input bar off the viewport bottom on both breakpoints so
      // the user's eye is drawn TO it (rather than it disappearing into
      // the page chrome). Mobile gets ~8px, desktop a generous ~24px so
      // the sticky-note feels like a card the visitor can grab.
      "bottom-2 md:bottom-6",
      "before:absolute before:inset-x-0 before:bottom-full before:h-16 before:bg-gradient-to-t before:from-[var(--c-bg)] before:to-transparent",
    )}
    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className={cn(
        // Slightly more breathing room on mobile (pt-2 / pb-2) so the
        // toolbar above and the input note don't visually crowd each
        // other; desktop keeps its existing comfortable gutter.
        "pointer-events-auto bg-[var(--c-bg)] px-2 md:px-6 pt-2 pb-2 md:pt-3 md:pb-3",
        compact && "px-2 pt-1 pb-1",
      )}>
        {/* Ancillary controls toolbar — lives ABOVE the input box so the
            input itself stays visually clean (text + send only). All
            controls share a single translucent themed pill so they read
            as a unified "chat utilities" cluster rather than three
            disconnected affordances. */}
        {(hasMessages || speech.isSupported) && (
          <div className="flex items-center justify-end mb-1.5 px-1">
            <div
              data-disco-motion="shimmy"
              data-disco-chat-input-bar
              className={cn(
                'flex max-w-full flex-wrap items-center justify-end gap-2 rounded-full px-2.5 py-1.5 md:gap-4 md:px-3 md:py-1.5',
                // Translucent paper background — reads on both light and
                // dark themes via the --c-paper / --c-ink tokens, then
                // softened with /60 + backdrop-blur so messages bleed
                // through faintly. Dashed sketch border keeps the
                // sketchbook aesthetic.
                'bg-[var(--c-paper)]/60 backdrop-blur-sm',
                'border border-dashed border-[var(--c-ink)]/20',
                'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]',
              )}
              style={INPUT_TOOLBAR_DISCO_STYLE}
            >
            {hasMessages && (
              <button
                type="button"
                onClick={() => setConfirmKind('clear')}
                className="flex min-h-10 items-center gap-1 rounded px-2 text-[11px] font-hand font-bold text-[var(--c-ink)]/70 transition-colors duration-200 hover:text-red-600 dark:hover:text-red-400 md:min-h-8 md:px-1.5 md:text-xs"
                title="Clear chat history"
              >
                <Eraser size={12} />
                Clear chat
              </button>
            )}
            {speech.isSupported && (
              <>
                <VoiceBackendToggle
                  isLoading={speech.isLoading}
                  loadProgress={speech.loadProgress}
                  compact
                  onToggleIntercept={(nextActive) => {
                    // Disabling is safe and instant. Enabling triggers a
                    // ~35MB one-time download — surface a confirmation
                    // modal first so the user understands what they're
                    // opting into (especially on mobile / metered data).
                    if (nextActive) setConfirmKind('enableLocal');
                    else toggleVoicePref();
                  }}
                />
                <MicButton
                  isListening={speech.isListening}
                  isLoading={speech.isLoading}
                  isTranscribing={speech.isTranscribing}
                  loadProgress={speech.loadProgress}
                  onClick={handleMicToggle}
                  disabled={isLoading}
                  size={compact ? 12 : 14}
                  title={speech.requiresLocalTranscription ? 'Enable Local Transcription to dictate on this browser' : undefined}
                />
              </>
            )}
            </div>
          </div>
        )}
        {speech.requiresLocalTranscription || speech.error ? (
          <div className="mb-1 px-2 text-right font-hand text-[11px] leading-tight text-[var(--c-ink)]/65" aria-live="polite">
            {speech.requiresLocalTranscription
              ? 'This browser needs Local Transcription for the mic.'
              : speech.error}
          </div>
        ) : null}

        {/* The input "sticky note" — symmetric vertical padding (top = bottom). */}
        <m.div
          initial={INPUT_NOTE_INITIAL}
          animate={INPUT_NOTE_ANIMATE}
          data-disco-motion="bob"
          data-disco-chat-input
          className={cn(
            "relative bg-[var(--note-user)] rounded shadow-md border border-[var(--c-grid)]/20",
            // Tighter mobile padding now that ancillary controls live above.
            compact ? "px-2 py-1.5" : "px-2 py-1.5 md:px-4 md:py-2.5",
          )}
          style={INPUT_NOTE_DISCO_STYLE}
        >
          <div className="flex items-end gap-2" onClick={() => inputRef.current?.focus()}>
            <div className="relative flex-1 min-h-[44px]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, CHAT_CONFIG.maxUserMessageLength))}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isLoading || speech.isListening || speech.isTranscribing}
                aria-label="Chat message"
                className={cn(
                  // Auto-grow textarea: rows=1 baseline; useLayoutEffect
                  // measures scrollHeight and applies inline height up to
                  // ~3-4 lines, then internal overflow-y kicks in.
                  "w-full min-h-[44px] bg-transparent py-2.5 resize-none font-hand text-[var(--note-user-ink)] focus:outline-none overflow-y-auto",
                  // Placeholder text uses the SAME font-size as typed text;
                  // greyer color is applied via the overlay span below
                  // (the textarea's native placeholder is unused on
                  // purpose — we render a custom typewriter overlay).
                  compact ? "text-base leading-snug max-h-[96px]" : "text-base md:text-lg leading-snug max-h-[112px] md:max-h-[140px]",
                  (speech.isListening || speech.isTranscribing) && "invisible",
                )}
              />
              {/* Typewriter placeholder overlay — same font-size as the
                  textarea (mobile: text-base, desktop: text-lg) so swapping
                  in real typed text doesn't reflow. Color is the only
                  difference: muted ink rather than full ink. */}
              {!input && !speech.isListening && !speech.isTranscribing && (
                <span
                  ref={placeholderRef}
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-2.5 pointer-events-none font-hand text-[var(--note-user-ink)]/40 whitespace-nowrap overflow-hidden leading-snug",
                    compact ? "text-base" : "text-base md:text-lg",
                  )}
                />
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
                  setInput('');
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                size={compact ? 12 : 14}
              />
            )}

            {/* Paperclip send button — stays inline with the textarea
                because send is the primary action paired with text. The
                ancillary mic / voice / clear-chat controls were moved to
                the toolbar above to declutter the input row. */}
            <m.button
              type="button"
              whileHover={SEND_BUTTON_HOVER}
              whileTap={SEND_BUTTON_TAP}
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-colors",
                input.trim() && !isLoading
                  ? "text-amber-700 dark:text-amber-300 hover:bg-amber-200/30"
                  : "text-gray-400 dark:text-gray-600",
              )}
              title="Send note"
              aria-label="Send message"
            >
              <Send size={compact ? 14 : 16} className="md:w-[20px] md:h-[20px]" />
            </m.button>
          </div>
        </m.div>
      </div>

      {/* ─── Confirmation modal (Clear chat / Enable Local Transcription) ─── */}
      <Modal
        isOpen={confirmKind !== null}
        onClose={() => setConfirmKind(null)}
        ariaLabelledBy="chat-confirm-title"
        className="w-[min(92vw,420px)] bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/60 rounded-lg shadow-xl p-5 md:p-6 mt-[20vh] md:mt-[18vh]"
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
            body="Switches voice input from the browser's online speech API to an on-device Whisper model. The first time you turn it on, your browser downloads ~35 MB and caches it for future visits — works fully offline after that, with multilingual support and better accuracy. Heads up if you're on a metered connection."
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
export default function StickyNoteChat({ compact = false }: { compact?: boolean }) {
  const { messages, isLoading, error, sendMessage, sendHardcoded, clearMessages, markOpenUrlsFailed, rateLimitRemaining, fetchSuggestions, suggestions: llmSuggestions, isSuggestionsLoading } = useStickyChat();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { clear, closePanel, error: errorHaptic, externalLink, navigate, openPanel, selection, submit, success, warning } = useAppHaptics();
  const [clientTtsConsent, setClientTtsConsent] = useState(false);
  const [pendingTtsMessage, setPendingTtsMessage] = useState<ChatMessage | null>(null);
  const {
    activeMessageId: ttsActiveMessageId,
    clientSpeechSupported,
    error: ttsPlaybackError,
    playbackSpeed: ttsPlaybackSpeed,
    restart: restartTtsPlayback,
    setPlaybackSpeed: setTtsPlaybackSpeed,
    status: ttsPlaybackStatus,
    stop: stopTtsPlayback,
    toggle: toggleTtsPlayback,
  } = useTtsPlayback({ preferClientSpeech: clientTtsConsent });
  // Suggestions: 2 hardcoded (immediate) + 2 contextual (LLM or fallback)
  // Start empty to prevent flash on page return — hydration effect fills them
  const [baseSuggestions, setBaseSuggestions] = useState<string[]>([]);
  const [extraSuggestions, setExtraSuggestions] = useState<string[]>([]);
  const [readyForAssistantId, setReadyForAssistantId] = useState<string | null>('welcome');
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<ProjectSlug | null>(null);
  const [ttsControlsMessageId, setTtsControlsMessageId] = useState<string | null>(null);

  const followupActions = useMemo(() => getFollowupActions(), []);
  const matrixEscaped = useMatrixEscaped();
  const discoActive = useDiscoActive();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handledActionsRef = useRef<Set<string>>(new Set());
  const pendingActionsRef = useRef<Map<string, ChatMessage>>(new Map());
  const hasFetchedSuggestionsRef = useRef<string | null>(null);
  const committedExtrasForIdRef = useRef<string | null>(null);
  const hasHadInteractionRef = useRef(false);
  const hasInitializedSuggestionsRef = useRef(false);
  const completedAssistantHapticRef = useRef<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    setClientTtsConsent(readClientTtsConsent());
  }, []);

  useEffect(() => {
    for (const message of messages) {
      if (message.isOld || message.role !== 'assistant') continue;
      if (handledActionsRef.current.has(message.id)) continue;

      const hasAction = message.navigateTo || message.themeAction || (message.openUrls && message.openUrls.length > 0) || message.feedbackAction || message.projectSlug;
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
    hasFetchedSuggestionsRef.current = lastAssistant.id;
    // New target id — allow exactly one extras commit for this id.
    committedExtrasForIdRef.current = null;

    // Exclude the suggestion the user just clicked (= their last message text)
    const lastUserMsg = messages.findLast(m => m.role === 'user');
    const lastUserText = lastUserMsg?.content?.toLowerCase() || '';

    // 2 hardcoded suggestions: 1 conversational + 1 action (shown once typewriter finishes)
    const hardcoded = [
      ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => s.toLowerCase() !== lastUserText), 1),
      ...pickFollowupAction(followupActions, { discoActive, lastUserText }),
    ];
    setBaseSuggestions(hardcoded);
    setExtraSuggestions([]); // Clear contextual — will be filled by LLM or fallback
    if (lastAssistant.clientOnly) {
      committedExtrasForIdRef.current = lastAssistant.id;
      setExtraSuggestions([
        ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => !hardcoded.includes(s)), 1),
        ...pickFollowupAction(followupActions, { discoActive, exclude: hardcoded }),
      ]);
      return;
    }
    // Fire background LLM request for 2 contextual suggestions
    fetchSuggestions();
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
    committedExtrasForIdRef.current = targetId;
    const availableLlmSuggestions = filterUnavailableSuggestions(llmSuggestions, discoActive);
    if (availableLlmSuggestions.length > 0) {
      setExtraSuggestions(availableLlmSuggestions.slice(0, 2));
    } else {
      // LLM failed — fill with 1 conversational + 1 action (different from base)
      setExtraSuggestions([
        ...pickRandom(FOLLOWUP_CONVERSATIONAL.filter(s => !baseSuggestions.includes(s)), 1),
        ...pickFollowupAction(followupActions, { discoActive, exclude: baseSuggestions }),
      ]);
    }
  }, [isSuggestionsLoading, llmSuggestions, baseSuggestions, followupActions, discoActive]);

  useEffect(() => {
    if (!discoActive) return;
    setBaseSuggestions(current => current.filter(suggestion => suggestion !== DISCO_ACTION_LABEL));
    setExtraSuggestions(current => current.filter(suggestion => suggestion !== DISCO_ACTION_LABEL));
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
      (action.openUrls && action.openUrls.length > 0) ||
      action.navigateTo
    ) {
      stickerBus.emit('chat-conductor');
    }

    // Theme switching
    if (action.themeAction) {
      selection();
      if (action.themeAction === 'toggle') {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
      } else if (action.themeAction === 'disco') {
        // Pre-warm the heavy disco media chunk on the user-gesture tick
        // so sparkles/spotlights paint without a fetch stall.
        if (typeof window !== 'undefined') {
          void import('@/components/DiscoMediaLayer').catch(() => {
            /* DiscoFlagController retries lazily — best-effort */
          });
        }
        setDiscoActiveImperative(true);
      } else if (action.themeAction === 'disco-off') {
        setDiscoActiveImperative(false);
      } else {
        setTheme(action.themeAction);
      }
    }

    // Open feedback modal
    if (action.feedbackAction) {
      openPanel();
      window.dispatchEvent(new CustomEvent('open-feedback'));
    }

    if (action.projectSlug) {
      openPanel();
      setSelectedProjectSlug(action.projectSlug);
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
  }, [externalLink, markOpenUrlsFailed, navigate, openPanel, resolvedTheme, router, selection, setTheme]);

  const handleTypewriterDone = useCallback((messageId: string) => {
    setReadyForAssistantId(messageId);

    const action = pendingActionsRef.current.get(messageId);
    if (!action) return;

    pendingActionsRef.current.delete(messageId);
    executeAction(action);
  }, [executeAction]);

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

  // Auto-scroll to newest note — consolidated single effect handles all scroll triggers:
  // new message arrives, streaming ends, or suggestions appear. Replaces two separate effects.
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const countChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if ((countChanged || !isLoading) && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isLoading, readyForAssistantId]);

  // Auto-scroll DURING typewriter growth — observes the scroll container's
  // content size and snaps to bottom whenever it grows AND the user was
  // anchored near the bottom BEFORE the growth. Respects manual scroll-up
  // for reading history (threshold: 80px from bottom).
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let lastScrollHeight = el.scrollHeight;
    let rafId: number | null = null;

    const observer = new ResizeObserver(() => {
      const nextHeight = el.scrollHeight;
      if (nextHeight === lastScrollHeight) return;
      // Compute "near bottom" against the height we observed BEFORE this growth,
      // so the new content doesn't flip us out of the anchored state.
      const distanceFromBottom = lastScrollHeight - el.scrollTop - el.clientHeight;
      const wasNearBottom = distanceFromBottom < 80;
      lastScrollHeight = nextHeight;
      if (!wasNearBottom) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        el.scrollTop = el.scrollHeight;
      });
    });

    observer.observe(el);
    // Also observe each direct child so we catch typewriter growth that doesn't
    // resize the scroll container itself (only its content).
    const children = Array.from(el.children) as HTMLElement[];
    children.forEach((c) => observer.observe(c));

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [messages.length]);

  const handleSendFromInput = useCallback((text: string) => {
    hasHadInteractionRef.current = true;
    stopTtsPlayback();
    submit();
    soundManager.play('chat-send');
    if (sendHardcoded(text, getSuggestionResponse(text))) {
      return;
    }
    sendMessage(text);
  }, [sendMessage, sendHardcoded, stopTtsPlayback, submit]);

  const handleSuggestion = useCallback((text: string) => {
    hasHadInteractionRef.current = true;
    stopTtsPlayback();
    selection();
    soundManager.play('chat-send');
    // Hardcoded suggestions and exact action labels short-circuit all chat
    // APIs so deterministic chips keep working even when staging backends are
    // unavailable or origin/rate-limit checks reject live requests.
    const canned = getSuggestionResponse(text);
    if (sendHardcoded(text, canned)) {
      return;
    }
    sendMessage(text);
  }, [selection, sendMessage, sendHardcoded, stopTtsPlayback]);

  const speakWithClientTts = useCallback((message: ChatMessage) => {
    writeClientTtsConsent();
    setClientTtsConsent(true);
    setPendingTtsMessage(null);
    setTtsControlsMessageId(message.id);
    void toggleTtsPlayback(message.id, message.content, { preferClientSpeech: true });
  }, [toggleTtsPlayback]);

  const handleSpeakMessage = useCallback((message: ChatMessage) => {
    const isActiveMessage = ttsActiveMessageId === message.id && ttsPlaybackStatus !== 'idle';
    setTtsControlsMessageId(message.id);
    if (clientSpeechSupported && !clientTtsConsent && !isActiveMessage) {
      setPendingTtsMessage(message);
      return;
    }
    void toggleTtsPlayback(message.id, message.content, { preferClientSpeech: clientTtsConsent });
  }, [clientSpeechSupported, clientTtsConsent, toggleTtsPlayback, ttsActiveMessageId, ttsPlaybackStatus]);

  const handleTtsRestart = useCallback((message: ChatMessage) => {
    setTtsControlsMessageId(message.id);
    void restartTtsPlayback(message.id, message.content, { preferClientSpeech: clientTtsConsent });
  }, [clientTtsConsent, restartTtsPlayback]);

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

  const handleEnterMatrix = useCallback(() => {
    selection();
    soundManager.play('chat-send');
    navigate();
    router.push('/matrix-notes');
  }, [navigate, router, selection]);

  const hasMessages = messages.length > 1; // >1 because welcome message is always present
  const hasOldMessages = messages.some(m => m.isOld && m.id !== 'welcome');

  return (
    <div className={cn(
      "flex flex-col h-full",
      compact ? "max-h-full" : ""
    )}
      data-disco-chat-shell
      data-disco-motion={compact ? undefined : 'breath'}
      style={{ '--disco-motion-delay': '260ms' } as CSSProperties}
    >
      {selectedProjectSlug ? <ChatProjectModal projectSlug={selectedProjectSlug} onClose={handleCloseProjectModal} /> : null}
      <Modal
        isOpen={pendingTtsMessage !== null}
        onClose={() => setPendingTtsMessage(null)}
        ariaLabelledBy="tts-confirm-title"
        className="w-[min(92vw,420px)] bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/60 rounded-lg shadow-xl p-5 md:p-6 mt-[20vh] md:mt-[18vh]"
      >
        {pendingTtsMessage && (
          <ConfirmContent
            titleId="tts-confirm-title"
            title="Enable Client-Side Speech?"
            body="Spoken replies will prefer your browser's local speech engine so they start faster and avoid the server TTS queue. Natural client-side voice models can require a one-time download around 25 MB when enabled; cached audio stays in this browser. Voice quality still depends on your device and browser."
            confirmLabel="Enable speech"
            confirmTone="primary"
            onCancel={() => setPendingTtsMessage(null)}
            onConfirm={() => speakWithClientTts(pendingTtsMessage)}
          />
        )}
      </Modal>
      <div className="sr-only" aria-live="polite">
        {ttsPlaybackStatus === 'loading' ? 'Loading spoken response.' : null}
        {ttsPlaybackStatus === 'playing' ? 'Playing assistant response.' : null}
        {ttsPlaybackStatus === 'paused' ? 'Assistant response paused.' : null}
        {ttsPlaybackStatus === 'error' ? (ttsPlaybackError ?? 'Could not play assistant response.') : null}
      </div>
      {/* ─── Header ─── */}
      {!compact ? (
        <div
          data-disco-motion="bob"
          style={{ '--disco-motion-delay': '80ms' } as CSSProperties}
          className="text-center pt-2 pb-0 md:pt-10 md:pb-1 shrink-0"
        >
          <m.h1
            initial={HEADING_INITIAL}
            animate={HEADING_ANIMATE}
            data-disco-motion="wiggle"
            style={{ '--disco-motion-delay': '160ms' } as CSSProperties}
            className="text-2xl md:text-5xl font-hand font-bold text-[var(--c-heading)] inline-block"
          >
            Pass me a note
          </m.h1>
          <WavyUnderline />
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: ANIMATION_TOKENS.delay.medium }}
            data-disco-motion="shimmy"
            style={{ '--disco-motion-delay': '260ms' } as CSSProperties}
            className="font-hand text-sm md:text-xl text-[var(--c-ink)] opacity-60 mt-0.5 md:mt-2 hidden md:block"
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
        "absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2 md:px-6 py-4 pb-32 md:pb-28 flex flex-col gap-6 md:gap-7 scrollbar-hidden",
        compact && "px-2 pt-4 pb-24 gap-4",
      )}
        style={{ touchAction: 'pan-y' }}>
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
                isTtsActive={ttsActiveMessageId === msg.id}
                onSpeak={handleSpeakMessage}
                onTtsRestart={handleTtsRestart}
                onTtsSpeedChange={handleTtsSpeedChange}
                onTypewriterDone={msg.role === 'assistant' && !msg.isOld ? () => handleTypewriterDone(msg.id) : undefined}
                showTtsControls={ttsControlsMessageId === msg.id && ttsActiveMessageId === msg.id && ttsPlaybackStatus !== 'idle'}
                ttsPlaybackSpeed={ttsPlaybackSpeed}
                ttsPlaybackError={ttsPlaybackError}
                ttsStatus={ttsActiveMessageId === msg.id ? ttsPlaybackStatus : 'idle'}
              />
            </div>
          );
        })}

        {/* Suggested questions — shown after typewriter finishes.
            Base (hardcoded) suggestions render immediately when ready;
            Extra (LLM) suggestions animate in alongside without re-mounting base. */}
        <AnimatePresence>
          {!isLoading && (() => {
            const lastAssistant = messages.findLast(m => m.role === 'assistant');
            return !!lastAssistant && readyForAssistantId === lastAssistant.id;
          })() && (baseSuggestions.length > 0 || extraSuggestions.length > 0 || matrixEscaped) && (
              <m.div
                key="suggestions-container"
                initial={SUGGESTIONS_CONTAINER_INITIAL}
                animate={SUGGESTIONS_CONTAINER_ANIMATE}
                exit={SUGGESTIONS_CONTAINER_EXIT}
                transition={SUGGESTIONS_CONTAINER_TRANSITION}
                className="flex flex-wrap justify-center gap-2 md:gap-3 mt-2"
              >
                {matrixEscaped && (
                  <MatrixEscapeChip
                    onSelect={handleEnterMatrix}
                    skipEntrance={!hasHadInteractionRef.current}
                  />
                )}
                {baseSuggestions.map((q, i) => (
                  <SuggestionStrip
                    key={q}
                    text={q}
                    isAction={ACTION_SUGGESTION_SET.has(q)}
                    onSelect={handleSuggestion}
                    index={i}
                    skipEntrance={!hasHadInteractionRef.current}
                  />
                ))}
                <AnimatePresence>
                  {extraSuggestions.map((q, i) => (
                    <SuggestionStrip
                      key={q}
                      text={q}
                      isAction={ACTION_SUGGESTION_SET.has(q)}
                      onSelect={handleSuggestion}
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

        {error && !rateLimitRemaining && (
          <ServiceErrorNote message={error} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area (isolated component to prevent keystroke re-renders) ─── */}
      <ChatInputArea
        onSend={handleSendFromInput}
        isLoading={isLoading}
        compact={compact}
        hasMessages={hasMessages}
        onClear={handleClearDesk}
      />
      </div>

    </div>
  );
}
