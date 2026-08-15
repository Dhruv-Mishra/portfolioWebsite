"use client";

import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { VoiceAgentPhase } from '@/lib/voiceAgentProtocol';
import { getVoicePlaybackLevel, subscribeVoicePlaybackLevel } from '@/lib/voiceAudio';

interface VoiceOrbProps {
  phase: VoiceAgentPhase;
  size?: 'hero' | 'dock';
  showLabel?: boolean;
}

const PHASE_LABEL: Record<VoiceAgentPhase, string> = {
  idle: 'Idle',
  entering: 'Switching',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  acting: 'Acting',
  exiting: 'Leaving',
  error: 'Unavailable',
};

function formatVoiceLevel(level: number): string {
  return (Math.round(Math.max(0, Math.min(1, level)) * 1000) / 1000).toFixed(3);
}

export default function VoiceOrb({ phase, size = 'hero', showLabel = true }: VoiceOrbProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    let pending = getVoicePlaybackLevel();

    const apply = (level: number) => {
      root.style.setProperty('--voice-level', formatVoiceLevel(level));
    };

    apply(pending);
    const unsubscribe = subscribeVoicePlaybackLevel(level => {
      pending = level;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply(pending);
      });
    });

    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-voice-orb-size={size}
      className={cn(
        'voice-orb relative grid place-items-center',
        size === 'hero' ? 'h-44 w-44 md:h-56 md:w-56' : 'h-16 w-16 md:h-[4.5rem] md:w-[4.5rem]',
      )}
      style={{ '--voice-level': formatVoiceLevel(0) } as CSSProperties}
      aria-hidden
    >
      <span className={cn('voice-orb-ripple voice-orb-ripple-a', `is-${phase}`)} />
      <span className={cn('voice-orb-ripple voice-orb-ripple-b', `is-${phase}`)} />
      <span className={cn('voice-orb-ripple voice-orb-ripple-c', `is-${phase}`)} />
      <span className={cn('voice-orb-ring voice-orb-ring-a', `is-${phase}`)} />
      <span className={cn('voice-orb-ring voice-orb-ring-b', `is-${phase}`)} />
      <span className={cn('voice-orb-ring voice-orb-ring-c', `is-${phase}`)} />
      <span className={cn('voice-orb-core', `is-${phase}`)}>
        <span className="voice-orb-core-glow" />
      </span>
      {showLabel ? (
        <span className={cn(
          'pointer-events-none absolute inset-x-0 text-center font-hand uppercase tracking-[0.28em] text-white/55',
          size === 'hero' ? '-bottom-8 text-sm' : '-bottom-5 text-[0.65rem] tracking-[0.18em]',
        )}
        >
          {PHASE_LABEL[phase]}
        </span>
      ) : null}
    </div>
  );
}
