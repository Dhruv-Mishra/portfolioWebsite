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
}: VoiceBackendToggleProps) {
  const { pref, togglePref } = useVoiceBackendPref();
  const active = pref === 'whisper';
  const showLoading = active && isLoading;

  const title = showLoading
    ? `Loading HD voice model… ${Math.round(loadProgress * 100)}%`
    : active
      ? 'HD voice (offline Whisper) — tap to switch back to native'
      : 'Multilingual offline transcription (one-time ~35MB download)';

  return (
    <Tooltip label={title}>
    <button
      type="button"
      onClick={togglePref}
      aria-label={active ? 'Disable HD voice (Whisper)' : 'Enable HD voice (Whisper, ~35MB one-time download)'}
      aria-pressed={active}
      title={title}
      className={cn(
        'inline-flex items-center justify-center shrink-0 select-none',
        'rounded-full font-hand font-bold tracking-wide',
        'border transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/60',
        compact ? 'h-6 min-w-[28px] px-1.5 text-[10px]' : 'h-7 min-w-[32px] px-2 text-[11px]',
        active
          ? 'bg-amber-400/90 text-amber-950 border-amber-600 shadow-sm'
          : 'bg-transparent text-[var(--c-ink)]/45 border-[var(--c-ink)]/25 hover:text-[var(--c-ink)]/80 hover:border-[var(--c-ink)]/45',
        className,
      )}
    >
      {showLoading ? (
        <Loader2 size={compact ? 10 : 12} className="animate-spin" aria-hidden="true" />
      ) : (
        <span aria-hidden="true">HD</span>
      )}
    </button>
    </Tooltip>
  );
}
