import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteToolCall } from '@/lib/siteTools';
import type { VoiceCaller, VoiceCallerEventMap, VoiceSessionHandle } from '@/lib/voiceAgentProtocol';
import type { VoicePlayback } from '@/lib/voiceAudio';
import {
  attachSiteActionResult,
  CONTROL_PROJECT_VIDEO_EVENT,
  registerSiteActionHost,
  resetSiteActionHostsForTests,
} from '@/lib/siteActionEvents';
import {
  bindVoiceSessionHost,
  enableVoiceCapture,
  getVoiceSessionSnapshot,
  requestVoiceHangup,
  resetVoiceSessionRuntimeForTests,
  retryVoiceSession,
  setVoiceSessionRuntimeDepsForTests,
  startVoiceSession,
  stopVoiceSession,
  VOICE_CALLBACK_GAP_MS,
  VOICE_EXIT_VEIL_MS,
  VOICE_IDLE_CHECKIN_MS,
  VOICE_IDLE_HANGUP_MS,
  VOICE_PROJECT_VIDEO_WAIT_MS,
  VOICE_SUBTITLE_FADE_MS,
  VOICE_SUBTITLE_IDLE_MS,
} from '@/lib/voiceSessionRuntime';
import {
  buildVoiceExactSpeakCue,
  buildVoiceSessionStartCue,
  VOICE_EXIT_VEIL_VARIATIONS,
  VOICE_IDLE_CHECKIN_VARIATIONS,
  VOICE_IDLE_HANGUP_VARIATIONS,
  VOICE_MIC_PERMISSION_PROMPT,
  VOICE_MIC_PERMISSION_TIMEOUT_LINE,
  VOICE_MIC_PERMISSION_WAIT_MS,
  VOICE_WELCOME_HINT,
} from '@/lib/voiceAgentProtocol';

function createFakeCaller() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const toolResults: Array<{ id: string; result: unknown; name?: string }> = [];
  const sentTexts: string[] = [];
  const sentAudio: ArrayBuffer[] = [];
  const connectedSessions: VoiceSessionHandle[] = [];
  const endAudioStreamCalls: number[] = [];
  const close = vi.fn();
  let connectCount = 0;

  const caller: VoiceCaller = {
    id: 'fake-live',
    async connect(session) {
      connectCount += 1;
      connectedSessions.push(session);
    },
    sendAudio(chunk) {
      sentAudio.push(chunk);
    },
    sendText(text) {
      sentTexts.push(text);
    },
    sendToolResult(id, result, name) {
      toolResults.push({ id, result, name });
    },
    interrupt() {},
    close,
    endAudioStream() {
      endAudioStreamCalls.push(Date.now());
    },
    on(event, listener) {
      const bucket = listeners.get(event) ?? new Set<(payload: unknown) => void>();
      bucket.add(listener as (payload: unknown) => void);
      listeners.set(event, bucket);
      return () => bucket.delete(listener as (payload: unknown) => void);
    },
  };

  function emit<K extends keyof VoiceCallerEventMap>(event: K, payload: VoiceCallerEventMap[K]): void {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  }

  return {
    caller,
    emit,
    toolResults,
    sentTexts,
    sentAudio,
    connectedSessions,
    endAudioStreamCalls,
    getConnectCount: () => connectCount,
    close,
  };
}

function cueContainsCatalog(sent: readonly string[], catalog: readonly string[]): boolean {
  return sent.some(text => catalog.some(line => text.includes(line)));
}

function createFakePlayback() {
  let busy = false;
  const idleListeners = new Set<() => void>();
  const finishTurn = vi.fn();
  const close = vi.fn(() => {
    busy = false;
  });
  const play = vi.fn(() => {
    busy = true;
  });
  const playback: VoicePlayback = {
    play,
    finishTurn,
    interrupt() {
      busy = false;
      for (const listener of idleListeners) listener();
    },
    close,
    isBusy: () => busy,
    subscribeIdle(cb) {
      idleListeners.add(cb);
      return () => idleListeners.delete(cb);
    },
  };

  return {
    playback,
    play,
    finishTurn,
    close,
    setBusy(next: boolean) {
      busy = next;
      if (!next) {
        for (const listener of idleListeners) listener();
      }
    },
  };
}

const sessionHandle: VoiceSessionHandle = {
  token: 'token-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
  newSessionExpiresAt: '2099-01-01T00:01:00.000Z',
  setup: {
    modelLabel: 'native-live',
    voiceLabel: 'male',
    inputSampleRate: 16_000,
    outputSampleRate: 24_000,
    greetOnConnect: true,
    lowNetwork: false,
    welcomeGreeting: 'Hey, welcome in.',
    welcomeHint: VOICE_WELCOME_HINT,
  },
};

describe('voice session runtime singleton', () => {
  beforeEach(() => {
    resetVoiceSessionRuntimeForTests();
  });

  afterEach(() => {
    resetVoiceSessionRuntimeForTests();
    resetSiteActionHostsForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function boot() {
    const fakeCaller = createFakeCaller();
    const fakePlayback = createFakePlayback();
    const captureStop = vi.fn();
    const openProject = vi.fn();
    const push = vi.fn();
    const createCaller = vi.fn(() => fakeCaller.caller);
    let captureFrame: ((chunk: ArrayBuffer) => void) | null = null;
    let onPlaybackResumeError: (() => void) | undefined;
    const fetchSession = vi.fn(async () => sessionHandle);
    setVoiceSessionRuntimeDepsForTests({
      createCaller,
      createPlayback: (options) => {
        onPlaybackResumeError = options?.onResumeError;
        return fakePlayback.playback;
      },
      startCapture: async onFrame => {
        captureFrame = onFrame;
        return { stop: captureStop };
      },
      fetchSession,
    });
    bindVoiceSessionHost({
      router: { push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() } as never,
      setTheme: vi.fn(),
      resolvedTheme: 'light',
      discoActive: false,
      openFeedback: vi.fn(),
      openProject,
    });

    await startVoiceSession();
    expect({
      connectCount: fakeCaller.getConnectCount(),
      snapshot: getVoiceSessionSnapshot(),
    }).toMatchObject({
      connectCount: 1,
      snapshot: { error: null, active: true },
    });

    return {
      fakeCaller,
      fakePlayback,
      startVoiceSession,
      stopVoiceSession,
      createCaller,
      requestVoiceHangup,
      getVoiceSessionSnapshot,
      resetVoiceSessionRuntimeForTests,
      openProject,
      push,
      captureStop,
      fetchSession,
      pushCaptureFrame(chunk: ArrayBuffer) {
        captureFrame?.(chunk);
      },
      triggerPlaybackResumeError() {
        onPlaybackResumeError?.();
      },
    };
  }

  function goLive(runtime: Awaited<ReturnType<typeof boot>>) {
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      hud: 'live',
      introComplete: true,
      active: true,
    });
  }

  it('keeps only the latest spoken utterance and clears it after idle', async () => {
    const runtime = await boot();
    vi.useFakeTimers();

    runtime.fakeCaller.emit('userTranscript', 'open projects');
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      userLine: 'open projects',
      agentLine: '',
    });

    runtime.fakeCaller.emit('agentTranscript', 'Opening the projects page.');
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      userLine: '',
      agentLine: 'Opening the projects page.',
    });

    runtime.fakeCaller.emit('agentTranscript', ' Want one opened?');
    expect(runtime.getVoiceSessionSnapshot().agentLine).toBe('Opening the projects page. Want one opened?');

    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot().agentLine).toBe('Opening the projects page. Want one opened?');

    await vi.advanceTimersByTimeAsync(VOICE_SUBTITLE_IDLE_MS - 1);
    expect(runtime.getVoiceSessionSnapshot().agentLine).toBe('Opening the projects page. Want one opened?');

    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      agentLine: 'Opening the projects page. Want one opened?',
      subtitlePhase: 'exiting',
    });

    await vi.advanceTimersByTimeAsync(VOICE_SUBTITLE_FADE_MS);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      userLine: '',
      agentLine: '',
      subtitlePhase: 'hidden',
      error: null,
    });

    runtime.fakeCaller.emit('error', 'provider dumped a stack');
    await vi.advanceTimersByTimeAsync(VOICE_SUBTITLE_IDLE_MS + 50);
    expect(runtime.getVoiceSessionSnapshot().error).toBe('Call dropped. Try again or hang up.');

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('carries the minted welcome hint and still completes intro after the greet turn', async () => {
    const runtime = await boot();
    expect(runtime.getVoiceSessionSnapshot().welcomeHint).toBe(VOICE_WELCOME_HINT);

    runtime.fakePlayback.setBusy(true);
    runtime.fakeCaller.emit('turnComplete', true);
    expect(runtime.getVoiceSessionSnapshot().introComplete).toBe(false);

    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      hud: 'live',
      introComplete: true,
    });

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('starts once, stays intro until greet turnComplete and playback idle, then goes live', async () => {
    const runtime = await boot();
    const firstGeneration = runtime.getVoiceSessionSnapshot().generation;

    runtime.startVoiceSession();
    expect(runtime.fakeCaller.getConnectCount()).toBe(1);
    expect(runtime.createCaller).toHaveBeenCalledTimes(1);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'intro',
      introComplete: false,
      generation: firstGeneration,
    });

    runtime.fakePlayback.setBusy(true);
    runtime.fakeCaller.emit('turnComplete', true);
    expect(runtime.getVoiceSessionSnapshot().introComplete).toBe(false);

    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      hud: 'live',
      introComplete: true,
      generation: firstGeneration,
    });

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('does not remint or re-greet when start is called again during a live session', async () => {
    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot().hud).toBe('live');

    runtime.startVoiceSession();
    expect(runtime.fakeCaller.getConnectCount()).toBe(1);

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('closes a socket drop and leaves manual retry available', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('health', { ok: false, configured: true });
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'live',
      phase: 'error',
      recovery: 'retryable',
      error: 'Call dropped. Try again or hang up.',
    });
    expect(runtime.fakeCaller.getConnectCount()).toBe(1);
    expect(runtime.fetchSession).toHaveBeenCalledTimes(1);
    expect(runtime.captureStop).toHaveBeenCalled();
    expect(runtime.fakePlayback.close).toHaveBeenCalled();
    expect(runtime.fakeCaller.close).toHaveBeenCalledWith('error');

    await retryVoiceSession();
    expect(runtime.createCaller).toHaveBeenCalledTimes(2);
    expect(runtime.fetchSession).toHaveBeenCalledTimes(2);
    expect(runtime.fakeCaller.getConnectCount()).toBe(2);

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('defers navigate_to until intro is done and playback is idle', async () => {
    const runtime = await boot();
    const call = {
      id: 'nav-1',
      name: 'navigate_to',
      args: { path: '/projects' },
    } as SiteToolCall;

    runtime.fakePlayback.setBusy(true);
    runtime.fakeCaller.emit('toolCall', call);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    expect(runtime.push).not.toHaveBeenCalled();

    runtime.fakeCaller.emit('turnComplete', true);
    expect(runtime.push).not.toHaveBeenCalled();

    runtime.fakePlayback.setBusy(false);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.push).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({ ok: true, spokenText: 'Taking you there.' });
    });

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('closes active media on the first hangup even while playback is busy', async () => {
    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(true);

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
      hangupPending: false,
    });
    expect(runtime.captureStop).toHaveBeenCalled();
    expect(runtime.fakePlayback.close).toHaveBeenCalled();
    expect(runtime.fakeCaller.close).toHaveBeenCalledWith('user');

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('shows the exit veil on user hangup while playback is idle', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });
    expect(runtime.captureStop).toHaveBeenCalled();
    expect(runtime.fakePlayback.close).toHaveBeenCalled();
    expect(runtime.fakeCaller.close).toHaveBeenCalledWith('user');
    expect(VOICE_EXIT_VEIL_VARIATIONS).toContain(runtime.getVoiceSessionSnapshot().exitLine);

    await vi.advanceTimersByTimeAsync(VOICE_EXIT_VEIL_MS);
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('finishes immediately on a second hangup during the exit veil', async () => {
    const runtime = await boot();
    goLive(runtime);

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('sends an idle check-in after the quiet window and stays live', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    await vi.advanceTimersByTimeAsync(VOICE_IDLE_CHECKIN_MS);
    expect(cueContainsCatalog(runtime.fakeCaller.sentTexts, VOICE_IDLE_CHECKIN_VARIATIONS)).toBe(true);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'live',
      hangupPending: false,
    });

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('cancels idle hangup when the visitor speaks after check-in', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    await vi.advanceTimersByTimeAsync(VOICE_IDLE_CHECKIN_MS);
    expect(cueContainsCatalog(runtime.fakeCaller.sentTexts, VOICE_IDLE_CHECKIN_VARIATIONS)).toBe(true);

    runtime.fakeCaller.emit('userTranscript', 'still here');
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_HANGUP_MS - VOICE_IDLE_CHECKIN_MS);
    expect(cueContainsCatalog(runtime.fakeCaller.sentTexts, VOICE_IDLE_HANGUP_VARIATIONS)).toBe(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'live',
      hangupPending: false,
    });

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('hangs up after a silent check-in, then finishes through farewell and the exit veil', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    await vi.advanceTimersByTimeAsync(VOICE_IDLE_CHECKIN_MS);
    expect(cueContainsCatalog(runtime.fakeCaller.sentTexts, VOICE_IDLE_CHECKIN_VARIATIONS)).toBe(true);

    await vi.advanceTimersByTimeAsync(VOICE_IDLE_HANGUP_MS - VOICE_IDLE_CHECKIN_MS);
    expect(cueContainsCatalog(runtime.fakeCaller.sentTexts, VOICE_IDLE_HANGUP_VARIATIONS)).toBe(true);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hangupPending: true,
    });

    runtime.fakeCaller.emit('audio', new ArrayBuffer(2));
    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });

    await vi.advanceTimersByTimeAsync(VOICE_EXIT_VEIL_MS);
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('does not start idle hangup after a health drop', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('ended', 'health');
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'live',
      phase: 'error',
      recovery: 'retryable',
      error: 'Call dropped. Try again or hang up.',
    });

    await vi.advanceTimersByTimeAsync(VOICE_IDLE_HANGUP_MS);
    expect(cueContainsCatalog(runtime.fakeCaller.sentTexts, VOICE_IDLE_CHECKIN_VARIATIONS)).toBe(false);
    expect(cueContainsCatalog(runtime.fakeCaller.sentTexts, VOICE_IDLE_HANGUP_VARIATIONS)).toBe(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'live',
      hangupPending: false,
    });

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('waits for goodbye audio after end_voice_session while idle', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('toolCall', {
      id: 'end-1',
      name: 'end_voice_session',
      args: { reason: 'user' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({
      ok: true,
      spokenText: 'Leaving voice mode.',
    });
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hangupPending: true,
    });

    runtime.fakeCaller.emit('audio', new ArrayBuffer(2));
    expect(runtime.getVoiceSessionSnapshot().active).toBe(true);

    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });

    await vi.advanceTimersByTimeAsync(VOICE_EXIT_VEIL_MS);
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('waits for idle when end_voice_session arrives during goodbye playback', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(true);

    runtime.fakeCaller.emit('toolCall', {
      id: 'end-2',
      name: 'end_voice_session',
      args: { reason: 'user' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({ ok: true });
    expect(runtime.getVoiceSessionSnapshot().active).toBe(true);

    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });

    await vi.advanceTimersByTimeAsync(VOICE_EXIT_VEIL_MS);
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('dedupes Gemini tool calls by id only, not by semantic args', async () => {
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('toolCall', {
      id: 'theme-same',
      name: 'set_theme',
      args: { action: 'dark' },
    } as SiteToolCall);
    runtime.fakeCaller.emit('toolCall', {
      id: 'theme-same',
      name: 'set_theme',
      args: { action: 'dark' },
    } as SiteToolCall);
    runtime.fakeCaller.emit('toolCall', {
      id: 'theme-other',
      name: 'set_theme',
      args: { action: 'dark' },
    } as SiteToolCall);
    await vi.waitFor(() => {
      expect(runtime.fakeCaller.toolResults).toHaveLength(3);
    });
    expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({ ok: true });
    expect(runtime.fakeCaller.toolResults[1]?.result).toMatchObject({
      ok: true,
      spokenText: 'Already handling that.',
    });
    expect(runtime.fakeCaller.toolResults[2]?.result).toMatchObject({ ok: true });

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('keeps project-video control queued while busy past the old timeout and commits once ready', async () => {
    const committedResults: Array<{ ok: boolean; spokenText: string }> = [];
    const dispatchEvent = vi.fn((event: Event) => {
      if (event.type === CONTROL_PROJECT_VIDEO_EVENT) {
        const result = {
          ok: true,
          spokenText: 'Playing the preview.',
        };
        committedResults.push(result);
        attachSiteActionResult(event, result);
      }
      return true;
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);
    runtime.fakePlayback.setBusy(true);

    runtime.fakeCaller.emit('toolCall', {
      id: 'play-1',
      name: 'control_project_video',
      args: { action: 'play' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(VOICE_PROJECT_VIDEO_WAIT_MS + 1);
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);

    runtime.fakePlayback.setBusy(false);
    const unregister = registerSiteActionHost('project-video');
    await vi.advanceTimersByTimeAsync(40);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(committedResults).toHaveLength(1);
    expect(committedResults[0]).toMatchObject({
      ok: true,
      spokenText: 'Playing the preview.',
    });
    expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({
      ok: true,
      spokenText: 'Playing the preview.',
    });
    expect(runtime.fakeCaller.toolResults).toHaveLength(1);

    unregister();
    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('returns a bounded unavailable result after commit readiness when no project host registers', async () => {
    const dispatchEvent = vi.fn((event: Event) => Boolean(event));
    vi.stubGlobal('window', { dispatchEvent });
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);
    runtime.fakePlayback.setBusy(true);

    runtime.fakeCaller.emit('toolCall', {
      id: 'play-no-host',
      name: 'control_project_video',
      args: { action: 'play' },
    } as SiteToolCall);
    await Promise.resolve();
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);

    runtime.fakePlayback.setBusy(false);
    await vi.advanceTimersByTimeAsync(VOICE_PROJECT_VIDEO_WAIT_MS);
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({
      ok: false,
      errorCode: 'project-video-unavailable',
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      type: CONTROL_PROJECT_VIDEO_EVENT,
    }));

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('cancels a waiting project-video control on hangup and never dispatches during exit', async () => {
    const dispatchEvent = vi.fn((event: Event) => Boolean(event));
    vi.stubGlobal('window', { dispatchEvent });
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('toolCall', {
      id: 'play-exit',
      name: 'control_project_video',
      args: { action: 'play' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    expect(dispatchEvent).not.toHaveBeenCalled();

    runtime.requestVoiceHangup();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);

    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      type: CONTROL_PROJECT_VIDEO_EVENT,
    }));

    const unregister = registerSiteActionHost('project-video');
    await vi.advanceTimersByTimeAsync(VOICE_PROJECT_VIDEO_WAIT_MS + VOICE_EXIT_VEIL_MS);
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      type: CONTROL_PROJECT_VIDEO_EVENT,
    }));

    unregister();
    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('connects after mic deny, speaks the permission prompt, then times out', async () => {
    vi.useFakeTimers();
    const fakeCaller = createFakeCaller();
    const fakePlayback = createFakePlayback();
    const fetchSession = vi.fn(async () => sessionHandle);
    setVoiceSessionRuntimeDepsForTests({
      createCaller: () => fakeCaller.caller,
      createPlayback: () => fakePlayback.playback,
      startCapture: async () => {
        throw new Error('denied');
      },
      fetchSession,
    });
    bindVoiceSessionHost({
      router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() } as never,
      setTheme: vi.fn(),
      resolvedTheme: 'light',
      discoActive: false,
      openFeedback: vi.fn(),
      openProject: vi.fn(),
    });

    await startVoiceSession();
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(fakeCaller.getConnectCount()).toBe(1);
    expect(fakeCaller.connectedSessions[0]?.setup.greetOnConnect).toBe(false);
    expect(fakeCaller.sentTexts).toContain(buildVoiceExactSpeakCue(VOICE_MIC_PERMISSION_PROMPT));
    expect(getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      micLive: false,
      error: 'Voice input could not start. Try again.',
      status: VOICE_MIC_PERMISSION_PROMPT,
    });
    expect(getVoiceSessionSnapshot().phase).not.toBe('error');

    await vi.advanceTimersByTimeAsync(VOICE_MIC_PERMISSION_WAIT_MS);
    expect(fakeCaller.sentTexts).toContain(buildVoiceExactSpeakCue(VOICE_MIC_PERMISSION_TIMEOUT_LINE));
    expect(getVoiceSessionSnapshot().hangupPending).toBe(true);

    fakeCaller.emit('audio', new ArrayBuffer(2));
    fakePlayback.setBusy(false);
    expect(getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });

    resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('enables a late mic grant without reminting and sends the withheld welcome', async () => {
    vi.useFakeTimers();
    const fakeCaller = createFakeCaller();
    const fakePlayback = createFakePlayback();
    const fetchSession = vi.fn(async () => sessionHandle);
    let captureAttempts = 0;
    const captureState: { onFrame: ((chunk: ArrayBuffer) => void) | null } = { onFrame: null };
    setVoiceSessionRuntimeDepsForTests({
      createCaller: () => fakeCaller.caller,
      createPlayback: () => fakePlayback.playback,
      startCapture: async onFrame => {
        captureAttempts += 1;
        if (captureAttempts === 1) throw new Error('denied');
        captureState.onFrame = onFrame;
        return { stop: vi.fn() };
      },
      fetchSession,
    });
    bindVoiceSessionHost({
      router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() } as never,
      setTheme: vi.fn(),
      resolvedTheme: 'light',
      discoActive: false,
      openFeedback: vi.fn(),
      openProject: vi.fn(),
    });

    await startVoiceSession();
    expect(fakeCaller.getConnectCount()).toBe(1);
    enableVoiceCapture();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getVoiceSessionSnapshot()).toMatchObject({
      micLive: true,
      error: null,
    });
    expect(fakeCaller.sentTexts).toContain(buildVoiceSessionStartCue({
      welcomeGreeting: sessionHandle.setup.welcomeGreeting,
      welcomeHint: sessionHandle.setup.welcomeHint,
    }));

    fakePlayback.setBusy(false);
    expect(captureState.onFrame).toEqual(expect.any(Function));
    captureState.onFrame?.(new ArrayBuffer(4));
    expect(fakeCaller.sentAudio).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(VOICE_MIC_PERMISSION_WAIT_MS);
    expect(fakeCaller.sentTexts).not.toContain(buildVoiceExactSpeakCue(VOICE_MIC_PERMISSION_TIMEOUT_LINE));
    expect(fakeCaller.getConnectCount()).toBe(1);
    expect(fetchSession).toHaveBeenCalledTimes(1);

    resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('pauses mic PCM while playback is busy', async () => {
    const runtime = await boot();
    runtime.pushCaptureFrame(new ArrayBuffer(4));
    expect(runtime.fakeCaller.sentAudio).toHaveLength(1);

    runtime.fakePlayback.setBusy(true);
    runtime.pushCaptureFrame(new ArrayBuffer(4));
    expect(runtime.fakeCaller.sentAudio).toHaveLength(1);
    expect(runtime.fakeCaller.endAudioStreamCalls).toHaveLength(1);

    runtime.fakePlayback.setBusy(false);
    runtime.pushCaptureFrame(new ArrayBuffer(4));
    expect(runtime.fakeCaller.sentAudio).toHaveLength(2);

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('keeps speaking when the adapter emits listening during playback', async () => {
    const runtime = await boot();
    runtime.fakeCaller.emit('phase', 'speaking');
    runtime.fakePlayback.setBusy(true);
    runtime.fakeCaller.emit('phase', 'listening');
    expect(runtime.getVoiceSessionSnapshot().phase).toBe('speaking');

    runtime.fakeCaller.emit('phase', 'acting');
    runtime.fakeCaller.emit('phase', 'listening');
    expect(runtime.getVoiceSessionSnapshot().phase).toBe('acting');

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('plays model PCM and finishes its turn when the adapter completes', async () => {
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('audio', new ArrayBuffer(2));
    expect(runtime.fakePlayback.play).toHaveBeenCalled();

    runtime.fakePlayback.finishTurn.mockClear();
    runtime.fakeCaller.emit('turnComplete', true);
    expect(runtime.fakePlayback.finishTurn).toHaveBeenCalled();

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('sends one stream end after a 1100ms callback gap, then rearms on the next frame', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.pushCaptureFrame(new ArrayBuffer(4));
    await vi.advanceTimersByTimeAsync(VOICE_CALLBACK_GAP_MS);
    expect(runtime.fakeCaller.endAudioStreamCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(VOICE_CALLBACK_GAP_MS);
    expect(runtime.fakeCaller.endAudioStreamCalls).toHaveLength(1);

    runtime.pushCaptureFrame(new ArrayBuffer(4));
    await vi.advanceTimersByTimeAsync(VOICE_CALLBACK_GAP_MS);
    expect(runtime.fakeCaller.endAudioStreamCalls).toHaveLength(2);

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('tears down media on startup failure and retries into a clean session', async () => {
    const fakeCaller = createFakeCaller();
    const fakePlayback = createFakePlayback();
    const captureStop = vi.fn();
    const fetchSession = vi.fn()
      .mockRejectedValueOnce(new Error('provider exploded'))
      .mockResolvedValue(sessionHandle);
    setVoiceSessionRuntimeDepsForTests({
      createCaller: () => fakeCaller.caller,
      createPlayback: () => fakePlayback.playback,
      startCapture: async () => ({ stop: captureStop }),
      fetchSession,
    });
    bindVoiceSessionHost({
      router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() } as never,
      setTheme: vi.fn(),
      resolvedTheme: 'light',
      discoActive: false,
      openFeedback: vi.fn(),
      openProject: vi.fn(),
    });

    await startVoiceSession();
    expect(getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      recovery: 'retryable',
      error: 'Unable to start the call.',
      phase: 'error',
    });
    expect(captureStop).toHaveBeenCalled();
    expect(fakeCaller.getConnectCount()).toBe(0);

    await retryVoiceSession();
    expect(fetchSession).toHaveBeenCalledTimes(2);
    expect(fakeCaller.getConnectCount()).toBe(1);
    expect(getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      recovery: 'none',
      hud: 'intro',
      error: null,
    });

    resetVoiceSessionRuntimeForTests();
  });

  it('uses an actionable mic error and ignores duplicate Enable mic clicks', async () => {
    vi.useFakeTimers();
    const fakeCaller = createFakeCaller();
    const fakePlayback = createFakePlayback();
    const fetchSession = vi.fn(async () => sessionHandle);
    let captureAttempts = 0;
    const captureDeferred: { resolve: ((handle: { stop: () => void }) => void) | null } = { resolve: null };
    setVoiceSessionRuntimeDepsForTests({
      createCaller: () => fakeCaller.caller,
      createPlayback: () => fakePlayback.playback,
      startCapture: async () => {
        captureAttempts += 1;
        if (captureAttempts === 1) throw new DOMException('Permission denied', 'NotAllowedError');
        return await new Promise<{ stop: () => void }>(resolve => {
          captureDeferred.resolve = resolve;
        });
      },
      fetchSession,
    });
    bindVoiceSessionHost({
      router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() } as never,
      setTheme: vi.fn(),
      resolvedTheme: 'light',
      discoActive: false,
      openFeedback: vi.fn(),
      openProject: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      permissions: {
        query: async () => ({ state: 'denied' }),
      },
    });

    await startVoiceSession();
    expect(getVoiceSessionSnapshot().error).toBe(
      'Microphone access is blocked. Allow it in this site\'s browser settings, then try again.',
    );

    enableVoiceCapture();
    enableVoiceCapture();
    await Promise.resolve();
    expect(captureAttempts).toBe(2);

    captureDeferred.resolve?.({ stop: vi.fn() });
    await Promise.resolve();
    await Promise.resolve();
    expect(getVoiceSessionSnapshot().micLive).toBe(true);
    expect(captureAttempts).toBe(2);

    resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('discards a late mic grant after the active socket drops', async () => {
    const fakeCaller = createFakeCaller();
    const fakePlayback = createFakePlayback();
    let captureAttempts = 0;
    const captureDeferred: {
      resolve: ((handle: { stop: () => void }) => void) | null;
    } = { resolve: null };
    const lateCaptureStop = vi.fn();
    setVoiceSessionRuntimeDepsForTests({
      createCaller: () => fakeCaller.caller,
      createPlayback: () => fakePlayback.playback,
      startCapture: async () => {
        captureAttempts += 1;
        if (captureAttempts === 1) throw new Error('denied');
        return await new Promise<{ stop: () => void }>(resolve => {
          captureDeferred.resolve = resolve;
        });
      },
      fetchSession: async () => sessionHandle,
    });
    bindVoiceSessionHost({
      router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() } as never,
      setTheme: vi.fn(),
      resolvedTheme: 'light',
      discoActive: false,
      openFeedback: vi.fn(),
      openProject: vi.fn(),
    });

    await startVoiceSession();
    enableVoiceCapture();
    await Promise.resolve();
    fakeCaller.emit('health', { ok: false, configured: true });
    captureDeferred.resolve?.({ stop: lateCaptureStop });
    await Promise.resolve();
    await Promise.resolve();

    expect(lateCaptureStop).toHaveBeenCalledOnce();
    expect(getVoiceSessionSnapshot()).toMatchObject({
      recovery: 'retryable',
      phase: 'error',
      micLive: false,
    });
  });

  it('ignores late audio after exit closes the active media', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot().hud).toBe('exiting');
    runtime.fakeCaller.emit('audio', new ArrayBuffer(2));
    expect(runtime.fakePlayback.play).not.toHaveBeenCalled();

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('tears down an active call on playback resume error and stops later transcripts', async () => {
    const runtime = await boot();
    goLive(runtime);

    runtime.triggerPlaybackResumeError();
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      recovery: 'retryable',
      error: 'Audio output could not start. Try again or hang up.',
      phase: 'error',
    });
    expect(runtime.captureStop).toHaveBeenCalled();

    runtime.fakeCaller.emit('userTranscript', 'still talking');
    runtime.fakeCaller.emit('agentTranscript', 'should not appear');
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      userLine: '',
      agentLine: '',
      recovery: 'retryable',
      error: 'Audio output could not start. Try again or hang up.',
    });

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('omits openProject from mint snapshots off /projects and includes it on that route', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/about', search: '?project=cropio' },
    });
    const offProjects = await boot();
    expect(offProjects.fetchSession.mock.calls[0]?.at(1)).not.toHaveProperty('openProject');
    offProjects.resetVoiceSessionRuntimeForTests();

    vi.stubGlobal('window', {
      location: { pathname: '/projects', search: '?project=cropio' },
    });
    const onProjects = await boot();
    expect(onProjects.fetchSession.mock.calls[0]?.at(1)).toMatchObject({
      route: '/projects',
      openProject: 'cropio',
    });
    onProjects.resetVoiceSessionRuntimeForTests();
  });

  it('does not commit a cancelled deferred tool waiting on host readiness', async () => {
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('toolCall', {
      id: 'gb-1',
      name: 'submit_guestbook',
      args: { message: 'hello wall' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);

    runtime.fakeCaller.emit('toolCancellation', ['gb-1']);
    const unregister = registerSiteActionHost('guestbook');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    unregister();
    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('does not commit a cancelled project-video control when its host appears', async () => {
    const runtime = await boot();
    goLive(runtime);

    runtime.fakeCaller.emit('toolCall', {
      id: 'video-cancelled',
      name: 'control_project_video',
      args: { action: 'play' },
    } as SiteToolCall);
    await Promise.resolve();
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);

    runtime.fakeCaller.emit('toolCancellation', ['video-cancelled']);
    const unregister = registerSiteActionHost('project-video');
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    unregister();
    runtime.resetVoiceSessionRuntimeForTests();
  });
});
