"use client";

import { executeSiteTool, type SiteToolRuntime } from '@/lib/siteToolExecutor';
import { createGeminiLiveCaller } from '@/lib/geminiLiveAdapter';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import {
  createVoiceActionQueue,
  isDeferredVoiceTool,
  type VoiceActionQueue,
} from '@/lib/voiceActionQueue';
import { createVoicePlayback, startVoiceCapture, type VoicePlayback } from '@/lib/voiceAudio';
import { getVoiceAgentPrefsSnapshot } from '@/lib/voiceAgentPrefs';
import type { SiteToolCall } from '@/lib/siteTools';
import type {
  VoiceAgentPhase,
  VoiceCaller,
  VoiceExitReason,
  VoiceSessionHandle,
} from '@/lib/voiceAgentProtocol';
import {
  consumeVoiceModeRequest,
  getVoiceExitReason,
  peekVoiceModeRequest,
  subscribeVoiceModeBus,
} from '@/lib/voiceModeStore';
import { playVoiceSound, prefetchVoiceSounds, startVoiceAmbient, stopVoiceAmbient } from '@/lib/voiceSounds';

export type VoiceHudPhase = 'idle' | 'intro' | 'live' | 'exiting';

export interface VoiceSessionSnapshot {
  active: boolean;
  hud: VoiceHudPhase;
  phase: VoiceAgentPhase;
  status: string;
  userLine: string;
  agentLine: string;
  error: string | null;
  micLive: boolean;
  lowNetwork: boolean;
  introComplete: boolean;
  hangupPending: boolean;
  generation: number;
}

export interface VoiceHangupRequest {
  force?: boolean;
  reason?: VoiceExitReason;
}

export interface VoiceSessionRuntimeDeps {
  createCaller: () => VoiceCaller;
  createPlayback: () => VoicePlayback;
  startCapture: typeof startVoiceCapture;
  fetchSession: (lowNetwork: boolean) => Promise<VoiceSessionHandle>;
  playEnter: () => void;
  playExit: () => void;
  playAction: () => void;
  playListen: () => void;
  startAmbient: (enabled: boolean) => void;
  stopAmbient: () => void;
  prefetchSounds: () => void;
}

const IDLE_SNAPSHOT: VoiceSessionSnapshot = {
  active: false,
  hud: 'idle',
  phase: 'idle',
  status: '',
  userLine: '',
  agentLine: '',
  error: null,
  micLive: false,
  lowNetwork: false,
  introComplete: false,
  hangupPending: false,
  generation: 0,
};

const listeners = new Set<() => void>();
let snapshot: VoiceSessionSnapshot = IDLE_SNAPSHOT;
let hostRuntime: SiteToolRuntime | null = null;
let caller: VoiceCaller | null = null;
let playback: VoicePlayback | null = null;
let capture: { stop: () => void } | null = null;
let queue: VoiceActionQueue | null = null;
let unsubs: Array<() => void> = [];
let sendAudioLive = false;
let socketReady = false;
let greetTurnComplete = false;
let starting = false;
let stopping = false;
let busAttached = false;
let previousPhase: VoiceAgentPhase = 'idle';
let farewellArmed = false;
let farewellHeard = false;
let farewellSawPlayback = false;
let farewellTurnComplete = false;
let depsOverride: Partial<VoiceSessionRuntimeDeps> | null = null;

function emit(): void {
  snapshot = { ...snapshot };
  for (const listener of listeners) listener();
}

function patch(partial: Partial<VoiceSessionSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  for (const listener of listeners) listener();
}

function defaultDeps(): VoiceSessionRuntimeDeps {
  return {
    createCaller: createGeminiLiveCaller,
    createPlayback: createVoicePlayback,
    startCapture: startVoiceCapture,
    fetchSession: mintBrowserVoiceSession,
    playEnter: () => playVoiceSound('voice-enter'),
    playExit: () => playVoiceSound('voice-exit'),
    playAction: () => playVoiceSound('voice-action'),
    playListen: () => playVoiceSound('voice-listen'),
    startAmbient: startVoiceAmbient,
    stopAmbient: stopVoiceAmbient,
    prefetchSounds: prefetchVoiceSounds,
  };
}

function resolveDeps(): VoiceSessionRuntimeDeps {
  return { ...defaultDeps(), ...depsOverride };
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

async function mintBrowserVoiceSession(lowNetwork: boolean): Promise<VoiceSessionHandle> {
  const sessionRes = await fetch('/api/voice/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lowNetwork }),
  });
  if (!sessionRes.ok) {
    throw new Error(await voiceSessionStartError(sessionRes));
  }
  return await sessionRes.json() as VoiceSessionHandle;
}

function currentGeneration(): number {
  return snapshot.generation;
}

function isStale(generation: number): boolean {
  return generation !== snapshot.generation;
}

function canCommitSideEffects(): boolean {
  return snapshot.introComplete && !playback?.isBusy() && !stopping;
}

function resetFarewellWait(): void {
  farewellArmed = false;
  farewellHeard = false;
  farewellSawPlayback = false;
  farewellTurnComplete = false;
}

function markFarewellHeard(): void {
  if (!farewellArmed) return;
  farewellHeard = true;
}

function markFarewellPlayback(): void {
  if (!farewellArmed) return;
  farewellHeard = true;
  farewellSawPlayback = true;
}

function canHangupNow(): boolean {
  if (stopping || playback?.isBusy()) return false;
  if (!farewellArmed) return true;
  if (!farewellHeard) return false;
  // Speaking/transcript can arrive before goodbye audio. Wait for that
  // playback, or a post-tool turnComplete if the model never plays audio.
  return farewellSawPlayback || farewellTurnComplete;
}

function armAgentFarewellHangup(reason: VoiceExitReason): void {
  if (snapshot.hangupPending || queue?.hasHangup()) return;
  farewellArmed = true;
  farewellHeard = playback?.isBusy() === true;
  farewellSawPlayback = farewellHeard;
  farewellTurnComplete = false;
  patch({
    hangupPending: true,
    status: 'Leaving after this thought.',
  });
  queue?.enqueueHangup(() => {
    stopVoiceSession(reason);
  });
}

function tryMarkIntroComplete(): void {
  if (snapshot.introComplete || stopping || !snapshot.active) return;
  if (!socketReady || !greetTurnComplete) return;
  if (playback?.isBusy()) return;
  patch({
    introComplete: true,
    hud: 'live',
    status: 'Live. Ask anything, or try a site action.',
  });
  queue?.notifyReady();
}

function requireHostRuntime(): SiteToolRuntime {
  if (hostRuntime) return hostRuntime;
  return {
    router: {
      push: () => undefined,
      replace: () => undefined,
      prefetch: () => undefined,
      back: () => undefined,
      forward: () => undefined,
      refresh: () => undefined,
    } as unknown as SiteToolRuntime['router'],
    setTheme: () => undefined,
    resolvedTheme: undefined,
    discoActive: false,
    openFeedback: () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-feedback'));
      }
    },
    openProject: () => {
      if (!hostRuntime) return;
      requestPageTurnNavigation(hostRuntime.router, { href: '/projects', mode: 'push' });
    },
  };
}

function teardownMedia(reason: VoiceExitReason): void {
  sendAudioLive = false;
  socketReady = false;
  greetTurnComplete = false;
  resetFarewellWait();
  capture?.stop();
  capture = null;
  playback?.close();
  playback = null;
  const activeCaller = caller;
  caller = null;
  unsubs.forEach(unsub => unsub());
  unsubs = [];
  queue?.reset();
  queue = null;
  resolveDeps().stopAmbient();
  if (activeCaller) activeCaller.close(reason);
}

function finishStop(reason: VoiceExitReason): void {
  if (stopping && !snapshot.active && !starting) return;
  stopping = true;
  const nextGeneration = snapshot.generation + 1;
  teardownMedia(reason);
  starting = false;
  snapshot = {
    ...IDLE_SNAPSHOT,
    generation: nextGeneration,
  };
  stopping = false;
  emit();
}

async function onToolCall(call: SiteToolCall): Promise<void> {
  const generation = currentGeneration();
  const activeCaller = caller;
  if (!activeCaller || isStale(generation)) return;
  resolveDeps().playAction();

  if (call.name === 'start_voice_session') {
    activeCaller.sendToolResult(call.id, {
      ok: true,
      spokenText: 'Already in voice mode.',
    }, call.name);
    return;
  }

  const deferred = isDeferredVoiceTool(call.name);
  const runtime = requireHostRuntime();
  const result = await executeSiteTool(call, runtime, { commit: !deferred });
  if (isStale(generation) || caller !== activeCaller) return;
  activeCaller.sendToolResult(call.id, result, call.name);

  if (!deferred || !result.ok) return;

  if (call.name === 'end_voice_session') {
    const reason = call.args.reason ?? 'user';
    armAgentFarewellHangup(reason);
    return;
  }

  queue?.enqueue(() => {
    if (isStale(generation)) return;
    void executeSiteTool(call, requireHostRuntime(), { commit: true });
  });
}

function attachCaller(nextCaller: VoiceCaller, nextPlayback: VoicePlayback, generation: number): void {
  const d = resolveDeps();
  unsubs = [
    nextCaller.on('phase', next => {
      if (isStale(generation)) return;
      if (next === 'speaking') {
        markFarewellHeard();
        queue?.notifyReady();
      }
      if (next === 'listening' && previousPhase !== 'listening' && snapshot.introComplete) {
        d.playListen();
      }
      previousPhase = next;
      patch({ phase: next });
    }),
    nextCaller.on('userTranscript', text => {
      if (isStale(generation)) return;
      patch({ userLine: `${snapshot.userLine}${text}`.slice(-180) });
    }),
    nextCaller.on('agentTranscript', text => {
      if (isStale(generation)) return;
      patch({ agentLine: `${snapshot.agentLine}${text}`.slice(-220) });
    }),
    nextCaller.on('audio', chunk => {
      if (isStale(generation)) return;
      markFarewellPlayback();
      nextPlayback.play(chunk);
      queue?.notifyReady();
    }),
    nextCaller.on('interrupted', () => {
      if (isStale(generation)) return;
      nextPlayback.interrupt();
      queue?.notifyReady();
    }),
    nextCaller.on('toolCall', call => {
      void onToolCall(call);
    }),
    nextCaller.on('turnComplete', () => {
      if (isStale(generation)) return;
      greetTurnComplete = true;
      if (farewellArmed) farewellTurnComplete = true;
      tryMarkIntroComplete();
      queue?.notifyReady();
    }),
    nextCaller.on('error', message => {
      if (isStale(generation)) return;
      patch({ error: message, phase: 'error' });
    }),
    nextCaller.on('ended', reason => {
      if (isStale(generation) || stopping) return;
      if (reason === 'health') {
        sendAudioLive = false;
        socketReady = false;
        patch({
          error: 'Connection faded. Stay here or hang up.',
          phase: 'error',
          status: 'Connection faded.',
          micLive: false,
        });
        capture?.stop();
        capture = null;
        return;
      }
      stopVoiceSession(reason);
    }),
    nextPlayback.subscribeIdle(() => {
      if (isStale(generation)) return;
      tryMarkIntroComplete();
      queue?.notifyReady();
    }),
  ];
}

async function bootSession(): Promise<void> {
  const generation = snapshot.generation;
  try {
    const d = resolveDeps();
    const nextCaller = d.createCaller();
    const nextPlayback = d.createPlayback();
    caller = nextCaller;
    playback = nextPlayback;
    const prefs = getVoiceAgentPrefsSnapshot();
    queue = createVoiceActionQueue({
      canCommit: canCommitSideEffects,
      canHangup: canHangupNow,
    });
    attachCaller(nextCaller, nextPlayback, generation);

    d.prefetchSounds();
    d.playEnter();
    if (prefs.ambientMusic && !prefs.lowNetwork) d.startAmbient(true);
    const nextCapture = await d.startCapture(chunk => {
      if (sendAudioLive) caller?.sendAudio(chunk);
    }, { lowNetwork: prefs.lowNetwork }).catch(() => null);
    if (isStale(generation)) {
      nextCapture?.stop();
      return;
    }
    if (!nextCapture) {
      patch({
        status: 'Microphone permission is needed.',
        error: 'Microphone permission is needed.',
        phase: 'error',
      });
      return;
    }
    capture = nextCapture;
    patch({ micLive: true });

    const session = await d.fetchSession(prefs.lowNetwork);
    if (isStale(generation)) return;
    await nextCaller.connect(session);
    if (isStale(generation)) return;
    sendAudioLive = true;
    socketReady = true;
    patch({
      phase: 'listening',
      status: 'Connected. Waiting for the welcome.',
    });
    tryMarkIntroComplete();
  } catch (caught) {
    if (isStale(generation)) return;
    sendAudioLive = false;
    capture?.stop();
    capture = null;
    patch({
      micLive: false,
      error: caught instanceof Error ? caught.message : 'Voice mode is unavailable.',
      phase: 'error',
      status: 'Voice mode is unavailable.',
    });
  } finally {
    if (!isStale(generation)) starting = false;
  }
}

function consumeStoreRequest(): void {
  const request = peekVoiceModeRequest();
  if (request === 'enter') {
    consumeVoiceModeRequest();
    startVoiceSession();
    return;
  }
  if (request === 'exit') {
    consumeVoiceModeRequest();
    requestVoiceHangup({ reason: getVoiceExitReason() });
  }
}

function ensureBus(): void {
  if (busAttached) return;
  busAttached = true;
  subscribeVoiceModeBus(consumeStoreRequest);
  consumeStoreRequest();
}

export function bindVoiceSessionHost(runtime: SiteToolRuntime): void {
  hostRuntime = runtime;
  ensureBus();
}

export function startVoiceSession(): Promise<void> {
  ensureBus();
  if (starting || stopping || snapshot.active) return Promise.resolve();
  starting = true;
  socketReady = false;
  greetTurnComplete = false;
  resetFarewellWait();
  previousPhase = 'entering';
  patch({
    active: true,
    hud: 'intro',
    phase: 'connecting',
    status: 'Switching to agent experience',
    userLine: '',
    agentLine: '',
    error: null,
    micLive: false,
    lowNetwork: getVoiceAgentPrefsSnapshot().lowNetwork,
    introComplete: false,
    hangupPending: false,
    generation: snapshot.generation + 1,
  });
  return bootSession();
}

export function stopVoiceSession(reason: VoiceExitReason = 'user'): void {
  if (!snapshot.active && !starting) {
    queue?.reset();
    return;
  }
  if (stopping) return;
  resolveDeps().playExit();
  finishStop(reason);
}

export function requestVoiceHangup(options: VoiceHangupRequest = {}): void {
  if (!snapshot.active && !starting) return;
  const reason = options.reason ?? 'user';
  const force = options.force === true || snapshot.hangupPending;
  if (force || !queue) {
    stopVoiceSession(reason);
    return;
  }
  patch({
    hangupPending: true,
    status: reason === 'health' ? 'Connection faded. Returning to notes.' : 'Leaving after this thought.',
  });
  queue.enqueueHangup(() => {
    stopVoiceSession(reason);
  });
}

export function subscribeVoiceSession(listener: () => void): () => void {
  ensureBus();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVoiceSessionSnapshot(): VoiceSessionSnapshot {
  return snapshot;
}

export function getServerVoiceSessionSnapshot(): VoiceSessionSnapshot {
  return IDLE_SNAPSHOT;
}

export function enableVoiceCapture(): void {
  if (!snapshot.active || capture) return;
  const generation = currentGeneration();
  const d = resolveDeps();
  void d.startCapture(chunk => {
    if (sendAudioLive) caller?.sendAudio(chunk);
  }, { lowNetwork: snapshot.lowNetwork }).then(nextCapture => {
    if (isStale(generation)) {
      nextCapture.stop();
      return;
    }
    capture = nextCapture;
    patch({ micLive: true, error: snapshot.error === 'Microphone permission is needed.' ? null : snapshot.error });
  }).catch(() => {
    if (isStale(generation)) return;
    patch({
      micLive: false,
      status: 'Microphone permission is needed.',
      error: 'Microphone permission is needed.',
    });
  });
}

export function setVoiceSessionRuntimeDepsForTests(deps: Partial<VoiceSessionRuntimeDeps> | null): void {
  depsOverride = deps;
}

export function resetVoiceSessionRuntimeForTests(): void {
  stopping = true;
  teardownMedia('user');
  starting = false;
  stopping = false;
  snapshot = IDLE_SNAPSHOT;
  hostRuntime = null;
  depsOverride = null;
  emit();
}