"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { m } from 'framer-motion';
import { MicOff, Phone, RotateCcw } from 'lucide-react';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Z_INDEX } from '@/lib/designTokens';
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

const VEIL_FADE_MS = 420;
const REDUCED_VEIL_MS = 0;
const EXIT_TEARDOWN_MARGIN_MS = 160;
const EXIT_VEIL_FADE_MS = VOICE_EXIT_VEIL_MS - EXIT_TEARDOWN_MARGIN_MS;
const FLIP_MS = 520;

const DESKTOP_DOCK_STYLE = {
  left: 'max(6.5rem, env(safe-area-inset-left) + var(--c-binding-w-md) + 4rem)',
  bottom: 'max(1.25rem, env(safe-area-inset-bottom) + 1rem)',
} as const;

const MOBILE_DOCK_STYLE = {
  left: '50%',
  bottom: 'var(--c-mobile-floating-bottom)',
  transform: 'translateX(-50%)',
  alignItems: 'center',
} as const;

const CAPTION_LAYER_STYLE = {
  left: '50%',
  transform: 'translateX(-50%)',
} as const;

const MOBILE_CAPTION_BOTTOM = 'calc(var(--c-mobile-floating-bottom) + 5rem)';
const DESKTOP_CAPTION_BOTTOM = 'max(1.25rem, env(safe-area-inset-bottom) + 1rem)';

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
  const heroSlotRef = useRef<HTMLDivElement>(null);
  const dockSlotRef = useRef<HTMLDivElement>(null);
  const orbNodeRef = useRef<HTMLDivElement>(null);
  const lastOrbRectRef = useRef<DOMRect | null>(null);
  const orbAnimationRef = useRef<Animation | null>(null);
  const flipTargetRef = useRef<{
    slot: 'hero' | 'dock' | null;
    reducedMotion: boolean;
    isMobile: boolean;
  }>({ slot: null, reducedMotion: false, isMobile: false });

  const exiting = snapshot.hud === 'exiting';
  const intro = !exiting && (snapshot.hud === 'intro' || !snapshot.introComplete);
  const live = snapshot.hud === 'live' && snapshot.introComplete;
  const spoken = snapshot.lowNetwork
    ? ''
    : (snapshot.agentLine || snapshot.userLine).trim();
  const retryable = snapshot.recovery === 'retryable';
  const caption = exiting
    ? (snapshot.exitLine || snapshot.status)
    : (spoken || snapshot.status);
  const welcomeHint = snapshot.welcomeHint;
  const exitStartedWithVisibleVeil = exiting && !snapshot.introComplete;
  const showEnableMic = Boolean(
    !snapshot.micLive
    && !retryable
    && snapshot.error
    && /microphone|voice input/i.test(snapshot.error),
  );

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
    const targetSlot: 'hero' | 'dock' = live ? 'dock' : 'hero';
    const previousTarget = flipTargetRef.current;
    const slotChanged = previousTarget.slot !== targetSlot;
    const motionChanged = previousTarget.reducedMotion !== reducedMotion;
    const mobileChanged = previousTarget.isMobile !== isMobile;
    if (previousTarget.slot !== null && !slotChanged && !motionChanged && !mobileChanged) {
      return;
    }

    flipTargetRef.current = { slot: targetSlot, reducedMotion, isMobile };

    const activeAnimation = orbAnimationRef.current;
    if (activeAnimation) {
      activeAnimation.cancel();
      orbAnimationRef.current = null;
    }

    const slot = targetSlot === 'hero' ? heroSlotRef.current : dockSlotRef.current;
    const node = orbNodeRef.current;
    if (!slot || !node) return;

    const last = slot.getBoundingClientRect();
    node.style.left = `${last.left}px`;
    node.style.top = `${last.top}px`;
    node.style.width = `${last.width}px`;
    node.style.height = `${last.height}px`;

    if (reducedMotion || !lastOrbRectRef.current) {
      lastOrbRectRef.current = last;
      return;
    }

    const first = lastOrbRectRef.current;
    lastOrbRectRef.current = last;
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / Math.max(last.width, 1);
    const sy = first.height / Math.max(last.height, 1);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02) return;

    const animation = node.animate(
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
    orbAnimationRef.current = animation;
    const clearAnimation = () => {
      if (orbAnimationRef.current === animation) orbAnimationRef.current = null;
    };
    animation.addEventListener('finish', clearAnimation, { once: true });
    animation.addEventListener('cancel', clearAnimation, { once: true });
    return () => {
      if (orbAnimationRef.current !== animation) return;
      animation.cancel();
      orbAnimationRef.current = null;
    };
  }, [exiting, intro, live, reducedMotion, isMobile]);

  const hangup = (
    <button
      ref={leaveButtonRef}
      type="button"
      onClick={() => requestVoiceHangup()}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
      aria-label="Hang up voice call"
      title="Hang up"
    >
      <Phone size={17} aria-hidden className="rotate-[135deg]" />
    </button>
  );
  const retry = retryable ? (
    <button
      type="button"
      onClick={() => {
        void retryVoiceSession();
      }}
      className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 font-hand text-sm text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Try again"
      title="Try again"
    >
      <RotateCcw size={14} aria-hidden />
      Try again
    </button>
  ) : null;

  return (
    <div
      role={intro || exiting ? 'dialog' : 'complementary'}
      aria-modal={intro || exiting ? true : undefined}
      aria-label="Voice agent"
      aria-labelledby={intro || exiting ? 'voice-stage-title' : undefined}
      data-voice-stage
      className="pointer-events-none fixed inset-0 h-[100dvh]"
      style={{ zIndex: Z_INDEX.voice }}
    >
      <m.div
        aria-hidden
        className={cn(
          'voice-stage-veil absolute inset-0 bg-black',
          intro || exiting ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        data-veil={intro ? 'intro' : exiting ? 'exiting' : 'live'}
        data-veil-from={exitStartedWithVisibleVeil ? 'intro' : undefined}
        data-voice-veil={exiting ? 'exiting' : intro ? 'in' : 'out'}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(90,140,255,0.18),transparent_42%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.05),transparent_36%)]" />
      </m.div>

      {intro || exiting ? (
        <m.div
          initial={{
            opacity: reducedMotion
              ? 1
              : intro || exitStartedWithVisibleVeil
                ? (intro ? 0 : 1)
                : 0,
          }}
          animate={{
            opacity: reducedMotion
              ? 1
              : exiting
                ? (exitStartedWithVisibleVeil ? [1, 1, 0] : [0, 1, 1, 0])
                : 1,
          }}
          transition={{
            duration: (
              reducedMotion
                ? REDUCED_VEIL_MS
                : exiting
                  ? EXIT_VEIL_FADE_MS
                  : VEIL_FADE_MS
            ) / 1000,
            times: !reducedMotion && exiting
              ? (exitStartedWithVisibleVeil ? [0, 0.62, 1] : [0, 0.18, 0.62, 1])
              : undefined,
            ease: 'easeOut',
          }}
          className="pointer-events-none absolute inset-0 flex h-[100dvh] flex-col"
          data-voice-exit-chrome={exiting ? 'true' : undefined}
        >
          <header className="relative flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
            <p id="voice-stage-title" className="font-hand text-sm uppercase tracking-[0.32em] text-white/45">Voice</p>
            <div className="pointer-events-auto flex items-center gap-2">
              {retry}
              {hangup}
            </div>
          </header>
          <div className="relative flex flex-1 flex-col items-center justify-center px-6">
            <div
              ref={heroSlotRef}
              className="h-44 w-44 md:h-56 md:w-56"
              aria-hidden
            />
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
            {intro && showEnableMic ? (
              <button
                type="button"
                onClick={() => enableVoiceCapture()}
                className="pointer-events-auto mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 font-hand text-sm text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                <MicOff size={14} aria-hidden />
                Enable mic
              </button>
            ) : null}
          </div>
        </m.div>
      ) : (
        <>
          <div
            className="pointer-events-auto absolute flex flex-col gap-3"
            style={isMobile ? MOBILE_DOCK_STYLE : DESKTOP_DOCK_STYLE}
          >
            <div className="flex flex-row items-center gap-3">
              <div
                ref={dockSlotRef}
                className="h-16 w-16 md:h-20 md:w-20"
                aria-hidden
              />
              {retry}
              {hangup}
            </div>
          </div>
          <div
            className="pointer-events-none absolute flex w-[min(24rem,calc(100vw-2.5rem))] flex-col items-center gap-3 px-3"
            style={{
              ...CAPTION_LAYER_STYLE,
              bottom: isMobile ? MOBILE_CAPTION_BOTTOM : DESKTOP_CAPTION_BOTTOM,
            }}
          >
            {snapshot.error ? (
              <p role="alert" className="max-w-[18rem] text-center font-hand text-sm leading-snug text-rose-700 dark:text-rose-200">
                {snapshot.error}
              </p>
            ) : null}
            {spoken ? (
              <div
                role="status"
                aria-live="polite"
                data-subtitle-phase={snapshot.subtitlePhase}
                className="voice-dock-transcript flex max-h-[7.5rem] max-w-[min(24rem,calc(100vw-1.5rem))] flex-col justify-end overflow-hidden font-hand text-xs leading-snug text-[var(--c-ink)]"
              >
                <p className="whitespace-pre-wrap">{spoken}</p>
              </div>
            ) : null}
            {showEnableMic ? (
              <button
                type="button"
                onClick={() => enableVoiceCapture()}
                className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 font-hand text-sm text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                <MicOff size={14} aria-hidden />
                Enable mic
              </button>
            ) : null}
          </div>
        </>
      )}

      <m.div
        ref={orbNodeRef}
        className="pointer-events-none fixed origin-center"
        initial={{ opacity: 1 }}
        animate={{
          opacity: reducedMotion
            ? 1
            : exiting
              ? [1, 1, 0, 0]
              : 1,
        }}
        transition={{
          duration: (!reducedMotion && exiting ? EXIT_VEIL_FADE_MS : 0) / 1000,
          times: !reducedMotion && exiting ? [0, 0.18, 0.62, 1] : undefined,
          ease: 'easeOut',
        }}
        data-voice-exit-orb={exiting ? 'true' : undefined}
      >
        <VoiceOrb
          phase={snapshot.phase}
          reducedMotion={reducedMotion}
          size={intro || exiting ? 'hero' : 'dock'}
          showLabel={intro || exiting}
        />
      </m.div>
    </div>
  );
}
