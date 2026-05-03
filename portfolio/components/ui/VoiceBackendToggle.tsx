"use client";

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceBackendPref } from '@/lib/voiceBackendPref';
import { Tooltip } from '@/components/ui/Tooltip';

interface VoiceBackendToggleProps {
  /** True while the Whisper model is currently downloading. */
  isLoading?: boolean;
  /** First-load model download progress (0-1). */
  loadProgress?: number;
  /** Compact (chat) sizing. */
  compact?: boolean;
  className?: string;
  /**
   * Optional intercept hook. When provided, the parent owns the toggle
   * action (e.g. to surface a confirmation modal explaining the ~35MB
   * one-time download before enabling). Called with the *next* state.
   * If omitted, the toggle flips state immediately.
   */
  onToggleIntercept?: (nextActive: boolean) => void;
}

/**
 * Tiny "HD" pill toggle next to the mic button. Lights up when the user
 * has opted into the offline Whisper backend. First tap triggers a
 * one-time ~35MB model download (multilingual whisper-tiny); cached in
 * IndexedDB afterwards. Subsequent sessions are instant.
 */
export function VoiceBackendToggle({
  isLoading = false,
  loadProgress = 0,
  compact = false,
  className,
  onToggleIntercept,
}: VoiceBackendToggleProps) {
  const { pref, togglePref } = useVoiceBackendPref();
  const active = pref === 'whisper';
  const showLoading = active && isLoading;
  const handleClick = onToggleIntercept
    ? () => onToggleIntercept(!active)
    : togglePref;

  const title = showLoading
    ? `Loading HD voice model… ${Math.round(loadProgress * 100)}%`
    : active
      ? 'HD voice (offline Whisper) — tap to switch back to native'
      : 'Multilingual offline transcription (one-time ~35MB download)';

  return (
    <Tooltip label={title}>
    <span className={cn('inline-flex flex-col items-center justify-center shrink-0', compact ? 'gap-0' : 'gap-0.5')}>
    <button
      type="button"
      onClick={handleClick}
      role="switch"
      aria-checked={active}
      aria-label={active ? 'Disable HD voice (Whisper)' : 'Enable HD voice (Whisper, ~35MB one-time download)'}
      title={title}
      className={cn(
        'group relative inline-flex items-center shrink-0 select-none',
        'rounded-full font-hand font-bold tracking-wide',
        'border-2 border-dashed transition-colors duration-200',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/60',
        // Sketchbook switch — paper background w/ ink border, knob slides
        // when active. Sized for ≥36px tap target on mobile via outer hit
        // (the parent flex `gap-2` absorbs spacing) without bloating
        // visual footprint.
        compact ? 'h-4 w-8 px-0.5' : 'h-5 w-10 px-0.5',
        active
          ? 'bg-amber-200/70 border-amber-700/70 dark:bg-amber-500/30 dark:border-amber-400/70'
          : 'bg-[var(--c-paper)] border-[var(--c-ink)]/30 hover:border-[var(--c-ink)]/55',
        className,
      )}
    >
      {/* Loading spinner overlays the knob position when downloading the
          Whisper model so the user sees something is happening. */}
      {showLoading && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 flex items-center justify-center pointer-events-none',
            active ? 'pl-1.5' : 'pr-1.5',
          )}
        >
          <Loader2 size={compact ? 8 : 10} className="animate-spin" />
        </span>
      )}
      {/* Sliding knob — sketchbook ink dot. */}
      <span
        aria-hidden="true"
        className={cn(
          'inline-block rounded-full shadow-sm transition-transform duration-200 ease-out',
          compact ? 'h-2.5 w-2.5' : 'h-3 w-3',
          active
            ? (compact ? 'translate-x-[16px] bg-amber-700 dark:bg-amber-300' : 'translate-x-[20px] bg-amber-700 dark:bg-amber-300')
            : 'translate-x-0 bg-[var(--c-ink)]/40',
        )}
      />
    </button>
    {/* Tiny caption clarifies what the switch controls — a 'HD' pill
        on its own gives users no idea what they're toggling. */}
    <span
      aria-hidden="true"
      className={cn(
        'font-hand leading-tight text-[var(--c-ink)]/60 select-none whitespace-nowrap text-center',
        compact ? 'text-[10px] mt-0.5' : 'text-[11px]',
      )}
    >
      Local Transcription
    </span>
    </span>
    </Tooltip>
  );
}
