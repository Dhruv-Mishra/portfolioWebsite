import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteToolCall } from '@/lib/siteTools';
import type { VoiceCaller, VoiceCallerEventMap, VoiceSessionHandle } from '@/lib/voiceAgentProtocol';
import type { VoicePlayback } from '@/lib/voiceAudio';
import {
  attachSiteActionResult,
  CONTROL_PROJECT_VIDEO_EVENT,
  registerSiteActionHost,
  resetSiteActionHostsForTests,
  RUN_TERMINAL_COMMAND_EVENT,
} from '@/lib/siteActionEvents';
import {
  bindVoiceSessionHost,
  getVoiceSessionSnapshot,
  requestVoiceHangup,
  resetVoiceSessionRuntimeForTests,
  setVoiceSessionRuntimeDepsForTests,
  startVoiceSession,
  stopVoiceSession,
  VOICE_ACTION_CUE_COALESCE_MS,
  VOICE_AMBIENT_FADE_OUT_MS,
  VOICE_AMBIENT_START_DELAY_MS,
  VOICE_EXIT_VEIL_MS,
  VOICE_IDLE_CHECKIN_MS,
  VOICE_IDLE_HANGUP_MS,
  VOICE_PROJECT_VIDEO_WAIT_MS,
  VOICE_SUBTITLE_FADE_MS,
  VOICE_SUBTITLE_IDLE_MS,
} from '@/lib/voiceSessionRuntime';
import {
  VOICE_EXIT_VEIL_VARIATIONS,
  VOICE_IDLE_CHECKIN_VARIATIONS,
  VOICE_IDLE_HANGUP_VARIATIONS,
  VOICE_WELCOME_HINT,
} from '@/lib/voiceAgentProtocol';
import { getVoiceAgentPrefsSnapshot, setVoiceAgentPref } from '@/lib/voiceAgentPrefs';

function createFakeCaller() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const toolResults: Array<{ id: string; result: unknown; name?: string }> = [];
  const sentTexts: string[] = [];
  let connectCount = 0;

  const caller: VoiceCaller = {
    id: 'fake-live',
    async connect() {
      connectCount += 1;
    },
    sendAudio() {},
    sendText(text) {
      sentTexts.push(text);
    },
    sendToolResult(id, result, name) {
      toolResults.push({ id, result, name });
    },
    interrupt() {},
    close() {},
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

  return { caller, emit, toolResults, sentTexts, getConnectCount: () => connectCount };
}

function cueContainsCatalog(sent: readonly string[], catalog: readonly string[]): boolean {
  return sent.some(text => catalog.some(line => text.includes(line)));
}

function createFakePlayback() {
  let busy = false;
  const idleListeners = new Set<() => void>();
  const playback: VoicePlayback = {
    play() {
      busy = true;
    },
    interrupt() {
      busy = false;
      for (const listener of idleListeners) listener();
    },
    close() {
      busy = false;
    },
    isBusy: () => busy,
    subscribeIdle(cb) {
      idleListeners.add(cb);
      return () => idleListeners.delete(cb);
    },
  };

  return {
    playback,
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
    const playEnter = vi.fn();
    const playExit = vi.fn();
    const playAction = vi.fn();
    const startAmbient = vi.fn();
    const stopAmbient = vi.fn();
    const prefetchSounds = vi.fn();
    setVoiceSessionRuntimeDepsForTests({
      createCaller: () => fakeCaller.caller,
      createPlayback: () => fakePlayback.playback,
      startCapture: async () => ({ stop: captureStop }),
      fetchSession: async () => sessionHandle,
      playEnter,
      playExit,
      playAction,
      startAmbient,
      stopAmbient,
      prefetchSounds,
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
      playEnter,
      playExit,
      playAction,
      startAmbient,
      stopAmbient,
      prefetchSounds,
      requestVoiceHangup,
      getVoiceSessionSnapshot,
      resetVoiceSessionRuntimeForTests,
      openProject,
      push,
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

    runtime.fakeCaller.emit('error', 'Connection faded. Stay here or hang up.');
    await vi.advanceTimersByTimeAsync(VOICE_SUBTITLE_IDLE_MS + 50);
    expect(runtime.getVoiceSessionSnapshot().error).toBe('Connection faded. Stay here or hang up.');

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

  it('surfaces a socket drop on the dock without restarting', async () => {
    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(false);

    runtime.fakeCaller.emit('ended', 'health');
    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'live',
      phase: 'error',
      error: 'Connection faded. Stay here or hang up.',
    });
    expect(runtime.fakeCaller.getConnectCount()).toBe(1);

    runtime.resetVoiceSessionRuntimeForTests();
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

    expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({ ok: true, spokenText: 'Taking you there.' });
    expect(runtime.push).not.toHaveBeenCalled();

    runtime.fakeCaller.emit('turnComplete', true);
    expect(runtime.push).not.toHaveBeenCalled();

    runtime.fakePlayback.setBusy(false);
    await Promise.resolve();
    expect(runtime.push).toHaveBeenCalled();

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('queues hangup until playback is idle, then force-exits on the second press', async () => {
    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(true);

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot().active).toBe(true);
    expect(runtime.getVoiceSessionSnapshot().hangupPending).toBe(true);

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

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
      error: 'Connection faded. Stay here or hang up.',
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

  it('queues the rest of a planned utterance after the model emits only navigate_to', async () => {
    const dispatchEvent = vi.fn((event: Event) => Boolean(event));
    vi.stubGlobal('window', { dispatchEvent });

    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot().introComplete).toBe(true);

    runtime.fakeCaller.emit('userTranscript', 'go to homepage and type help in terminal');
    runtime.fakeCaller.emit('toolCall', {
      id: 'nav-home',
      name: 'navigate_to',
      args: { path: '/' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.push).toHaveBeenCalledWith('/');
    const terminalEvents = () => dispatchEvent.mock.calls
      .map(([event]) => event)
      .filter((event): event is CustomEvent<{ command: string }> => (
        event instanceof Event && event.type === RUN_TERMINAL_COMMAND_EVENT
      ));
    expect(terminalEvents()).toHaveLength(0);

    const unregister = registerSiteActionHost('terminal');
    await Promise.resolve();
    await Promise.resolve();

    const firstTerminalEvents = terminalEvents();
    expect(firstTerminalEvents).toHaveLength(1);
    expect(firstTerminalEvents[0]?.detail).toEqual({ command: 'help' });

    runtime.fakeCaller.emit('toolCall', {
      id: 'term-help',
      name: 'run_terminal_command',
      args: { command: 'help' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    expect(terminalEvents()).toHaveLength(1);

    unregister();
    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('plays toggle on enter, then starts ambient after the toggle attack', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    expect(runtime.prefetchSounds).toHaveBeenCalledTimes(1);
    expect(runtime.playEnter).toHaveBeenCalledTimes(1);
    expect(runtime.startAmbient).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(VOICE_AMBIENT_START_DELAY_MS);
    expect(runtime.startAmbient).toHaveBeenCalledWith(true);
    expect(runtime.playEnter.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.startAmbient.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });

  it('skips ambient when low-network mode is on', async () => {
    const previous = getVoiceAgentPrefsSnapshot();
    setVoiceAgentPref('lowNetwork', true);
    setVoiceAgentPref('ambientMusic', true);
    try {
      const runtime = await boot();
      expect(runtime.playEnter).toHaveBeenCalledTimes(1);
      expect(runtime.startAmbient).not.toHaveBeenCalled();
      expect(runtime.getVoiceSessionSnapshot().lowNetwork).toBe(true);
      runtime.resetVoiceSessionRuntimeForTests();
    } finally {
      setVoiceAgentPref('lowNetwork', previous.lowNetwork);
      setVoiceAgentPref('ambientMusic', previous.ambientMusic);
    }
  });

  it('skips ambient when ambient music is disabled', async () => {
    const previous = getVoiceAgentPrefsSnapshot();
    setVoiceAgentPref('lowNetwork', false);
    setVoiceAgentPref('ambientMusic', false);
    try {
      const runtime = await boot();
      expect(runtime.playEnter).toHaveBeenCalledTimes(1);
      expect(runtime.startAmbient).not.toHaveBeenCalled();
      runtime.resetVoiceSessionRuntimeForTests();
    } finally {
      setVoiceAgentPref('lowNetwork', previous.lowNetwork);
      setVoiceAgentPref('ambientMusic', previous.ambientMusic);
    }
  });

  it('fades ambient then plays toggle on a normal hangup', async () => {
    vi.useFakeTimers();
    const runtime = await boot();
    goLive(runtime);

    runtime.requestVoiceHangup();
    expect(runtime.stopAmbient).toHaveBeenCalledWith({ fadeMs: VOICE_AMBIENT_FADE_OUT_MS });
    expect(runtime.playExit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(VOICE_AMBIENT_FADE_OUT_MS);
    expect(runtime.playExit).toHaveBeenCalledTimes(1);

    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
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
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    expect(runtime.playAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(VOICE_PROJECT_VIDEO_WAIT_MS + 1);
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    expect(runtime.playAction).not.toHaveBeenCalled();

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
    expect(runtime.playAction).toHaveBeenCalledTimes(1);

    runtime.fakeCaller.emit('toolCall', {
      id: 'close-1',
      name: 'close_project',
      args: {},
    } as SiteToolCall);
    runtime.fakeCaller.emit('toolCall', {
      id: 'theme-1',
      name: 'set_theme',
      args: { action: 'toggle' },
    } as SiteToolCall);
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.playAction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(VOICE_ACTION_CUE_COALESCE_MS + 1);
    runtime.fakeCaller.emit('toolCall', {
      id: 'theme-2',
      name: 'set_theme',
      args: { action: 'dark' },
    } as SiteToolCall);
    await Promise.resolve();
    expect(runtime.playAction).toHaveBeenCalledTimes(2);

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
    expect(runtime.fakeCaller.toolResults).toHaveLength(0);
    expect(dispatchEvent).not.toHaveBeenCalled();

    runtime.requestVoiceHangup();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.getVoiceSessionSnapshot()).toMatchObject({
      active: true,
      hud: 'exiting',
    });
    expect(runtime.fakeCaller.toolResults[0]?.result).toMatchObject({
      ok: false,
      errorCode: 'project-video-unavailable',
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      type: CONTROL_PROJECT_VIDEO_EVENT,
    }));

    const unregister = registerSiteActionHost('project-video');
    await vi.advanceTimersByTimeAsync(VOICE_PROJECT_VIDEO_WAIT_MS + VOICE_EXIT_VEIL_MS);
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.fakeCaller.toolResults).toHaveLength(1);
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      type: CONTROL_PROJECT_VIDEO_EVENT,
    }));

    unregister();
    runtime.resetVoiceSessionRuntimeForTests();
    vi.useRealTimers();
  });
});
