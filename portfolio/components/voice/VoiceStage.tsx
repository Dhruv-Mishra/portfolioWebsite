"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { m } from 'framer-motion';
import { MicOff, PhoneOff } from 'lucide-react';
import { useDiscoActive } from '@/hooks/useStickers';
import { Z_INDEX } from '@/lib/designTokens';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import { executeSiteTool } from '@/lib/siteToolExecutor';
import { createGeminiLiveCaller } from '@/lib/geminiLiveAdapter';
import { createVoicePlayback, startVoiceCapture } from '@/lib/voiceAudio';
import { getVoiceAgentPrefsSnapshot } from '@/lib/voiceAgentPrefs';
import { playVoiceSound, prefetchVoiceSounds, startVoiceAmbient, stopVoiceAmbient } from '@/lib/voiceSounds';
import type { VoiceAgentPhase, VoiceExitReason, VoiceSessionHandle } from '@/lib/voiceAgentProtocol';
import { VOICE_WELCOME_HINT } from '@/lib/voiceAgentProtocol';
import VoiceOrb from '@/components/voice/VoiceOrb';

interface VoiceStageProps {
  onReady: () => void;
  onExitComplete: () => void;
  requestedExit: VoiceExitReason | null;
}

async function voiceSessionStartError(response: Response): Promise<string> {
  if (response.status === 429) {
    try {
      const payload = await response.json() as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      // Keep the generic warming-up copy when the body is missing or invalid.
    }
    return 'Voice session is warming up. Try again shortly.';
  }
  if (response.status === 403) {
    return 'This origin is not allowed to start a voice session.';
  }
  return 'Unable to start voice session.';
}

export default function VoiceStage({ onReady, onExitComplete, requestedExit }: VoiceStageProps) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const discoActive = useDiscoActive();
  const [phase, setPhase] = useState<VoiceAgentPhase>('entering');
  const [status, setStatus] = useState('Switching to agent experience');
  const [userLine, setUserLine] = useState('');
  const [agentLine, setAgentLine] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [micLive, setMicLive] = useState(false);
  const callerRef = useRef(createGeminiLiveCaller());
  const playbackRef = useRef(createVoicePlayback());
  const captureRef = useRef<{ stop: () => void } | null>(null);
  const exitingRef = useRef(false);
  const sendAudioLiveRef = useRef(false);
  const leaveButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousPhaseRef = useRef<VoiceAgentPhase>('entering');
  const prefsRef = useRef(getVoiceAgentPrefsSnapshot());
  const discoActiveRef = useRef(discoActive);
  const resolvedThemeRef = useRef(resolvedTheme);

  useEffect(() => {
    discoActiveRef.current = discoActive;
    resolvedThemeRef.current = resolvedTheme;
  }, [discoActive, resolvedTheme]);

  const leave = useCallback(async (reason: VoiceExitReason) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    sendAudioLiveRef.current = false;
    setPhase('exiting');
    setStatus(reason === 'health' ? 'Connection faded. Returning to notes.' : 'Leaving voice mode.');
    playVoiceSound('voice-exit');
    stopVoiceAmbient();
    setMicLive(false);
    captureRef.current?.stop();
    captureRef.current = null;
    playbackRef.current.close();
    callerRef.current.close(reason);
    window.setTimeout(() => {
      onExitComplete();
    }, 900);
  }, [onExitComplete]);

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
      void leave('user');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leave]);

  useEffect(() => {
    if (phase === 'listening' && previousPhaseRef.current !== 'listening') {
      playVoiceSound('voice-listen');
    }
    previousPhaseRef.current = phase;
  }, [phase]);

  const startCapture = useCallback(async () => {
    const capture = await startVoiceCapture(chunk => {
      if (sendAudioLiveRef.current) callerRef.current.sendAudio(chunk);
    }, { lowNetwork: prefsRef.current.lowNetwork });
    captureRef.current?.stop();
    captureRef.current = capture;
    setMicLive(true);
    return capture;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const prefs = getVoiceAgentPrefsSnapshot();
    prefsRef.current = prefs;
    prefetchVoiceSounds();
    playVoiceSound('voice-enter');
    if (prefs.ambientMusic && !prefs.lowNetwork) startVoiceAmbient(true);

    const caller = callerRef.current;
    const playback = playbackRef.current;
    const unsubs = [
      caller.on('phase', next => {
        if (!cancelled) setPhase(next);
      }),
      caller.on('userTranscript', text => {
        if (!cancelled) setUserLine(current => `${current}${text}`.slice(-180));
      }),
      caller.on('agentTranscript', text => {
        if (!cancelled) setAgentLine(current => `${current}${text}`.slice(-220));
      }),
      caller.on('audio', chunk => playback.play(chunk)),
      caller.on('interrupted', () => playback.interrupt()),
      caller.on('toolCall', async call => {
        playVoiceSound('voice-action');
        const result = await executeSiteTool(call, {
          router,
          setTheme: next => setTheme(next),
          resolvedTheme: resolvedThemeRef.current,
          discoActive: discoActiveRef.current,
          openFeedback: () => window.dispatchEvent(new CustomEvent('open-feedback')),
          openProject: () => requestPageTurnNavigation(router, { href: '/projects', mode: 'push' }),
        });
        caller.sendToolResult(call.id, result, call.name);
      }),
      caller.on('error', message => {
        if (!cancelled) {
          setError(message);
          setPhase('error');
        }
      }),
      caller.on('ended', reason => {
        if (!cancelled && !exitingRef.current) void leave(reason);
      }),
    ];

    void (async () => {
      try {
        setPhase('connecting');
        const capture = await startCapture().catch(() => null);
        if (cancelled) {
          capture?.stop();
          return;
        }
        if (!capture) {
          setStatus('Microphone permission is needed.');
          return;
        }

        const sessionRes = await fetch('/api/voice/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lowNetwork: prefs.lowNetwork }),
        });
        if (cancelled) {
          capture?.stop();
          return;
        }
        if (!sessionRes.ok) {
          capture?.stop();
          throw new Error(await voiceSessionStartError(sessionRes));
        }

        const session = await sessionRes.json() as VoiceSessionHandle;
        if (cancelled) {
          capture?.stop();
          return;
        }
        await caller.connect(session);
        if (cancelled) {
          capture?.stop();
          return;
        }
        sendAudioLiveRef.current = true;
        setStatus('Live. Ask anything, or try a site action.');
        onReady();
      } catch (caught) {
        sendAudioLiveRef.current = false;
        captureRef.current?.stop();
        captureRef.current = null;
        setMicLive(false);
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Voice mode is unavailable.');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      sendAudioLiveRef.current = false;
      unsubs.forEach(unsub => unsub());
      setMicLive(false);
      captureRef.current?.stop();
      captureRef.current = null;
      playback.close();
      stopVoiceAmbient();
      if (!exitingRef.current) caller.close('user');
    };
  }, [leave, onReady, router, setTheme, startCapture]);

  useEffect(() => {
    if (requestedExit) void leave(requestedExit);
  }, [leave, requestedExit]);

  const caption = useMemo(() => {
    if (error) return error;
    if (agentLine) return agentLine;
    if (userLine) return userLine;
    return status;
  }, [agentLine, error, status, userLine]);

  const showWelcomeHint = phase === 'entering' || phase === 'connecting';

  return (
    <m.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-stage-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex h-[100dvh] flex-col bg-black text-white"
      style={{ zIndex: Z_INDEX.voice }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(90,140,255,0.18),transparent_42%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.05),transparent_36%)]" />
      <header className="relative flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
        <p id="voice-stage-title" className="font-hand text-sm uppercase tracking-[0.32em] text-white/45">Voice</p>
        <button
          ref={leaveButtonRef}
          type="button"
          onClick={() => void leave('user')}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 font-hand text-base text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          <PhoneOff size={16} aria-hidden />
          Leave
        </button>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6">
        <VoiceOrb phase={phase} />
        <p
          role="status"
          aria-live="polite"
          className="mt-16 max-w-xl text-center font-hand text-xl leading-snug text-white/80 md:text-2xl"
        >
          {caption}
        </p>
        {showWelcomeHint ? (
          <p className="mt-4 font-hand text-sm text-white/40">{VOICE_WELCOME_HINT}</p>
        ) : null}
      </main>

      <footer className="relative flex items-center justify-center gap-3 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {micLive ? (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-300/30 px-4 font-hand text-sm text-emerald-200/80">
            Mic live
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              void startCapture().catch(() => {
                setMicLive(false);
                setStatus('Microphone permission is needed.');
              });
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 font-hand text-sm text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <MicOff size={14} aria-hidden />
            Enable mic
          </button>
        )}
      </footer>
    </m.div>
  );
}
