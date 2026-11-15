"use client";

import './voice-stage.css';
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { MicOff, Phone, RotateCcw } from 'lucide-react';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { VOICE_VEIL_TOKENS as VEIL, Z_INDEX } from '@/lib/designTokens';
import {
  enableVoiceCapture,
  getServerVoiceSessionSnapshot,
  getVoiceSessionSnapshot,
  requestVoiceHangup,
  retryVoiceSession,
  subscribeVoiceSession,
  VOICE_EXIT_VEIL_MS,
  VOICE_SUBTITLE_FADE_MS,
} from '@/lib/voiceSessionRuntime';
import VoiceOrb from '@/components/voice/VoiceOrb';

const STAGE_STYLE = {
  zIndex: Z_INDEX.voice,
  '--voice-veil-in': `${VEIL.introMs}ms`,
  '--voice-veil-out': `${VEIL.dockMs}ms`,
  '--voice-morph': `${VEIL.morphMs}ms`,
  '--voice-chrome-out': `${VEIL.introExitMs}ms`,
  '--voice-dock-out': `${VEIL.dockExitMs}ms`,
  '--voice-caption-fade': `${VOICE_SUBTITLE_FADE_MS}ms`,
  '--voice-farewell': `${VOICE_EXIT_VEIL_MS - VEIL.teardownMarginMs}ms`,
} as CSSProperties;

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]';
const PILL = `pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 font-hand text-sm text-white/85 ${FOCUS}`;
const HANGUP = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-md ${FOCUS}`;

export default function VoiceStage() {
  const snapshot = useSyncExternalStore(
    subscribeVoiceSession,
    getVoiceSessionSnapshot,
    getServerVoiceSessionSnapshot,
  );
  const reducedMotion = useEffectiveReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const dockOrbRef = useRef<HTMLDivElement>(null);
  const modalHangupRef = useRef<HTMLButtonElement>(null);
  const dockHangupRef = useRef<HTMLButtonElement>(null);
  const wasModalRef = useRef(false);

  const exiting = snapshot.hud === 'exiting';
  const intro = !exiting && (snapshot.hud === 'intro' || !snapshot.introComplete);
  // The intro is a full-screen veil; an exit that starts there fades out in place.
  const modal = intro || (exiting && !snapshot.introComplete);
  const spoken = snapshot.lowNetwork ? '' : (snapshot.agentLine || snapshot.userLine).trim();
  const retryable = !exiting && snapshot.recovery === 'retryable';
  const caption = exiting ? (snapshot.exitLine || snapshot.status) : (spoken || snapshot.status);
  const showEnableMic = Boolean(
    !exiting && !snapshot.micLive && !retryable && snapshot.error
    && /microphone|voice input/i.test(snapshot.error),
  );

  // When the intro hands over to the dock, fly the dock orb in from where the hero orb was.
  useLayoutEffect(() => {
    const wasModal = wasModalRef.current;
    wasModalRef.current = modal;
    const hero = heroRef.current;
    const dock = dockOrbRef.current;
    if (modal || !wasModal || reducedMotion || !hero || !dock) return;
    const from = hero.getBoundingClientRect();
    const to = dock.getBoundingClientRect();
    const dx = from.x + from.width / 2 - to.x - to.width / 2;
    const dy = from.y + from.height / 2 - to.y - to.height / 2;
    const animation = dock.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})` }, { transform: 'none' }],
      { duration: VEIL.morphMs, easing: VEIL.morphEasing },
    );
    return () => animation.cancel();
  }, [modal, reducedMotion]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    (modal ? modalHangupRef : dockHangupRef).current?.focus();
  }, [modal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A live call leaves the page usable, so Escape belongs to the page unless focus is in the dock.
      if (!modal && !stageRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      requestVoiceHangup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  const hangup = (ref: RefObject<HTMLButtonElement | null>) => (
    <button
      ref={ref}
      type="button"
      onClick={() => requestVoiceHangup()}
      className={HANGUP}
      aria-label="Hang up voice call"
      title="Hang up"
    >
      <Phone size={17} aria-hidden className="rotate-[135deg]" />
    </button>
  );
  const retry = retryable ? (
    <button type="button" onClick={() => { void retryVoiceSession(); }} className={PILL}>
      <RotateCcw size={14} aria-hidden />
      Try again
    </button>
  ) : null;
  const enableMic = showEnableMic ? (
    <button type="button" onClick={() => enableVoiceCapture()} className={PILL}>
      <MicOff size={14} aria-hidden />
      Enable mic
    </button>
  ) : null;

  return (
    <div
      ref={stageRef}
      role={modal ? 'dialog' : 'complementary'}
      aria-modal={modal || undefined}
      aria-label="Voice agent"
      aria-labelledby={modal ? 'voice-stage-title' : undefined}
      data-voice-stage
      data-veil={exiting ? 'exiting' : intro ? 'intro' : 'live'}
      className="pointer-events-none fixed inset-0 h-[100dvh]"
      style={STAGE_STYLE}
    >
      <div aria-hidden className="voice-stage-veil absolute inset-0" />

      {modal ? null : (
        <div aria-hidden className="voice-edge-halo absolute inset-0" data-phase={snapshot.phase}>
          <span><span className="calm" /><span className="act" /></span>
          <span><span className="calm" /><span className="act" /></span>
        </div>
      )}

      {/* Stays mounted after the intro so its text fades out instead of vanishing. */}
      <div className="voice-stage-chrome absolute inset-0 flex h-[100dvh] flex-col" inert={!modal}>
        <header className="relative flex items-center justify-between gap-4 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
          <p id="voice-stage-title" className="font-hand text-base text-white/70">On a call with AI Dhruv</p>
          <div className="pointer-events-auto flex items-center gap-2">{modal ? retry : null}{hangup(modalHangupRef)}</div>
        </header>
        <div className="relative flex flex-1 flex-col items-center justify-center px-6">
          <div ref={heroRef} className="voice-hero-orb h-44 w-44 md:h-56 md:w-56">
            {modal ? <VoiceOrb phase={snapshot.phase} reducedMotion={reducedMotion} /> : null}
          </div>
          <p role="status" aria-live="polite" className="voice-stage-caption mt-16 max-w-xl text-center font-body text-xl leading-snug text-white/80 md:text-2xl">
            {caption}
          </p>
          {exiting ? null : snapshot.error ? (
            modal ? <p role="alert" className="mt-3 max-w-xl text-center font-body text-sm text-rose-200/80">{snapshot.error}</p> : null
          ) : (
            <p className="mt-4 text-center font-hand text-sm text-white/65">{snapshot.welcomeHint}</p>
          )}
          {modal && enableMic ? <div className="mt-5">{enableMic}</div> : null}
        </div>
      </div>

      {modal ? null : (
        <>
          <div className="voice-live-dock pointer-events-auto absolute flex items-center gap-3">
            <div ref={dockOrbRef} className="voice-dock-orb"><VoiceOrb phase={snapshot.phase} reducedMotion={reducedMotion} size="dock" showLabel={false} /></div>
            <div className="voice-dock-controls flex items-center gap-3">{retry}{hangup(dockHangupRef)}</div>
          </div>
          <div className="voice-live-captions pointer-events-none absolute flex w-[min(24rem,calc(100vw-1.5rem))] flex-col items-end gap-3">
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
