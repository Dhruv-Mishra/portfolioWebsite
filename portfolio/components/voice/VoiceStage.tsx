"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { m } from 'framer-motion';
import { MicOff, PhoneOff } from 'lucide-react';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ANIMATION_TOKENS, Z_INDEX } from '@/lib/designTokens';
import { cn } from '@/lib/utils';
import {
  enableVoiceCapture,
  getServerVoiceSessionSnapshot,
  getVoiceSessionSnapshot,
  requestVoiceHangup,
  subscribeVoiceSession,
} from '@/lib/voiceSessionRuntime';
import VoiceOrb from '@/components/voice/VoiceOrb';

const VEIL_FADE_MS = 420;
const REDUCED_VEIL_MS = 180;
const FLIP_MS = 520;

const DESKTOP_DOCK_STYLE = {
  left: 'max(1.25rem, env(safe-area-inset-left) + var(--c-binding-w) + 0.5rem)',
  bottom: 'max(1.25rem, env(safe-area-inset-bottom) + 1rem)',
} as const;

const MOBILE_DOCK_STYLE = {
  top: 'calc(env(safe-area-inset-top) + 4.25rem)',
  left: 'max(0.75rem, env(safe-area-inset-left) + 0.5rem)',
} as const;

export default function VoiceStage() {
  const snapshot = useSyncExternalStore(
    subscribeVoiceSession,
    getVoiceSessionSnapshot,
    getServerVoiceSessionSnapshot,
  );
  const reducedMotion = useEffectiveReducedMotion();
  const isMobile = useIsMobile();
  const leaveButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const orbSlotRef = useRef<HTMLDivElement>(null);
  const lastOrbRectRef = useRef<DOMRect | null>(null);

  const exiting = snapshot.hud === 'exiting';
  const intro = !exiting && (snapshot.hud === 'intro' || !snapshot.introComplete);
  const live = snapshot.hud === 'live' && snapshot.introComplete;
  const spoken = snapshot.lowNetwork
    ? ''
    : (snapshot.agentLine || snapshot.userLine).trim();
  const caption = exiting
    ? (snapshot.exitLine || snapshot.status)
    : (spoken || snapshot.status);
  const welcomeHint = snapshot.welcomeHint;

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    leaveButtonRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestVoiceHangup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useLayoutEffect(() => {
    const node = orbSlotRef.current;
    if (!node || reducedMotion || !live || !lastOrbRectRef.current) {
      lastOrbRectRef.current = node?.getBoundingClientRect() ?? null;
      return;
    }

    const first = lastOrbRectRef.current;
    const last = node.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / Math.max(last.width, 1);
    const sy = first.height / Math.max(last.height, 1);
    lastOrbRectRef.current = last;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02) return;

    node.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: 'none' },
      ],
      {
        duration: FLIP_MS,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      },
    );
  }, [live, reducedMotion, isMobile]);

  useLayoutEffect(() => {
    if (intro) {
      lastOrbRectRef.current = orbSlotRef.current?.getBoundingClientRect() ?? null;
    }
  }, [intro, snapshot.phase]);

  const hangup = (
    <button
      ref={leaveButtonRef}
      type="button"
      onClick={() => requestVoiceHangup()}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
      aria-label="Hang up voice call"
      title="Hang up"
    >
      <PhoneOff size={16} aria-hidden />
    </button>
  );

  const orb = (
    <m.div
      ref={orbSlotRef}
      className="origin-center"
      transition={{ type: 'spring', ...ANIMATION_TOKENS.spring.gentle, duration: 0.52 }}
    >
      <VoiceOrb
        phase={snapshot.phase}
        size={intro || exiting ? 'hero' : 'dock'}
        showLabel={intro || exiting}
      />
    </m.div>
  );

  return (
    <div
      role={intro || exiting ? 'dialog' : 'complementary'}
      aria-modal={intro || exiting ? true : undefined}
      aria-label="Voice agent"
      aria-labelledby={intro || exiting ? 'voice-stage-title' : undefined}
      className="pointer-events-none fixed inset-0 h-[100dvh]"
      style={{ zIndex: Z_INDEX.voice }}
    >
      <m.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: intro || exiting ? 1 : 0 }}
        transition={{
          duration: (reducedMotion ? REDUCED_VEIL_MS : VEIL_FADE_MS) / 1000,
          ease: 'easeOut',
        }}
        className={cn(
          'voice-stage-veil absolute inset-0 bg-black',
          intro || exiting ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        data-voice-veil={intro || exiting ? 'in' : 'out'}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(90,140,255,0.18),transparent_42%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.05),transparent_36%)]" />
      </m.div>

      {intro || exiting ? (
        <div className="pointer-events-none absolute inset-0 flex h-[100dvh] flex-col">
          <header className="relative flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
            <p id="voice-stage-title" className="font-hand text-sm uppercase tracking-[0.32em] text-white/45">Voice</p>
            <div className="pointer-events-auto">{hangup}</div>
          </header>
          <div className="relative flex flex-1 flex-col items-center justify-center px-6">
            {orb}
            <p
              role="status"
              aria-live="polite"
              className="voice-stage-caption mt-16 max-w-xl text-center font-hand text-xl leading-snug text-white/80 md:text-2xl"
            >
              {caption}
            </p>
            {snapshot.error ? (
              <p role="alert" className="mt-3 max-w-xl text-center font-hand text-sm text-rose-200/80">
                {snapshot.error}
              </p>
            ) : intro ? (
              <p className="mt-4 font-hand text-sm text-white/40">{welcomeHint}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="pointer-events-auto absolute flex max-w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-3"
          style={isMobile ? MOBILE_DOCK_STYLE : DESKTOP_DOCK_STYLE}
        >
          <div className="flex items-center gap-3">
            {orb}
            {hangup}
          </div>
          {snapshot.error ? (
            <p role="alert" className="max-w-[18rem] font-hand text-sm leading-snug text-rose-700 dark:text-rose-200">
              {snapshot.error}
            </p>
          ) : null}
          {spoken ? (
            <div
              role="status"
              aria-live="polite"
              data-subtitle-phase={snapshot.subtitlePhase}
              className="voice-dock-transcript flex max-h-[7.5rem] max-w-[min(24rem,calc(100vw-1.5rem))] flex-col justify-end overflow-hidden font-hand text-sm leading-snug text-[var(--c-ink)]"
            >
              <p className="whitespace-pre-wrap">{spoken}</p>
            </div>
          ) : null}
          {!snapshot.micLive ? (
            <button
              type="button"
              onClick={() => enableVoiceCapture()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 font-hand text-sm text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              <MicOff size={14} aria-hidden />
              Enable mic
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
