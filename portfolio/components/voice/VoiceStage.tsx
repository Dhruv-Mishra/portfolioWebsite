"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { m } from 'framer-motion';
import { MicOff, PhoneOff } from 'lucide-react';
import { useDiscoActive } from '@/hooks/useStickers';
import { executeSiteTool } from '@/lib/siteToolExecutor';
import { createGeminiLiveCaller } from '@/lib/geminiLiveAdapter';
import { createVoicePlayback, startVoiceCapture } from '@/lib/voiceAudio';
import { getVoiceAgentPrefsSnapshot } from '@/lib/voiceAgentPrefs';
import { playVoiceSound, prefetchVoiceSounds, startVoiceAmbient, stopVoiceAmbient } from '@/lib/voiceSounds';
import type { VoiceAgentPhase, VoiceExitReason, VoiceSessionHandle } from '@/lib/voiceAgentProtocol';
import { VOICE_WELCOME_HINT } from '@/lib/voiceAgentProtocol';
import { cn } from '@/lib/utils';
import VoiceOrb from '@/components/voice/VoiceOrb';

interface VoiceStageProps {
  onReady: () => void;
  onExitComplete: () => void;
  requestedExit: VoiceExitReason | null;
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

  const leave = useCallback(async (reason: VoiceExitReason) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setPhase('exiting');
    setStatus(reason === 'health' ? 'Connection faded. Returning to notes.' : 'Leaving voice mode.');
    playVoiceSound('voice-exit');
    stopVoiceAmbient();
    setMicLive(false);
    captureRef.current?.stop();
    playbackRef.current.close();
    callerRef.current.close(reason);
    window.setTimeout(() => {
      onExitComplete();
    }, 900);
  }, [onExitComplete]);

  useEffect(() => {
    let cancelled = false;
    const prefs = getVoiceAgentPrefsSnapshot();
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
          resolvedTheme,
          discoActive,
          openFeedback: () => window.dispatchEvent(new CustomEvent('open-feedback')),
          openProject: slug => window.dispatchEvent(new CustomEvent('open-project-modal', { detail: { slug } })),
        });
        caller.sendToolResult(call.id, result);
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
        const [sessionRes, capture] = await Promise.all([
          fetch('/api/voice/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lowNetwork: prefs.lowNetwork }),
          }),
          startVoiceCapture(chunk => caller.sendAudio(chunk), { lowNetwork: prefs.lowNetwork }).catch(() => null),
        ]);

        if (!sessionRes.ok) {
          const payload = await sessionRes.json().catch(() => ({ error: 'Voice session unavailable.' })) as { error?: string };
          throw new Error(payload.error || 'Voice session unavailable.');
        }

        const session = await sessionRes.json() as VoiceSessionHandle;
        if (cancelled) return;
        captureRef.current = capture;
        if (capture) setMicLive(true);
        if (!capture) {
          setStatus('Microphone permission is needed.');
        }
        await caller.connect(session);
        if (cancelled) return;
        setStatus('Live. Ask anything, or try a site action.');
        onReady();
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Voice mode is unavailable.');
        setPhase('error');
        window.setTimeout(() => {
          void leave('error');
        }, 1600);
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach(unsub => unsub());
      setMicLive(false);
      captureRef.current?.stop();
      playback.close();
      stopVoiceAmbient();
    };
  }, [discoActive, leave, onReady, resolvedTheme, router, setTheme]);

  useEffect(() => {
    if (requestedExit) void leave(requestedExit);
  }, [leave, requestedExit]);

  const caption = useMemo(() => {
    if (error) return error;
    if (agentLine) return agentLine;
    if (userLine) return userLine;
    return status;
  }, [agentLine, error, status, userLine]);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[180] flex h-[100dvh] flex-col bg-black text-white"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(90,140,255,0.18),transparent_42%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.05),transparent_36%)]" />
      <header className="relative flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
        <p className="font-hand text-sm uppercase tracking-[0.32em] text-white/45">Voice</p>
        <button
          type="button"
          onClick={() => void leave('user')}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 font-hand text-base text-white/80"
        >
          <PhoneOff size={16} aria-hidden />
          Leave
        </button>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6">
        <VoiceOrb phase={phase} />
        <p className="mt-16 max-w-xl text-center font-hand text-xl leading-snug text-white/80 md:text-2xl">
          {caption}
        </p>
        <p className="mt-4 font-hand text-sm text-white/40">{VOICE_WELCOME_HINT}</p>
      </main>

      <footer className="relative flex items-center justify-center gap-3 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-hand text-sm',
          micLive ? 'border-emerald-300/30 text-emerald-200/80' : 'border-white/15 text-white/50',
        )}>
          <MicOff size={14} aria-hidden className={micLive ? 'hidden' : ''} />
          {micLive ? 'Mic live' : 'Mic pending'}
        </span>
      </footer>
    </m.div>
  );
}
