"use client";

import { useEffect, useRef } from 'react';
import { VOICE_ORB_TOKENS as ORB } from '@/lib/designTokens';
import { cn } from '@/lib/utils';
import type { VoiceAgentPhase } from '@/lib/voiceAgentProtocol';
import { getVoicePlaybackLevel, subscribeVoicePlaybackLevel } from '@/lib/voiceAudio';

interface VoiceOrbProps {
  phase: VoiceAgentPhase;
  reducedMotion: boolean;
  size?: 'hero' | 'dock';
  showLabel?: boolean;
}

const PHASE_LABEL: Record<VoiceAgentPhase, string> = {
  idle: 'Listening',
  entering: 'Connecting',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  acting: 'Doing that now',
  exiting: 'Call ended',
  error: "Can't connect",
};

export default function VoiceOrb({ phase, reducedMotion, size = 'hero', showLabel = true }: VoiceOrbProps) {
  const levelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const level = levelRef.current;
    const glow = glowRef.current;
    if (!level || !glow || reducedMotion || (phase !== 'speaking' && phase !== 'acting')) return;

    let target = getVoicePlaybackLevel();
    let smoothed = 0;
    let lastWritten = -1;
    let lastTime = performance.now();
    const unsubscribe = subscribeVoicePlaybackLevel(value => { target = value; });
    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      const value = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
      const tau = value > smoothed ? ORB.attackMs : ORB.releaseMs;
      smoothed += (value - smoothed) * (1 - Math.exp(-dt / tau));
      if (Math.abs(smoothed - lastWritten) > ORB.epsilon) {
        level.style.transform = `scale(${1 + smoothed * ORB.coreScale})`;
        glow.style.opacity = String(ORB.glowMin + smoothed * ORB.glowRange);
        lastWritten = smoothed;
      }
      frame = requestAnimationFrame(tick);
    };
    let frame = requestAnimationFrame(tick);

    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      level.style.removeProperty('transform');
      glow.style.removeProperty('opacity');
    };
  }, [phase, reducedMotion]);

  return (
    <div
      data-phase={phase}
      data-size={size}
      className={cn(
        'voice-orb relative grid place-items-center',
        size === 'hero' ? 'h-44 w-44 md:h-56 md:w-56' : 'h-16 w-16 md:h-18 md:w-18',
      )}
      aria-hidden
    >
      <span ref={glowRef} className="orb-glow" />
      <span className="orb-ripple" />
      <span className="orb-ripple" />
      <div ref={levelRef} className="orb-level">
        <svg className="orb-ink" viewBox="0 0 100 100" aria-hidden="true">
          <g className="r1"><path d="M50 12 C72 11 89 28 88 50 C87 73 70 88 49 88 C27 89 12 72 12 50 C13 29 29 13 53 13" /></g>
          <g className="r2"><path d="M86 47 C87 70 69 87 47 86 C26 85 13 68 14 47 C15 27 32 13 52 14 C71 15 85 30 85 52" /></g>
          <g className="r3"><path d="M30 19 C46 10 70 13 82 30 C93 47 88 71 70 82 C52 93 28 88 17 70 C8 54 13 33 33 18" /></g>
        </svg>
        <span className="orb-core" />
      </div>
      {showLabel ? (
        <span className={cn(
          'voice-orb-label pointer-events-none absolute inset-x-0 text-center font-hand text-white/70',
          size === 'hero' ? '-bottom-8' : '-bottom-6',
        )}>
          {PHASE_LABEL[phase]}
        </span>
      ) : null}
    </div>
  );
}
