"use client";

import './voice-stage.css';
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { MicOff, Phone, RotateCcw } from 'lucide-react';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { VOICE_VEIL_TOKENS as VEIL, Z_INDEX } from '@/lib/designTokens';
import { cn } from '@/lib/utils';
import {
  enableVoiceCapture,
  getServerVoiceSessionSnapshot,
  getVoiceSessionSnapshot,
  requestVoiceHangup,
  retryVoiceSession,
  subscribeVoiceSession,
  VOICE_EXIT_VEIL_MS,
} from '@/lib/voiceSessionRuntime';
import VoiceOrb from '@/components/voice/VoiceOrb';

const STAGE_STYLE = {
  zIndex: Z_INDEX.voice,
  '--voice-veil-intro': `${VEIL.introMs}ms`,
  '--voice-veil-dock': `${VEIL.dockMs}ms`,
  '--voice-orb-morph': `${VEIL.morphMs}ms`,
  '--voice-intro-exit': `${VEIL.introExitMs}ms`,
  '--voice-dock-exit': `${VEIL.dockExitMs}ms`,
  '--voice-exit-duration': `${VOICE_EXIT_VEIL_MS - VEIL.teardownMarginMs}ms`,
} as CSSProperties;

const DESKTOP_DOCK_STYLE = {
  right: 'max(1.25rem, calc(env(safe-area-inset-right, 0px) + 1rem))',
  bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))',
} as const;

const MOBILE_DOCK_STYLE = {
  right: 'max(0.75rem, calc(env(safe-area-inset-right, 0px) + 0.5rem))',
  bottom: 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))',
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
  const heroRectRef = useRef<DOMRect | null>(null);
  const dockOrbRef = useRef<HTMLDivElement>(null);

  const exiting = snapshot.hud === 'exiting';
  const intro = !exiting && (snapshot.hud === 'intro' || !snapshot.introComplete);
  const exitFromIntro = exiting && !snapshot.introComplete;
  const introChrome = intro || exitFromIntro;
  const spoken = snapshot.lowNetwork ? '' : (snapshot.agentLine || snapshot.userLine).trim();
  const retryable = !exiting && snapshot.recovery === 'retryable';
  const caption = exiting ? (snapshot.exitLine || snapshot.status) : (spoken || snapshot.status);
  const dockStyle = isMobile ? MOBILE_DOCK_STYLE : DESKTOP_DOCK_STYLE;
  const veil = exiting ? 'exiting' : intro ? 'intro' : 'live';
  const showEnableMic = Boolean(
    !exiting && !snapshot.micLive && !retryable && snapshot.error
    && /microphone|voice input/i.test(snapshot.error),
  );

  const rememberHero = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    return () => { heroRectRef.current = node.getBoundingClientRect(); };
  }, []);

  useLayoutEffect(() => {
    const node = dockOrbRef.current;
    const hero = heroRectRef.current;
    if (introChrome || reducedMotion || !node || !hero || !node.animate) return;
    heroRectRef.current = null;
    const dock = node.getBoundingClientRect();
    const animation = node.animate([
      { transform: `translate(${hero.x + hero.width / 2 - dock.x - dock.width / 2}px, ${hero.y + hero.height / 2 - dock.y - dock.height / 2}px) scale(${hero.width / dock.width})` },
      { transform: 'none' },
    ], { duration: VEIL.morphMs, easing: VEIL.morphEasing });
    return () => animation.cancel();
  }, [introChrome, reducedMotion]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { previousFocusRef.current?.focus(); };
  }, []);

  useEffect(() => { leaveButtonRef.current?.focus(); }, [introChrome]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestVoiceHangup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const hangup = (
    <button
      ref={leaveButtonRef}
      type="button"
      onClick={() => requestVoiceHangup()}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]"
      aria-label="Hang up voice call"
      title="Hang up"
    >
      <Phone size={17} aria-hidden className="rotate-[135deg]" />
    </button>
  );
  const retry = retryable ? (
    <button
      type="button"
      onClick={() => { void retryVoiceSession(); }}
      className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 font-hand text-sm text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]"
    >
      <RotateCcw size={14} aria-hidden />
      Try again
    </button>
  ) : null;
  const enableMic = showEnableMic ? (
    <button
      type="button"
      onClick={() => enableVoiceCapture()}
      className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 font-hand text-sm text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]"
    >
      <MicOff size={14} aria-hidden />
      Enable mic
    </button>
  ) : null;

  return (
    <div
      role={introChrome ? 'dialog' : 'complementary'}
      aria-modal={introChrome ? true : undefined}
      aria-label="Voice agent"
      aria-labelledby={introChrome ? 'voice-stage-title' : undefined}
      data-voice-stage
      data-veil={veil}
      data-veil-from={exiting ? (exitFromIntro ? 'intro' : 'live') : undefined}
      className="pointer-events-none fixed inset-0 h-[100dvh]"
      style={STAGE_STYLE}
    >
      <div
        aria-hidden
        className={cn('voice-stage-veil absolute inset-0', intro ? 'pointer-events-auto' : 'pointer-events-none')}
        data-veil={veil}
        data-veil-from={exitFromIntro ? 'intro' : undefined}
        data-voice-veil={exiting ? 'exiting' : intro ? 'in' : 'out'}
      />

      {!introChrome ? (
        <div aria-hidden className="voice-edge-halo absolute inset-0" data-phase={snapshot.phase}>
          <span data-edge="right"><span className="calm" /><span className="act" /></span>
          <span data-edge="left"><span className="calm" /><span className="act" /></span>
        </div>
      ) : null}

      {introChrome ? (
        <div className="voice-stage-chrome pointer-events-none absolute inset-0 flex h-[100dvh] flex-col" data-veil={veil}>
          <header className="relative flex items-center justify-between gap-4 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
            <p id="voice-stage-title" className="font-hand text-base text-white/70">On a call with AI Dhruv</p>
            <div className="pointer-events-auto flex items-center gap-2">{retry}{hangup}</div>
          </header>
          <div className="relative flex flex-1 flex-col items-center justify-center px-6">
            <div ref={rememberHero} className="voice-hero-orb">
              <VoiceOrb phase={snapshot.phase} reducedMotion={reducedMotion} />
            </div>
            <p role="status" aria-live="polite" className="voice-stage-caption mt-16 max-w-xl text-center font-body text-xl leading-snug text-white/80 md:text-2xl">
              {caption}
            </p>
            {snapshot.error && !exiting ? (
              <p role="alert" className="mt-3 max-w-xl text-center font-body text-sm text-rose-200/80">{snapshot.error}</p>
            ) : intro ? (
              <p className="mt-4 text-center font-hand text-sm text-white/65">{snapshot.welcomeHint}</p>
            ) : null}
            {enableMic ? <div className="mt-5">{enableMic}</div> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="voice-live-dock pointer-events-auto absolute" style={dockStyle}>
            <div className="flex items-center gap-3">
              <div ref={dockOrbRef}><VoiceOrb phase={snapshot.phase} reducedMotion={reducedMotion} size="dock" showLabel={false} /></div>
              <div className="voice-dock-controls flex items-center gap-3">{retry}{hangup}</div>
            </div>
          </div>
          <div
            className="voice-live-captions pointer-events-none absolute flex w-[min(24rem,calc(100vw-1.5rem))] flex-col items-end gap-3"
            style={{ right: dockStyle.right, bottom: `calc(${dockStyle.bottom} + 5.5rem)` }}
          >
            {snapshot.error && !exiting ? (
              <p role="alert" className="max-w-[18rem] text-right font-body text-sm leading-snug text-rose-700 dark:text-rose-200">{snapshot.error}</p>
            ) : null}
            {spoken || exiting ? (
              <div
                role="status"
                aria-live="polite"
                data-subtitle-phase={exiting ? 'visible' : snapshot.subtitlePhase}
                className="voice-dock-transcript flex max-h-[7.5rem] flex-col justify-end overflow-hidden font-body text-sm leading-snug text-[var(--c-ink)]"
              >
                <p className="whitespace-pre-wrap">{exiting ? caption : spoken}</p>
              </div>
            ) : null}
            {enableMic}
          </div>
        </>
      )}
    </div>
  );
}
