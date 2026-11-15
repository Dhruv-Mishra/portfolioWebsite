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

const RING_RATE: Partial<Record<VoiceAgentPhase, number>> = ORB.ringRate;

/** Three hand-drawn rings, each its own element so its rotation stays on the compositor. */
const RINGS = [
  'M50 12 C72 11 89 28 88 50 C87 73 70 88 49 88 C27 89 12 72 12 50 C13 29 29 13 53 13',
  'M86 47 C87 70 69 87 47 86 C26 85 13 68 14 47 C15 27 32 13 52 14 C71 15 85 30 85 52',
  'M30 19 C46 10 70 13 82 30 C93 47 88 71 70 82 C52 93 28 88 17 70 C8 54 13 33 33 18',
];

export default function VoiceOrb({ phase, reducedMotion, size = 'hero', showLabel = true }: VoiceOrbProps) {
  const levelRef = useRef<HTMLDivElement>(null);
  const flareRef = useRef<HTMLSpanElement>(null);
  const ringsRef = useRef<HTMLDivElement>(null);

  // Agent audio swells the orb through transform/opacity only, and the loop runs only while audible.
  useEffect(() => {
    const level = levelRef.current;
    const flare = flareRef.current;
    if (!level || !flare || reducedMotion) return;
    let target = 0;
    let smoothed = 0;
    let written = 0;
    let frame = 0;
    let last = 0;
    const write = (value: number) => {
      level.style.transform = value ? `scale(${1 + value * ORB.levelScale})` : '';
      flare.style.opacity = value ? String(value * ORB.flareOpacity) : '';
      written = value;
    };
    const tick = (now: number) => {
      const dt = Math.min(Math.max(now - last, 0), ORB.maxStepMs);
      last = now;
      const tau = target > smoothed ? ORB.attackMs : ORB.releaseMs;
      smoothed += (target - smoothed) * (1 - Math.exp(-dt / tau));
      if (target === 0 && smoothed < ORB.epsilon) {
        frame = 0;
        smoothed = 0;
        write(0);
        return;
      }
      if (Math.abs(smoothed - written) > ORB.epsilon) write(smoothed);
      frame = requestAnimationFrame(tick);
    };
    const onLevel = (value: number) => {
      target = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      if (frame || target === 0) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    onLevel(getVoicePlaybackLevel());
    const unsubscribe = subscribeVoicePlaybackLevel(onLevel);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      write(0);
    };
  }, [reducedMotion]);

  useEffect(() => {
    const rate = RING_RATE[phase] ?? 1;
    for (const animation of ringsRef.current?.getAnimations?.({ subtree: true }) ?? []) {
      animation.updatePlaybackRate(rate);
    }
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
      <span className="orb-glow" />
      <span ref={flareRef} className="orb-glow orb-flare" />
      <span className="orb-ripples"><span /><span /></span>
      <div ref={levelRef} className="orb-level">
        <div className="orb-body">
          <div ref={ringsRef} className="orb-rings">
            {RINGS.map(path => (
              <svg key={path} viewBox="0 0 100 100" aria-hidden="true"><path d={path} /></svg>
            ))}
          </div>
          <span className="orb-core" />
        </div>
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
