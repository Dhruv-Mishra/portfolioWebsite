"use client";

import { executeSiteTool, type SiteToolRuntime } from '@/lib/siteToolExecutor';
import { createGeminiLiveCaller } from '@/lib/geminiLiveAdapter';
import { requestPageTurnNavigation } from '@/lib/pageTurn';
import {
  isSiteActionHostReady,
  subscribeSiteActionHostReady,
} from '@/lib/siteActionEvents';
import {
  createVoiceActionQueue,
  hostIdForVoiceTool,
  isDeferredVoiceTool,
  isDependentVoiceTool,
  type VoiceActionQueue,
} from '@/lib/voiceActionQueue';
import { createVoicePlayback, startVoiceCapture, type VoicePlayback } from '@/lib/voiceAudio';
import { getVoiceAgentPrefsSnapshot } from '@/lib/voiceAgentPrefs';
import type { SiteToolCall, SiteToolResult } from '@/lib/siteTools';
import { planVoiceUtterance, type PlannedVoiceAction } from '@/lib/voiceUtterancePlan';
import type {
  VoiceAgentPhase,
  VoiceCaller,
  VoiceExitReason,
  VoiceSessionHandle,
} from '@/lib/voiceAgentProtocol';
import {
  VOICE_WELCOME_HINT,
  buildVoiceExactSpeakCue,
  pickVoiceExitVeil,
  pickVoiceIdleCheckIn,
  pickVoiceIdleHangup,
} from '@/lib/voiceAgentProtocol';
import {
  consumeVoiceModeRequest,
  getVoiceExitReason,
  peekVoiceModeRequest,
  subscribeVoiceModeBus,
} from '@/lib/voiceModeStore';
import { getEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { getSitePrefsSnapshot } from '@/hooks/useSitePrefs';
import { forceStopVoiceToggleCue, playVoiceEnterFallback, playVoiceSound, prefetchVoiceSounds, prefetchVoiceVisuals, setVoiceAmbientDucked, startVoiceAmbient, stopVoiceAmbient, stopVoiceToggleCue } from '@/lib/voiceSounds';

export type VoiceHudPhase = 'idle' | 'intro' | 'live' | 'exiting';

export type VoiceSubtitlePhase = 'hidden' | 'visible' | 'exiting';

export interface VoiceSessionSnapshot {
  active: boolean;
  hud: VoiceHudPhase;
  phase: VoiceAgentPhase;
  status: string;
  userLine: string;
  agentLine: string;
  subtitlePhase: VoiceSubtitlePhase;
  error: string | null;
  micLive: boolean;
  lowNetwork: boolean;
  introComplete: boolean;
  hangupPending: boolean;
  generation: number;
  welcomeHint: string;
  exitLine: string;
}

export const VOICE_SUBTITLE_IDLE_MS = 700;
export const VOICE_SUBTITLE_FADE_MS = 280;
export const VOICE_SUBTITLE_REDUCED_FADE_MS = 0;
export const VOICE_IDLE_CHECKIN_MS = 15_000;
export const VOICE_IDLE_HANGUP_MS = 25_000;
export const VOICE_EXIT_VEIL_MS = 2_200;
export const VOICE_EXIT_VEIL_REDUCED_MS = 400;
export const VOICE_PROJECT_VIDEO_WAIT_MS = 2_500;
export const VOICE_AMBIENT_START_DELAY_MS = 800;

export interface VoiceHangupRequest {
  force?: boolean;
  reason?: VoiceExitReason;
}

export const VOICE_ACTION_CUE_COALESCE_MS = 220;
export const VOICE_AMBIENT_FADE_OUT_MS = 320;

const VISUAL_VOICE_ACTION_TOOLS = new Set<SiteToolCall['name']>([
  'navigate_to',
  'open_project',
  'open_link',
  'open_feedback',
  'open_command_palette',
  'open_shortcuts',
  'open_chat',
  'close_project',
  'set_theme',
  'control_project_video',
  'browse_history',
  'scroll_page',
  'send_chat_message',
  'run_terminal_command',
  'fill_field',
  'set_preference',
  'set_voice_output',
  'set_voice_backend',
  'set_motion_preference',
  'submit_guestbook',
  'submit_feedback',
]);

export interface VoiceSessionRuntimeDeps {
  createCaller: () => VoiceCaller;
  createPlayback: () => VoicePlayback;
  startCapture: typeof startVoiceCapture;
  fetchSession: (lowNetwork: boolean) => Promise<VoiceSessionHandle>;
  playEnter: () => void;
  playExit: () => void;
  playAction: () => void;
  startAmbient: (enabled: boolean) => void;
  stopAmbient: (options?: { fadeMs?: number }) => void;
  prefetchSounds: () => void;
}

const IDLE_SNAPSHOT: VoiceSessionSnapshot = {
  active: false,
  hud: 'idle',
  phase: 'idle',
  status: '',
  userLine: '',
  agentLine: '',
  exitLine: '',
  subtitlePhase: 'hidden',
  error: null,
  micLive: false,
  lowNetwork: false,
  welcomeHint: VOICE_WELCOME_HINT,
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
let farewellArmed = false;
let farewellHeard = false;
let farewellSawPlayback = false;
let farewellTurnComplete = false;
let subtitleIdleTimer: ReturnType<typeof setTimeout> | null = null;
let subtitleFadeTimer: ReturnType<typeof setTimeout> | null = null;
let idleCheckInTimer: ReturnType<typeof setTimeout> | null = null;
let idleHangupTimer: ReturnType<typeof setTimeout> | null = null;
let exitVeilTimer: ReturnType<typeof setTimeout> | null = null;
let ambientStartTimer: ReturnType<typeof setTimeout> | null = null;
let idleCheckedIn = false;
let pendingStopReason: VoiceExitReason = 'user';
let subtitleSpeaker: 'user' | 'agent' | null = null;
let utterancePlan: PlannedVoiceAction[] = [];
let utterancePlanSource = '';
const seenVoiceToolKeys = new Set<string>();
let actionCueTimer: ReturnType<typeof setTimeout> | null = null;
const projectVideoWaiters = new Set<() => void>();
const projectVideoWaiterCancellers = new Set<() => void>();

function prefersReducedSubtitleMotion(): boolean {
  return getEffectiveReducedMotion(getSitePrefsSnapshot().motionPreference);
}

function clearSubtitleIdleTimer(): void {
  if (subtitleIdleTimer === null) return;
  clearTimeout(subtitleIdleTimer);
  subtitleIdleTimer = null;
}

function clearSubtitleFadeTimer(): void {
  if (subtitleFadeTimer === null) return;
  clearTimeout(subtitleFadeTimer);
  subtitleFadeTimer = null;
}

function clearSubtitleTimers(): void {
  clearSubtitleIdleTimer();
  clearSubtitleFadeTimer();
}

function clearIdleCheckInTimer(): void {
  if (idleCheckInTimer === null) return;
  clearTimeout(idleCheckInTimer);
  idleCheckInTimer = null;
}

function clearIdleHangupTimer(): void {
  if (idleHangupTimer === null) return;
  clearTimeout(idleHangupTimer);
  idleHangupTimer = null;
}

function clearIdleTimers(): void {
  clearIdleCheckInTimer();
  clearIdleHangupTimer();
}

function clearExitVeilTimer(): void {
  if (exitVeilTimer === null) return;
  clearTimeout(exitVeilTimer);
  exitVeilTimer = null;
}

function clearAmbientStartTimer(): void {
  if (ambientStartTimer === null) return;
  clearTimeout(ambientStartTimer);
  ambientStartTimer = null;
}

function resetIdleWatch(): void {
  clearIdleTimers();
  idleCheckedIn = false;
}

function resetSubtitleState(): void {
  clearSubtitleTimers();
  subtitleSpeaker = null;
}

function clearSpokenLines(): void {
  subtitleSpeaker = null;
  patch({ userLine: '', agentLine: '', subtitlePhase: 'hidden' });
}

function finishSubtitleFade(generation: number): void {
  subtitleFadeTimer = null;
  if (isStale(generation) || stopping || !snapshot.active) return;
  if (snapshot.subtitlePhase !== 'exiting') return;
  clearSpokenLines();
}

function beginSubtitleFade(generation: number): void {
  if (isStale(generation) || stopping || !snapshot.active) return;
  if (!snapshot.userLine && !snapshot.agentLine) {
    patch({ subtitlePhase: 'hidden' });
    return;
  }
  const fadeMs = prefersReducedSubtitleMotion() ? VOICE_SUBTITLE_REDUCED_FADE_MS : VOICE_SUBTITLE_FADE_MS;
  if (fadeMs <= 0) {
    clearSpokenLines();
    return;
  }
  patch({ subtitlePhase: 'exiting' });
  subtitleFadeTimer = setTimeout(() => {
    finishSubtitleFade(generation);
  }, fadeMs);
}

function scheduleSubtitleClear(generation: number): void {
  clearSubtitleTimers();
  if (playback?.isBusy() || (!snapshot.userLine && !snapshot.agentLine)) return;
  subtitleIdleTimer = setTimeout(() => {
    subtitleIdleTimer = null;
    if (isStale(generation) || stopping || !snapshot.active) return;
    beginSubtitleFade(generation);
  }, VOICE_SUBTITLE_IDLE_MS);
}

function applySpokenTranscript(
  speaker: 'user' | 'agent',
  text: string,
  generation: number,
): void {
  if (isStale(generation)) return;
  clearSubtitleTimers();
  const continuing = subtitleSpeaker === speaker && snapshot.subtitlePhase !== 'exiting';
  subtitleSpeaker = speaker;
  if (speaker === 'user') {
    patch({
      userLine: `${continuing ? snapshot.userLine : ''}${text}`.slice(-280),
      agentLine: '',
      subtitlePhase: 'visible',
    });
    syncUtterancePlanFromUserLine({ newTurn: !continuing });
    flushUtterancePlan(generation);
    return;
  }
  patch({
    agentLine: `${continuing ? snapshot.agentLine : ''}${text}`.slice(-360),
    userLine: '',
    subtitlePhase: 'visible',
  });
}

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
    playEnter: playVoiceEnterFallback,
    playExit: () => playVoiceSound('voice-toggle'),
    playAction: () => playVoiceSound('voice-action'),
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

function notifyProjectVideoWaiters(): void {
  for (const waiter of [...projectVideoWaiters]) waiter();
}

function notifyVoiceActionQueueReady(): void {
  queue?.notifyReady();
  notifyProjectVideoWaiters();
}

function cancelProjectVideoWaiters(): void {
  for (const cancel of [...projectVideoWaiterCancellers]) cancel();
}

function projectVideoUnavailableResult(): SiteToolResult {
  return {
    ok: false,
    spokenText: 'No project video is open right now.',
    errorCode: 'project-video-unavailable',
  };
}

function waitForProjectVideoControl(
  call: SiteToolCall,
  generation: number,
): Promise<SiteToolResult> {
  return new Promise(resolve => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeHost = () => {};

    function cleanup(): void {
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
      unsubscribeHost();
      projectVideoWaiters.delete(check);
      projectVideoWaiterCancellers.delete(cancel);
    }

    function finish(result: SiteToolResult): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function cancel(): void {
      finish(projectVideoUnavailableResult());
    }

    function check(): void {
      if (settled) return;
      if (isStale(generation) || stopping || !snapshot.active) {
        finish(projectVideoUnavailableResult());
        return;
      }
      if (!canCommitSideEffects()) return;
      if (timeout === null) {
        timeout = setTimeout(() => {
          timeout = null;
          finish(projectVideoUnavailableResult());
        }, VOICE_PROJECT_VIDEO_WAIT_MS);
      }
      if (!isSiteActionHostReady('project-video')) return;

      const runtime = requireHostRuntime();
      cleanup();
      playCommittedActionCue(call.name);
      void executeSiteTool(call, runtime, { commit: true }).then(
        result => finish(result),
        () => finish(projectVideoUnavailableResult()),
      );
    }

    projectVideoWaiters.add(check);
    projectVideoWaiterCancellers.add(cancel);
    unsubscribeHost = subscribeSiteActionHostReady(check);
    check();
  });
}

function resetFarewellWait(): void {
  farewellArmed = false;
  farewellHeard = false;
  farewellSawPlayback = false;
  farewellTurnComplete = false;
}

function resetUtterancePlan(): void {
  utterancePlan = [];
  utterancePlanSource = '';
  seenVoiceToolKeys.clear();
}

function canonicalToolArgs(args: unknown): string {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return JSON.stringify(args ?? {});
  }
  const record = args as Record<string, unknown>;
  const sorted = Object.keys(record).sort().reduce<Record<string, unknown>>((next, key) => {
    next[key] = record[key];
    return next;
  }, {});
  return JSON.stringify(sorted);
}

function voiceToolDedupeKey(call: Pick<SiteToolCall, 'name' | 'args'>): string {
  return `${call.name}:${canonicalToolArgs(call.args)}`;
}

function hostArgsForVoiceTool(call: SiteToolCall): { field?: string } | null {
  return call.name === 'fill_field' ? { field: call.args.field } : null;
}

function syncUtterancePlanFromUserLine(options: { newTurn?: boolean } = {}): void {
  const source = snapshot.userLine.trim();
  if (!source) return;
  if (!options.newTurn && source === utterancePlanSource) return;
  const continuingSameTurn = !options.newTurn
    && utterancePlanSource.length > 0
    && source.startsWith(utterancePlanSource);
  const lateTranscriptSameTurn = utterancePlanSource.length === 0;
  utterancePlanSource = source;
  utterancePlan = planVoiceUtterance(source);
  if (!continuingSameTurn && !lateTranscriptSameTurn) seenVoiceToolKeys.clear();
}

function clearActionCueTimer(): void {
  if (actionCueTimer === null) return;
  clearTimeout(actionCueTimer);
  actionCueTimer = null;
}

function shouldPlayVisualActionCue(name: SiteToolCall['name']): boolean {
  return VISUAL_VOICE_ACTION_TOOLS.has(name);
}

function playCommittedActionCue(name: SiteToolCall['name']): void {
  if (!shouldPlayVisualActionCue(name)) return;
  if (actionCueTimer !== null) return;
  resolveDeps().playAction();
  actionCueTimer = setTimeout(() => {
    actionCueTimer = null;
  }, VOICE_ACTION_CUE_COALESCE_MS);
}

function enqueueVoiceSideEffect(call: SiteToolCall, generation: number): void {
  const hostId = hostIdForVoiceTool(call.name, hostArgsForVoiceTool(call));
  const deferred = isDeferredVoiceTool(call.name);
  const dependent = isDependentVoiceTool(call.name) || hostId !== null;
  if (!deferred && !dependent) {
    playCommittedActionCue(call.name);
    void executeSiteTool(call, requireHostRuntime(), { commit: true });
    return;
  }
  queue?.enqueue(() => {
    if (isStale(generation)) return;
    playCommittedActionCue(call.name);
    void executeSiteTool(call, requireHostRuntime(), { commit: true });
  }, hostId ? { ready: () => isSiteActionHostReady(hostId) } : undefined);
}

function flushUtterancePlan(generation: number): void {
  if (isStale(generation)) return;
  for (const item of utterancePlan) {
    const key = voiceToolDedupeKey(item);
    if (seenVoiceToolKeys.has(key)) continue;
    seenVoiceToolKeys.add(key);
    enqueueVoiceSideEffect(item, generation);
  }
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
  resetIdleWatch();
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

function canWatchIdle(): boolean {
  return (
    snapshot.active
    && snapshot.introComplete
    && snapshot.hud === 'live'
    && !snapshot.hangupPending
    && !stopping
    && socketReady
  );
}

function scheduleIdleCheckIn(): void {
  clearIdleTimers();
  if (idleCheckedIn || !canWatchIdle()) return;
  const generation = currentGeneration();
  idleCheckInTimer = setTimeout(() => {
    idleCheckInTimer = null;
    if (isStale(generation)) return;
    beginIdleCheckIn();
  }, VOICE_IDLE_CHECKIN_MS);
  idleHangupTimer = setTimeout(() => {
    idleHangupTimer = null;
    if (isStale(generation)) return;
    beginIdleHangup();
  }, VOICE_IDLE_HANGUP_MS);
}

function beginIdleCheckIn(): void {
  if (idleCheckedIn || !canWatchIdle() || !caller) return;
  idleCheckedIn = true;
  caller.sendText(buildVoiceExactSpeakCue(pickVoiceIdleCheckIn()));
}

function beginIdleHangup(): void {
  if (!idleCheckedIn || !canWatchIdle() || !caller) return;
  caller.sendText(buildVoiceExactSpeakCue(pickVoiceIdleHangup()));
  sendAudioLive = false;
  armAgentFarewellHangup('user');
}

function noteVoiceActivity(
  source: 'user' | 'agent' | 'tool' | 'connect' | 'mic' | 'hangup',
): void {
  if (source === 'hangup') {
    resetIdleWatch();
    return;
  }
  if (idleCheckedIn && source === 'agent') return;
  if (snapshot.hangupPending || snapshot.hud === 'exiting' || stopping) {
    resetIdleWatch();
    return;
  }
  resetIdleWatch();
  scheduleIdleCheckIn();
}

function beginExitVeil(reason: VoiceExitReason): void {
  cancelProjectVideoWaiters();
  pendingStopReason = reason;
  resetIdleWatch();
  stopping = true;
  sendAudioLive = false;
  const exitLine = pickVoiceExitVeil();
  const fadeMs = prefersReducedSubtitleMotion() ? 120 : VOICE_AMBIENT_FADE_OUT_MS;
  resolveDeps().stopAmbient({ fadeMs });
  setTimeout(() => {
    if (isStale(currentGeneration())) return;
    resolveDeps().playExit();
  }, fadeMs);
  patch({
    hud: 'exiting',
    phase: 'exiting',
    status: exitLine,
    exitLine,
    active: true,
  });
  const generation = currentGeneration();
  const veilMs = prefersReducedSubtitleMotion() ? VOICE_EXIT_VEIL_REDUCED_MS : VOICE_EXIT_VEIL_MS;
  exitVeilTimer = setTimeout(() => {
    exitVeilTimer = null;
    if (isStale(generation)) return;
    finishStop(pendingStopReason);
  }, veilMs);
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
  noteVoiceActivity('connect');
  notifyVoiceActionQueueReady();
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
    openProject: (slug) => {
      if (!hostRuntime) return;
      requestPageTurnNavigation(hostRuntime.router, {
        href: slug ? `/projects?project=${encodeURIComponent(slug)}` : '/projects',
        mode: 'push',
      });
    },
  };
}

function teardownMedia(reason: VoiceExitReason): void {
  sendAudioLive = false;
  socketReady = false;
  greetTurnComplete = false;
  resetIdleWatch();
  clearExitVeilTimer();
  clearAmbientStartTimer();
  resetSubtitleState();
  resetFarewellWait();
  resetUtterancePlan();
  clearActionCueTimer();
  cancelProjectVideoWaiters();
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
  forceStopVoiceToggleCue();
  setVoiceAmbientDucked(false);
  resolveDeps().stopAmbient({ fadeMs: 0 });
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

  if (call.name === 'start_voice_session') {
    activeCaller.sendToolResult(call.id, {
      ok: true,
      spokenText: 'Already in voice mode.',
    }, call.name);
    return;
  }

  syncUtterancePlanFromUserLine();
  const key = voiceToolDedupeKey(call);
  const alreadySeen = seenVoiceToolKeys.has(key);
  seenVoiceToolKeys.add(key);

  const hostId = hostIdForVoiceTool(call.name, hostArgsForVoiceTool(call));
  const deferred = isDeferredVoiceTool(call.name);
  const dependent = isDependentVoiceTool(call.name) || hostId !== null;
  const runtime = requireHostRuntime();
  let result: SiteToolResult;
  if (alreadySeen) {
    result = { ok: true, spokenText: 'Already handling that.' };
  } else if (call.name === 'control_project_video') {
    result = await waitForProjectVideoControl(call, generation);
  } else if (call.name === 'fill_field' && hostId) {
    // fill_field ignores commit=false in the executor, so wait for the host.
    result = { ok: true, spokenText: 'I will type that in.' };
  } else {
    if (!deferred && !dependent) playCommittedActionCue(call.name);
    result = await executeSiteTool(call, runtime, { commit: !deferred && !dependent });
  }
  if (isStale(generation) || caller !== activeCaller) return;
  activeCaller.sendToolResult(call.id, result, call.name);

  if (!alreadySeen && result.ok) {
    if (call.name === 'end_voice_session') {
      const reason = call.args.reason ?? 'user';
      armAgentFarewellHangup(reason);
    } else if (deferred || (dependent && call.name !== 'control_project_video')) {
      enqueueVoiceSideEffect(call, generation);
    }
  }

  flushUtterancePlan(generation);
}

function attachCaller(nextCaller: VoiceCaller, nextPlayback: VoicePlayback, generation: number): void {
  unsubs = [
    nextCaller.on('phase', next => {
      if (isStale(generation)) return;
      if (next === 'speaking') {
        markFarewellHeard();
        notifyVoiceActionQueueReady();
      }
      if (next === 'listening' && nextPlayback.isBusy()) {
        stopVoiceToggleCue();
        setVoiceAmbientDucked(true);
        patch({ phase: snapshot.phase === 'acting' ? 'acting' : 'speaking' });
        return;
      }
      patch({ phase: next });
    }),
    nextCaller.on('userTranscript', text => {
      applySpokenTranscript('user', text, generation);
      noteVoiceActivity('user');
    }),
    nextCaller.on('agentTranscript', text => {
      applySpokenTranscript('agent', text, generation);
      noteVoiceActivity('agent');
    }),
    nextCaller.on('audio', chunk => {
      if (isStale(generation)) return;
      markFarewellPlayback();
      stopVoiceToggleCue();
      setVoiceAmbientDucked(true);
      nextPlayback.play(chunk);
      notifyVoiceActionQueueReady();
    }),
    nextCaller.on('interrupted', () => {
      if (isStale(generation)) return;
      nextPlayback.interrupt();
      notifyVoiceActionQueueReady();
    }),
    nextCaller.on('toolCall', call => {
      noteVoiceActivity('tool');
      void onToolCall(call);
    }),
    nextCaller.on('turnComplete', () => {
      if (isStale(generation)) return;
      greetTurnComplete = true;
      if (farewellArmed) farewellTurnComplete = true;
      tryMarkIntroComplete();
      scheduleSubtitleClear(generation);
      syncUtterancePlanFromUserLine();
      flushUtterancePlan(generation);
      notifyVoiceActionQueueReady();
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
        resetIdleWatch();
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
      setVoiceAmbientDucked(false);
      if (snapshot.phase === 'speaking' || snapshot.phase === 'acting') {
        patch({ phase: 'listening' });
      }
      tryMarkIntroComplete();
      scheduleSubtitleClear(generation);
      notifyVoiceActionQueueReady();
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
    unsubs.push(subscribeSiteActionHostReady(() => {
      if (isStale(generation)) return;
      notifyVoiceActionQueueReady();
    }));

    d.prefetchSounds();
    prefetchVoiceVisuals();
    d.playEnter();
    if (prefs.ambientMusic && !prefs.lowNetwork) {
      clearAmbientStartTimer();
      ambientStartTimer = setTimeout(() => {
        ambientStartTimer = null;
        if (isStale(generation) || !snapshot.active || stopping) return;
        d.startAmbient(true);
      }, VOICE_AMBIENT_START_DELAY_MS);
    }
    const nextCapture = await d.startCapture(chunk => {
      if (sendAudioLive && !playback?.isBusy()) caller?.sendAudio(chunk);
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
      welcomeHint: session.setup.welcomeHint || VOICE_WELCOME_HINT,
    });
    noteVoiceActivity('connect');
    tryMarkIntroComplete();
  } catch (caught) {
    if (isStale(generation)) return;
    sendAudioLive = false;
    capture?.stop();
    capture = null;
    patch({
      micLive: false,
      subtitlePhase: 'hidden',
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
  resetSubtitleState();
  resetFarewellWait();
  resetIdleWatch();
  clearExitVeilTimer();
  resetUtterancePlan();
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
    welcomeHint: VOICE_WELCOME_HINT,
    exitLine: '',
    generation: snapshot.generation + 1,
  });
  return bootSession();
}

export function stopVoiceSession(reason: VoiceExitReason = 'user', options: { force?: boolean } = {}): void {
  if (!snapshot.active && !starting) {
    queue?.reset();
    return;
  }
  if (snapshot.hud === 'exiting') {
    if (options.force === true) {
      finishStop(reason);
    }
    return;
  }
  if (stopping) return;
  if (options.force === true) {
    resolveDeps().playExit();
    finishStop(reason);
    return;
  }
  beginExitVeil(reason);
}

export function requestVoiceHangup(options: VoiceHangupRequest = {}): void {
  if (!snapshot.active && !starting) return;
  const reason = options.reason ?? 'user';
  noteVoiceActivity('hangup');
  const alreadyExiting = snapshot.hud === 'exiting';
  const force = options.force === true || snapshot.hangupPending || alreadyExiting;
  if (alreadyExiting) {
    stopVoiceSession(reason, { force: true });
    return;
  }
  if (force || !queue) {
    stopVoiceSession(reason, { force });
    return;
  }
  if (canHangupNow()) {
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
  noteVoiceActivity('mic');
  void d.startCapture(chunk => {
    if (sendAudioLive && !playback?.isBusy()) caller?.sendAudio(chunk);
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
  resetIdleWatch();
  clearExitVeilTimer();
  teardownMedia('user');
  starting = false;
  stopping = false;
  pendingStopReason = 'user';
  snapshot = IDLE_SNAPSHOT;
  hostRuntime = null;
  depsOverride = null;
  emit();
}