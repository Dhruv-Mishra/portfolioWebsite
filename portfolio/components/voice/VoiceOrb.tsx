"use client";

import { useEffect, useRef, type CSSProperties } from 'react';
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

export default function VoiceOrb({ phase, reducedMotion, size = 'hero', showLabel = true }: VoiceOrbProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const setRipple = (value: number) => {
      root.style.setProperty('--voice-ripple', value.toFixed(3));
    };

    if (reducedMotion) {
      root.style.setProperty('--voice-level', formatVoiceLevel(0));
      setRipple(1);
      root.removeAttribute('data-voice-orb-speaking');
      return;
    }

    let frame = 0;
    let pending = getVoicePlaybackLevel();
    let rippleTimer = 0;
    const SPEAKING_LEVEL = 0.02;

    const pickRipple = () => 0.97 + Math.random() * 0.25;
    const stopRipple = () => {
      if (rippleTimer) {
        window.clearTimeout(rippleTimer);
        rippleTimer = 0;
      }
      setRipple(1);
    };
    const scheduleRipple = () => {
      setRipple(pickRipple());
      rippleTimer = window.setTimeout(scheduleRipple, 160 + Math.random() * 120);
    };

    const apply = (level: number) => {
      root.style.setProperty('--voice-level', formatVoiceLevel(level));
      const speakingNow = phase === 'speaking' || level > SPEAKING_LEVEL;
      const rippleNow = speakingNow || phase === 'acting';
      root.toggleAttribute('data-voice-orb-speaking', speakingNow);
      if (rippleNow) {
        if (!rippleTimer) scheduleRipple();
        return;
      }
      stopRipple();
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
      stopRipple();
    };
  }, [phase, reducedMotion]);

  return (
    <div
      ref={rootRef}
      data-voice-orb-size={size}
      className={cn(
        'voice-orb relative grid place-items-center',
        `is-${phase}`,
        size === 'hero' ? 'h-44 w-44 md:h-56 md:w-56' : 'h-16 w-16 md:h-20 md:w-20',
      )}
      style={{ '--voice-level': formatVoiceLevel(0) } as CSSProperties}
      aria-hidden
    >
      <span className={cn('voice-orb-halo', `is-${phase}`)} aria-hidden />
      <span className={cn('voice-orb-wash', `is-${phase}`)} aria-hidden />
      <div className={cn('voice-orb-media', `is-${phase}`)}>
        {reducedMotion ? (
          /* eslint-disable-next-line @next/next/no-img-element -- reduced-motion still must not use Next image optimization. */
          <img
            src="/voice/ai-ripple-still.webp"
            alt=""
            draggable={false}
            decoding="async"
            className={cn('voice-orb-still', `is-${phase}`)}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- looping GIF HUD must not use Next image optimization. */
          <img
            src="/voice/ai-ripple.gif"
            alt=""
            draggable={false}
            decoding="async"
            className={cn('voice-orb-gif', `is-${phase}`)}
          />
        )}
      </div>
      <span className={cn('voice-orb-sheen', `is-${phase}`)} aria-hidden />
      {showLabel ? (
        <span className={cn(
          'voice-orb-label pointer-events-none absolute inset-x-0 text-center font-hand uppercase tracking-[0.28em] text-white/55',
          size === 'hero' ? '-bottom-8 text-sm' : '-bottom-5 text-[0.65rem] tracking-[0.18em]',
        )}
        >
          {PHASE_LABEL[phase]}
        </span>
      ) : null}
    </div>
  );
}
