"use client";

import { cn } from '@/lib/utils';
import type { VoiceAgentPhase } from '@/lib/voiceAgentProtocol';

interface VoiceOrbProps {
  phase: VoiceAgentPhase;
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

export default function VoiceOrb({ phase }: VoiceOrbProps) {
  return (
    <div className="relative mx-auto grid h-44 w-44 place-items-center md:h-56 md:w-56" aria-hidden>
      <span className={cn('voice-orb-ring voice-orb-ring-a', `is-${phase}`)} />
      <span className={cn('voice-orb-ring voice-orb-ring-b', `is-${phase}`)} />
      <span className={cn('voice-orb-core', `is-${phase}`)} />
      <span className="pointer-events-none absolute inset-x-0 -bottom-8 text-center font-hand text-sm tracking-[0.28em] uppercase text-white/55">
        {PHASE_LABEL[phase]}
      </span>
    </div>
  );
}
