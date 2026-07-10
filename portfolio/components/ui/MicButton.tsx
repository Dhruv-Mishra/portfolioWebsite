"use client";

import { Loader2, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

interface MicButtonProps {
  isListening: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: number;
  className?: string;
  title?: string;
  /** True while the Whisper model is downloading on first use. */
  isLoading?: boolean;
  /** True while Whisper is post-processing the captured audio. */
  isTranscribing?: boolean;
  /** True while the browser permission prompt is pending. */
  isRequestingPermission?: boolean;
  /** First-load model download progress (0-1), shown while `isLoading`. */
  loadProgress?: number;
}

/**
 * Sketchbook-styled mic toggle. Tap once to start, tap again to stop.
 *
 * Visual states:
 *  - idle      → outline mic icon
 *  - listening → filled red mic + pulsing ring
 *  - loading   → spinner (Whisper model downloading; tap stops + cancels)
 *  - transcribing → spinner (Whisper post-processing)
 */
export function MicButton({
  isListening,
  onClick,
  disabled = false,
  size = 18,
  className,
  title,
  isLoading = false,
  isTranscribing = false,
  isRequestingPermission = false,
  loadProgress = 0,
}: MicButtonProps) {
  const busy = isLoading || isTranscribing || isRequestingPermission;

  const computedTitle = title ?? (
    isTranscribing ? 'Transcribing your audio…' :
    isRequestingPermission ? 'Waiting for microphone permission…' :
    isLoading ? `Loading voice model… ${Math.round(loadProgress * 100)}%` :
    isListening ? 'Tap to stop' :
    'Tap to dictate'
  );
  const ariaLabel =
    isTranscribing ? 'Transcribing audio' :
    isRequestingPermission ? 'Waiting for microphone permission' :
    isLoading ? 'Loading voice model' :
    isListening ? 'Stop voice input' :
    'Start voice input';

  return (
    <Tooltip label={computedTitle}>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isTranscribing || isRequestingPermission}
      aria-label={ariaLabel}
      aria-pressed={isListening}
      aria-busy={busy || undefined}
      title={computedTitle}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0',
        'min-w-[44px] min-h-[44px] p-2 rounded-full',
        'transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/60',
        isListening
          ? 'text-red-600 dark:text-red-400 bg-red-100/60 dark:bg-red-950/30'
          : busy
            ? 'text-[var(--c-ink)]/70 bg-[var(--c-ink)]/5'
            : 'text-[var(--c-ink)]/60 hover:text-[var(--c-ink)] hover:bg-[var(--c-ink)]/5',
        (disabled || isTranscribing || isRequestingPermission) && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      {isListening && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 rounded-full bg-red-500/30 animate-ping"
        />
      )}
      {busy ? (
        <Loader2 size={size} className="relative animate-spin" aria-hidden="true" />
      ) : (
        <Mic size={size} className="relative" aria-hidden="true" />
      )}
    </button>
    </Tooltip>
  );
}
