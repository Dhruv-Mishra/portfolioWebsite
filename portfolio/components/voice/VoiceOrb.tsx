"use client";

import { cn } from '@/lib/utils';
import type { VoiceAgentPhase } from '@/lib/voiceAgentProtocol';

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

export default function VoiceOrb({ phase, size = 'hero', showLabel = true }: VoiceOrbProps) {
  return (
    <div
      data-voice-orb-size={size}
      className={cn(
        'relative grid place-items-center',
        size === 'hero' ? 'h-44 w-44 md:h-56 md:w-56' : 'h-16 w-16 md:h-[4.5rem] md:w-[4.5rem]',
      )}
      aria-hidden
    >
      <span className={cn('voice-orb-ripple voice-orb-ripple-a', `is-${phase}`)} />
      <span className={cn('voice-orb-ripple voice-orb-ripple-b', `is-${phase}`)} />
      <span className={cn('voice-orb-ring voice-orb-ring-a', `is-${phase}`)} />
      <span className={cn('voice-orb-ring voice-orb-ring-b', `is-${phase}`)} />
      <span className={cn('voice-orb-core', `is-${phase}`)} />
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
