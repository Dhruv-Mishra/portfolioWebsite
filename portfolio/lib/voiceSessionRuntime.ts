"use client";

import { executeSiteTool, type SiteToolRuntime } from '@/lib/siteToolExecutor';
import { createGeminiLiveCaller } from '@/lib/geminiLiveAdapter';
import {
  isSiteActionHostReady,
  readProjectSlugFromSearch,
  subscribeSiteActionHostReady,
  type SiteActionHostId,
} from '@/lib/siteActionEvents';
import {
  createVoiceActionQueue,
  resolveVoiceToolPolicy,
  type VoiceActionQueue,
} from '@/lib/voiceActionQueue';
import {
  cancelPendingVoiceCaptures,
  createVoicePlayback,
  startVoiceCapture,
  type VoicePlayback,
  type VoicePlaybackOptions,
} from '@/lib/voiceAudio';
import { disposePrimedVoiceAudio } from '@/lib/voiceAudioActivation';
import { playVoiceAction, playVoiceToggle, stopVoiceSounds } from '@/lib/voiceSounds';
import { getVoiceAgentPrefsSnapshot } from '@/lib/voiceAgentPrefs';
import type { SiteToolCall, SiteToolResult } from '@/lib/siteTools';
import type {
  VoiceAgentPhase,
  VoiceCaller,
  VoiceExitReason,
  VoiceSessionHandle,
} from '@/lib/voiceAgentProtocol';
import {
  VOICE_MIC_PERMISSION_PROMPT,
  VOICE_MIC_PERMISSION_TIMEOUT_LINE,
  VOICE_MIC_PERMISSION_WAIT_MS,
  VOICE_WELCOME_HINT,
  buildVoiceExactSpeakCue,
  buildVoiceSessionStartCue,
  pickVoiceExitVeil,
  pickVoiceIdleCheckIn,
  pickVoiceIdleHangup,
} from '@/lib/voiceAgentProtocol';
import {
  formatMicrophoneError,
  getMicrophonePermissionState,
  microphoneAccessContext,
} from '@/lib/microphoneAccess';
import {
  consumeVoiceInvocationContext,
  consumeVoiceModeRequest,
  getVoiceExitReason,
  peekVoiceModeRequest,
  subscribeVoiceModeBus,
} from '@/lib/voiceModeStore';
import {
  parseVoiceClientSnapshot,
  topicFromPath,
  type VoiceClientSnapshot,
  type VoiceInvocationContext,
} from '@/lib/voiceClientSnapshot';
import { getDiscoActiveSync, getMasterVolumeSync, getSoundsMutedSync } from '@/hooks/useStickers';
import { getEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { getSitePrefsSnapshot } from '@/hooks/useSitePrefs';

export type VoiceHudPhase = 'idle' | 'intro' | 'live' | 'exiting';

export type VoiceSubtitlePhase = 'hidden' | 'visible' | 'exiting';

export type VoiceRecoveryState = 'none' | 'retryable';

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
  recovery: VoiceRecoveryState;
}

export const VOICE_SUBTITLE_IDLE_MS = 700;
export const VOICE_SUBTITLE_FADE_MS = 280;
export const VOICE_SUBTITLE_REDUCED_FADE_MS = 0;
export const VOICE_IDLE_CHECKIN_MS = 15_000;
export const VOICE_IDLE_HANGUP_MS = 25_000;
export const VOICE_EXIT_VEIL_MS = 2_200;
export const VOICE_EXIT_VEIL_REDUCED_MS = 400;
export const VOICE_PROJECT_VIDEO_WAIT_MS = 2_500;

export interface VoiceHangupRequest {
  force?: boolean;
  reason?: VoiceExitReason;
}

export const VOICE_HOST_READY_TIMEOUT_MS = 6_000;
export const VOICE_CALLBACK_GAP_MS = 1_100;

const VOICE_RETRYABLE_STATUS = 'Call dropped.';
const VOICE_RETRYABLE_ERROR = 'Call dropped. Try again or hang up.';
const VOICE_PLAYBACK_RESUME_ERROR = 'Audio output could not start. Try again or hang up.';
const VOICE_START_FAILED_STATUS = 'Voice mode is unavailable.';
const VOICE_START_FAILED_ERROR = 'Unable to start the call.';
const VOICE_MIC_PERMISSION_ERROR = 'Microphone permission is needed.';

export interface VoiceSessionRuntimeDeps {
  createCaller: () => VoiceCaller;
  createPlayback: (options?: VoicePlaybackOptions) => VoicePlayback;
  startCapture: typeof startVoiceCapture;
  fetchSession: (
    lowNetwork: boolean,
    snapshot?: VoiceClientSnapshot,
  ) => Promise<VoiceSessionHandle>;
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
  recovery: 'none',
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
let pendingInvocationContext: VoiceInvocationContext | null = null;
let streamEndTimer: ReturnType<typeof setTimeout> | null = null;
let streamEndSent = false;
let toolCallQueue: Array<{ call: SiteToolCall; generation: number }> = [];
let toolCallDraining = false;
let toolCallDrainEpoch = 0;
let micEnableInFlight = false;
const seenVoiceToolIds = new Set<string>();
const cancelledVoiceToolIds = new Set<string>();
let farewellArmed = false;
let farewellHeard = false;
let farewellSawPlayback = false;
let farewellTurnComplete = false;
let subtitleIdleTimer: ReturnType<typeof setTimeout> | null = null;
let subtitleFadeTimer: ReturnType<typeof setTimeout> | null = null;
let idleCheckInTimer: ReturnType<typeof setTimeout> | null = null;
let idleHangupTimer: ReturnType<typeof setTimeout> | null = null;
let exitVeilTimer: ReturnType<typeof setTimeout> | null = null;
let micPermissionWaitTimer: ReturnType<typeof setTimeout> | null = null;
let withheldWelcome: { welcomeGreeting: string; welcomeHint: string } | null = null;
let idleCheckedIn = false;
let subtitleSpeaker: 'user' | 'agent' | null = null;
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

function clearStreamEndTimer(): void {
  if (streamEndTimer === null) return;
  clearTimeout(streamEndTimer);
  streamEndTimer = null;
}

function resetStreamEndWatch(): void {
  clearStreamEndTimer();
  streamEndSent = false;
}

function scheduleStreamEnd(generation: number): void {
  clearStreamEndTimer();
  if (!sendAudioLive || !socketReady || stopping || isStale(generation)) return;
  streamEndTimer = setTimeout(() => {
    streamEndTimer = null;
    if (isStale(generation) || stopping || !snapshot.active) return;
    if (!capture || !sendAudioLive || !socketReady || streamEndSent) return;
    streamEndSent = true;
    caller?.endAudioStream?.();
  }, VOICE_CALLBACK_GAP_MS);
}

function noteSentCaptureFrame(generation: number): void {
  if (streamEndSent) streamEndSent = false;
  scheduleStreamEnd(generation);
}

function handleCaptureFrame(chunk: ArrayBuffer, generation: number): void {
  if (isStale(generation) || stopping) return;
  if (!sendAudioLive || !socketReady) return;
  if (playback?.isBusy()) {
    if (streamEndTimer !== null && !streamEndSent) {
      clearStreamEndTimer();
      streamEndSent = true;
      caller?.endAudioStream?.();
    }
    return;
  }
  caller?.sendAudio(chunk);
  noteSentCaptureFrame(generation);
}

function clearMicPermissionWait(): void {
  if (micPermissionWaitTimer === null) return;
  clearTimeout(micPermissionWaitTimer);
  micPermissionWaitTimer = null;
}

function resetMicPermissionWait(): void {
  clearMicPermissionWait();
  withheldWelcome = null;
}

function startMicPermissionWait(generation: number): void {
  clearMicPermissionWait();
  micPermissionWaitTimer = setTimeout(() => {
    micPermissionWaitTimer = null;
    if (isStale(generation) || capture || stopping || !snapshot.active) return;
    caller?.sendText(buildVoiceExactSpeakCue(VOICE_MIC_PERMISSION_TIMEOUT_LINE));
    armAgentFarewellHangup('error');
  }, VOICE_MIC_PERMISSION_WAIT_MS);
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
  };
}

function resolveDeps(): VoiceSessionRuntimeDeps {
  return { ...defaultDeps(), ...depsOverride };
}

function publicVoiceError(caught: unknown, fallback: string): string {
  if (!(caught instanceof Error)) return fallback;
  const message = caught.message.trim();
  if (
    message === 'Voice session is warming up. Try again shortly.'
    || message === 'This origin is not allowed to start a voice session.'
    || message === 'Unable to start voice session.'
  ) {
    return message;
  }
  return fallback;
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

function livePathname(): string {
  if (typeof window !== 'undefined' && window.location?.pathname) {
    const path = window.location.pathname;
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  }
  if (hostRuntime?.pathname) return hostRuntime.pathname;
  return '/';
}

function liveSearch(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.search ?? '';
}

function themeFromRuntime(): 'light' | 'dark' | undefined {
  return hostRuntime?.resolvedTheme === 'dark'
    ? 'dark'
    : hostRuntime?.resolvedTheme === 'light'
      ? 'light'
      : undefined;
}

function buildMintSnapshot(context?: VoiceInvocationContext | null): VoiceClientSnapshot | undefined {
  const route = livePathname();
  const openProject = readProjectSlugFromSearch(liveSearch());
  let disco: boolean | undefined;
  let muted: boolean | undefined;
  let volume: number | undefined;
  try {
    disco = getDiscoActiveSync();
    muted = getSoundsMutedSync();
    volume = Math.round(getMasterVolumeSync() * 100);
  } catch {
    disco = hostRuntime?.discoActive;
  }
  const next: VoiceClientSnapshot = {
    route: parseVoiceClientSnapshot({ route })?.route,
    theme: themeFromRuntime(),
    disco,
    muted,
    volume,
    source: context?.source,
    topic: topicFromPath(route),
    openProject: parseVoiceClientSnapshot({ route, openProject })?.openProject,
  };
  return parseVoiceClientSnapshot(next);
}

function sampleMintSnapshot(): VoiceClientSnapshot | undefined {
  return buildMintSnapshot(pendingInvocationContext);
}

async function mintBrowserVoiceSession(
  lowNetwork: boolean,
  clientSnapshot?: VoiceClientSnapshot,
): Promise<VoiceSessionHandle> {
  const sessionRes = await fetch('/api/voice/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lowNetwork,
      ...(clientSnapshot ? { snapshot: clientSnapshot } : {}),
    }),
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
  return snapshot.introComplete
    && snapshot.recovery === 'none'
    && !playback?.isBusy()
    && !stopping;
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

function hostUnavailableResult(hostId: SiteActionHostId): SiteToolResult {
  const spokenText: Record<SiteActionHostId, string> = {
    'project-video': 'No project video is open right now.',
    chat: 'Chat is not open right now.',
    terminal: 'The terminal is not open on this page.',
    guestbook: 'The guestbook is not open right now.',
    feedback: 'Feedback is not open right now.',
  };
  return {
    ok: false,
    spokenText: spokenText[hostId],
    errorCode: `${hostId}-unavailable`,
  };
}

async function executeSiteToolSafely(
  call: SiteToolCall,
  runtime: SiteToolRuntime,
  commit: boolean,
): Promise<SiteToolResult> {
  try {
    return await executeSiteTool(call, runtime, { commit });
  } catch {
    return {
      ok: false,
      spokenText: 'That action could not finish just now.',
      errorCode: 'action-failed',
    };
  }
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
      finish(hostUnavailableResult('project-video'));
    }

    function check(): void {
      if (settled) return;
      if (isVoiceToolCancelled(call.id)) {
        finish(hostUnavailableResult('project-video'));
        return;
      }
      if (isStale(generation) || stopping || !snapshot.active) {
        finish(hostUnavailableResult('project-video'));
        return;
      }
      if (!canCommitSideEffects()) return;
      if (timeout === null) {
        timeout = setTimeout(() => {
          timeout = null;
          finish(hostUnavailableResult('project-video'));
        }, VOICE_PROJECT_VIDEO_WAIT_MS);
      }
      if (!isSiteActionHostReady('project-video')) return;

      const runtime = requireHostRuntime();
      cleanup();
      void executeSiteTool(call, runtime, { commit: true }).then(
        result => finish(result),
        () => finish(hostUnavailableResult('project-video')),
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

function resetSeenVoiceTools(): void {
  seenVoiceToolIds.clear();
  cancelledVoiceToolIds.clear();
  toolCallQueue = [];
  toolCallDrainEpoch += 1;
}

function isVoiceToolCancelled(callId: string): boolean {
  return cancelledVoiceToolIds.has(callId);
}

function applyToolCancellation(ids: readonly string[]): void {
  for (const id of ids) {
    if (id) cancelledVoiceToolIds.add(id);
  }
  if (cancelledVoiceToolIds.size === 0) return;
  toolCallQueue = toolCallQueue.filter(item => !cancelledVoiceToolIds.has(item.call.id));
  notifyProjectVideoWaiters();
}

function handlePlaybackResumeError(generation: number): void {
  if (isStale(generation) || stopping || !snapshot.active) return;
  if (snapshot.recovery === 'retryable') return;
  enterRetryableScreen(VOICE_PLAYBACK_RESUME_ERROR);
}

function hostArgsForVoiceTool(call: SiteToolCall): { field?: string } | null {
  return call.name === 'fill_field' ? { field: call.args.field } : null;
}

async function enqueueVoiceSideEffect(
  call: SiteToolCall,
  generation: number,
): Promise<SiteToolResult> {
  const policy = resolveVoiceToolPolicy(call.name, hostArgsForVoiceTool(call));
  const hostId = policy.hostId;
  if (policy.timing === 'immediate' && hostId === null) {
    return executeSiteToolSafely(call, requireHostRuntime(), true);
  }
  let result: SiteToolResult | undefined;
  const outcome = await queue?.enqueue(async () => {
    if (isStale(generation) || stopping || isVoiceToolCancelled(call.id)) return;
    result = await executeSiteToolSafely(call, requireHostRuntime(), true);
  }, hostId ? {
    ready: () => isSiteActionHostReady(hostId),
    readyTimeoutMs: VOICE_HOST_READY_TIMEOUT_MS,
  } : undefined);
  if (outcome === 'timed-out' && hostId) return hostUnavailableResult(hostId);
  return result ?? {
    ok: false,
    spokenText: 'That action was cancelled before it could finish.',
    errorCode: 'action-cancelled',
  };
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
    && snapshot.recovery === 'none'
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
  if (idleCheckedIn && source !== 'user' && source !== 'mic') return;
  if (snapshot.hangupPending || snapshot.hud === 'exiting' || stopping) {
    resetIdleWatch();
    return;
  }
  resetIdleWatch();
  scheduleIdleCheckIn();
}

function beginExitVeil(reason: VoiceExitReason): void {
  stopping = true;
  teardownMedia(reason);
  const exitLine = pickVoiceExitVeil();
  const generation = currentGeneration();
  patch({
    hud: 'exiting',
    phase: 'exiting',
    status: exitLine,
    exitLine,
    active: true,
    recovery: 'none',
  });
  const veilMs = prefersReducedSubtitleMotion() ? VOICE_EXIT_VEIL_REDUCED_MS : VOICE_EXIT_VEIL_MS;
  exitVeilTimer = setTimeout(() => {
    exitVeilTimer = null;
    if (isStale(generation)) return;
    finishStop(reason);
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
    recovery: 'none',
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
    pathname: livePathname(),
  };
}

function teardownMedia(reason: VoiceExitReason): void {
  stopVoiceSounds();
  cancelPendingVoiceCaptures();
  disposePrimedVoiceAudio();
  sendAudioLive = false;
  socketReady = false;
  greetTurnComplete = false;
  micEnableInFlight = false;
  resetIdleWatch();
  clearExitVeilTimer();
  resetStreamEndWatch();
  resetMicPermissionWait();
  resetSubtitleState();
  resetFarewellWait();
  resetSeenVoiceTools();
  cancelProjectVideoWaiters();
  capture?.stop();
  capture = null;
  playback?.interrupt();
  playback?.close();
  playback = null;
  const activeCaller = caller;
  caller = null;
  unsubs.forEach(unsub => unsub());
  unsubs = [];
  queue?.reset();
  queue = null;
  if (activeCaller) activeCaller.close(reason);
}

function finishStop(reason: VoiceExitReason): void {
  if (stopping && !snapshot.active && !starting) return;
  stopping = true;
  const nextGeneration = snapshot.generation + 1;
  pendingInvocationContext = null;
  teardownMedia(reason);
  starting = false;
  snapshot = {
    ...IDLE_SNAPSHOT,
    generation: nextGeneration,
  };
  stopping = false;
  emit();
}

function enterRetryableScreen(error: string, status = VOICE_RETRYABLE_STATUS): void {
  const keepHud = snapshot.hud === 'intro' || snapshot.hud === 'live' ? snapshot.hud : 'intro';
  const keepWelcome = snapshot.welcomeHint || VOICE_WELCOME_HINT;
  const keepLowNetwork = snapshot.lowNetwork;
  const keepIntroComplete = snapshot.introComplete && keepHud === 'live';
  const generation = snapshot.generation + 1;
  teardownMedia('error');
  starting = false;
  stopping = false;
  snapshot = {
    ...IDLE_SNAPSHOT,
    active: true,
    hud: keepHud,
    phase: 'error',
    status,
    error,
    welcomeHint: keepWelcome,
    lowNetwork: keepLowNetwork,
    introComplete: keepIntroComplete,
    generation,
    recovery: 'retryable',
  };
  emit();
}

async function handleSiteToolCall(call: SiteToolCall, generation: number): Promise<void> {
  const activeCaller = caller;
  if (!activeCaller || isStale(generation) || stopping) return;
  if (isVoiceToolCancelled(call.id)) return;

  if (call.name === 'start_voice_session') {
    activeCaller.sendToolResult(call.id, {
      ok: true,
      spokenText: 'Already in voice mode.',
    }, call.name);
    return;
  }

  const alreadySeen = seenVoiceToolIds.has(call.id);
  if (!alreadySeen) seenVoiceToolIds.add(call.id);

  const policy = resolveVoiceToolPolicy(call.name, hostArgsForVoiceTool(call));
  const runtime = requireHostRuntime();
  let result: SiteToolResult;
  if (alreadySeen) {
    result = { ok: true, spokenText: 'Already handling that.' };
  } else if (call.name === 'end_voice_session') {
    result = await executeSiteToolSafely(call, runtime, false);
  } else if (call.name === 'control_project_video') {
    result = await waitForProjectVideoControl(call, generation);
  } else if (policy.timing === 'deferred' || policy.hostId !== null) {
    result = await enqueueVoiceSideEffect(call, generation);
  } else {
    result = await executeSiteToolSafely(call, runtime, true);
  }
  if (isVoiceToolCancelled(call.id) || isStale(generation) || caller !== activeCaller) return;
  activeCaller.sendToolResult(call.id, result, call.name);
  if (!alreadySeen && result.ok && call.name !== 'end_voice_session') playVoiceAction();

  if (!alreadySeen && result.ok && call.name === 'end_voice_session') {
    armAgentFarewellHangup(call.args.reason ?? 'user');
  }
}

function enqueueToolCall(call: SiteToolCall): void {
  toolCallQueue.push({ call, generation: currentGeneration() });
  void drainToolCalls();
}

async function drainToolCalls(): Promise<void> {
  if (toolCallDraining) return;
  toolCallDraining = true;
  const drainEpoch = toolCallDrainEpoch;
  try {
    while (drainEpoch === toolCallDrainEpoch && toolCallQueue.length > 0) {
      const next = toolCallQueue.shift();
      if (!next) break;
      if (isStale(next.generation)) continue;
      await handleSiteToolCall(next.call, next.generation);
    }
  } finally {
    toolCallDraining = false;
    if (toolCallQueue.length > 0) void drainToolCalls();
  }
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
        patch({ phase: snapshot.phase === 'acting' ? 'acting' : 'speaking' });
        return;
      }
      patch({ phase: next });
    }),
    nextCaller.on('userTranscript', text => {
      if (isStale(generation)) return;
      applySpokenTranscript('user', text, generation);
      noteVoiceActivity('user');
    }),
    nextCaller.on('agentTranscript', text => {
      if (isStale(generation)) return;
      applySpokenTranscript('agent', text, generation);
      noteVoiceActivity('agent');
    }),
    nextCaller.on('audio', chunk => {
      if (isStale(generation) || stopping) return;
      markFarewellPlayback();
      nextPlayback.play(chunk);
      notifyVoiceActionQueueReady();
    }),
    nextCaller.on('interrupted', () => {
      if (isStale(generation) || stopping) return;
      nextPlayback.interrupt();
      notifyVoiceActionQueueReady();
    }),
    nextCaller.on('toolCall', call => {
      if (isStale(generation) || stopping) return;
      noteVoiceActivity('tool');
      enqueueToolCall(call);
    }),
    nextCaller.on('toolCancellation', ids => {
      if (isStale(generation) || stopping) return;
      applyToolCancellation(ids);
    }),
    nextCaller.on('turnComplete', () => {
      if (isStale(generation)) return;
      nextPlayback.finishTurn?.();
      greetTurnComplete = true;
      if (farewellArmed) farewellTurnComplete = true;
      tryMarkIntroComplete();
      scheduleSubtitleClear(generation);
      notifyVoiceActionQueueReady();
    }),
    nextCaller.on('health', status => {
      if (isStale(generation) || stopping) return;
      if (status.ok !== false) return;
      enterRetryableScreen(VOICE_RETRYABLE_ERROR);
    }),
    nextCaller.on('error', () => {
      if (isStale(generation) || stopping) return;
      enterRetryableScreen(VOICE_RETRYABLE_ERROR);
    }),
    nextCaller.on('ended', reason => {
      if (isStale(generation) || stopping) return;
      if (reason !== 'user') {
        enterRetryableScreen(VOICE_RETRYABLE_ERROR);
        return;
      }
      stopVoiceSession(reason);
    }),
    nextPlayback.subscribeIdle(() => {
      if (isStale(generation)) return;
      if (snapshot.phase === 'speaking' || snapshot.phase === 'acting') {
        patch({ phase: 'listening' });
      }
      tryMarkIntroComplete();
      scheduleSubtitleClear(generation);
      notifyVoiceActionQueueReady();
    }),
  ];
}

async function resolveMicrophoneError(caught: unknown): Promise<string> {
  const permissionState = await getMicrophonePermissionState();
  return formatMicrophoneError(caught, microphoneAccessContext(permissionState));
}

async function bootSession(): Promise<void> {
  const generation = snapshot.generation;
  try {
    const d = resolveDeps();
    const nextCaller = d.createCaller();
    caller = nextCaller;
    const nextPlayback = d.createPlayback({
      onResumeError: () => handlePlaybackResumeError(generation),
    });
    if (isStale(generation) || stopping || snapshot.recovery === 'retryable' || !snapshot.active) {
      nextPlayback.close();
      return;
    }
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

    let captureError: unknown = null;
    const nextCapture = await d.startCapture(chunk => {
      handleCaptureFrame(chunk, generation);
    }, { lowNetwork: prefs.lowNetwork }).catch(caught => {
      captureError = caught;
      return null;
    });
    if (isStale(generation) || stopping) {
      nextCapture?.stop();
      return;
    }
    if (nextCapture) {
      capture = nextCapture;
      patch({ micLive: true, error: null });
    } else {
      const micError = captureError
        ? await resolveMicrophoneError(captureError)
        : VOICE_MIC_PERMISSION_ERROR;
      if (isStale(generation) || stopping) return;
      patch({
        micLive: false,
        status: VOICE_MIC_PERMISSION_PROMPT,
        error: micError,
      });
    }

    const minted = sampleMintSnapshot();
    const session = await d.fetchSession(prefs.lowNetwork, minted);
    if (isStale(generation) || stopping) return;
    const hasMic = capture != null;
    const connectSession = hasMic
      ? session
      : {
          ...session,
          setup: {
            ...session.setup,
            greetOnConnect: false,
          },
        };
    if (!hasMic) {
      withheldWelcome = {
        welcomeGreeting: session.setup.welcomeGreeting,
        welcomeHint: session.setup.welcomeHint,
      };
    }
    await nextCaller.connect(connectSession);
    if (isStale(generation) || stopping) return;
    sendAudioLive = hasMic;
    socketReady = true;
    patch({
      phase: 'listening',
      status: hasMic ? 'Connected. Waiting for the welcome.' : VOICE_MIC_PERMISSION_PROMPT,
      welcomeHint: session.setup.welcomeHint || VOICE_WELCOME_HINT,
      error: hasMic ? null : snapshot.error,
      micLive: hasMic,
      recovery: 'none',
    });
    if (!hasMic) {
      nextCaller.sendText(buildVoiceExactSpeakCue(VOICE_MIC_PERMISSION_PROMPT));
      startMicPermissionWait(generation);
    }
    noteVoiceActivity('connect');
    tryMarkIntroComplete();
  } catch (caught) {
    if (isStale(generation) || stopping) return;
    enterRetryableScreen(publicVoiceError(caught, VOICE_START_FAILED_ERROR), VOICE_START_FAILED_STATUS);
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
  pendingInvocationContext = consumeVoiceInvocationContext();
  starting = true;
  socketReady = false;
  greetTurnComplete = false;
  resetSubtitleState();
  resetFarewellWait();
  resetIdleWatch();
  clearExitVeilTimer();
  resetMicPermissionWait();
  resetSeenVoiceTools();
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
    recovery: 'none',
  });
  return bootSession();
}

export function retryVoiceSession(): Promise<void> {
  if (stopping || starting) return Promise.resolve();
  if (!snapshot.active || snapshot.recovery !== 'retryable') return Promise.resolve();
  const keepLowNetwork = snapshot.lowNetwork;
  teardownMedia('error');
  starting = true;
  socketReady = false;
  greetTurnComplete = false;
  resetSubtitleState();
  resetFarewellWait();
  resetIdleWatch();
  resetMicPermissionWait();
  resetSeenVoiceTools();
  patch({
    active: true,
    hud: 'intro',
    phase: 'connecting',
    status: 'Switching to agent experience',
    userLine: '',
    agentLine: '',
    error: null,
    micLive: false,
    lowNetwork: keepLowNetwork,
    introComplete: false,
    hangupPending: false,
    welcomeHint: VOICE_WELCOME_HINT,
    exitLine: '',
    generation: snapshot.generation + 1,
    recovery: 'none',
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
  playVoiceToggle();
  if (options.force === true) {
    finishStop(reason);
    return;
  }
  beginExitVeil(reason);
}

export function requestVoiceHangup(options: VoiceHangupRequest = {}): void {
  if (!snapshot.active && !starting) return;
  const reason = options.reason ?? 'user';
  noteVoiceActivity('hangup');
  stopVoiceSession(reason, {
    force: options.force === true
      || snapshot.recovery === 'retryable'
      || snapshot.hud === 'exiting',
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
  if (!snapshot.active || capture || micEnableInFlight || stopping) return;
  if (snapshot.recovery === 'retryable') return;
  const generation = currentGeneration();
  const d = resolveDeps();
  micEnableInFlight = true;
  noteVoiceActivity('mic');
  clearMicPermissionWait();
  void d.startCapture(chunk => {
    handleCaptureFrame(chunk, generation);
  }, { lowNetwork: snapshot.lowNetwork }).then(nextCapture => {
    micEnableInFlight = false;
    if (isStale(generation) || stopping) {
      nextCapture.stop();
      return;
    }
    capture = nextCapture;
    sendAudioLive = socketReady;
    clearMicPermissionWait();
    const shouldSendWelcome = withheldWelcome != null && socketReady && !stopping && !snapshot.hangupPending;
    const welcome = withheldWelcome;
    if (shouldSendWelcome) withheldWelcome = null;
    patch({
      micLive: true,
      error: null,
      status: shouldSendWelcome ? 'Connected. Waiting for the welcome.' : snapshot.status,
    });
    if (shouldSendWelcome && welcome && caller) {
      caller.sendText(buildVoiceSessionStartCue({
        welcomeGreeting: welcome.welcomeGreeting,
        welcomeHint: welcome.welcomeHint || VOICE_WELCOME_HINT,
      }));
    }
  }).catch(async (caught) => {
    micEnableInFlight = false;
    if (isStale(generation) || stopping) return;
    const micError = await resolveMicrophoneError(caught);
    if (isStale(generation) || stopping) return;
    patch({
      micLive: false,
      status: VOICE_MIC_PERMISSION_PROMPT,
      error: micError,
    });
    if (socketReady && !stopping && snapshot.active && !capture && !snapshot.hangupPending) {
      startMicPermissionWait(generation);
    }
  });
}

export function setVoiceSessionRuntimeDepsForTests(deps: Partial<VoiceSessionRuntimeDeps> | null): void {
  depsOverride = deps;
}

export function resetVoiceSessionRuntimeForTests(): void {
  stopping = true;
  resetIdleWatch();
  clearExitVeilTimer();
  pendingInvocationContext = null;
  teardownMedia('user');
  starting = false;
  stopping = false;
  snapshot = IDLE_SNAPSHOT;
  hostRuntime = null;
  depsOverride = null;
  emit();
}
