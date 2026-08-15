import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteToolCall } from '@/lib/siteTools';
import type { VoiceCaller, VoiceCallerEventMap, VoiceSessionHandle } from '@/lib/voiceAgentProtocol';
import type { VoicePlayback } from '@/lib/voiceAudio';
import {
  bindVoiceSessionHost,
  getVoiceSessionSnapshot,
  requestVoiceHangup,
  resetVoiceSessionRuntimeForTests,
  setVoiceSessionRuntimeDepsForTests,
  startVoiceSession,
  stopVoiceSession,
} from '@/lib/voiceSessionRuntime';

function createFakeCaller() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const toolResults: Array<{ id: string; result: unknown; name?: string }> = [];
  let connectCount = 0;

  const caller: VoiceCaller = {
    id: 'fake-live',
    async connect() {
      connectCount += 1;
    },
    sendAudio() {},
    sendText() {},
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

  return { caller, emit, toolResults, getConnectCount: () => connectCount };
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
  },
};

describe('voice session runtime singleton', () => {
  beforeEach(() => {
    resetVoiceSessionRuntimeForTests();
  });

  afterEach(() => {
    resetVoiceSessionRuntimeForTests();
    vi.clearAllMocks();
  });

  async function boot() {
    const fakeCaller = createFakeCaller();
    const fakePlayback = createFakePlayback();
    const captureStop = vi.fn();
    const openProject = vi.fn();
    const push = vi.fn();
    setVoiceSessionRuntimeDepsForTests({
      createCaller: () => fakeCaller.caller,
      createPlayback: () => fakePlayback.playback,
      startCapture: async () => ({ stop: captureStop }),
      fetchSession: async () => sessionHandle,
      playEnter: vi.fn(),
      playExit: vi.fn(),
      playAction: vi.fn(),
      playListen: vi.fn(),
      startAmbient: vi.fn(),
      stopAmbient: vi.fn(),
      prefetchSounds: vi.fn(),
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
      requestVoiceHangup,
      getVoiceSessionSnapshot,
      resetVoiceSessionRuntimeForTests,
      openProject,
      push,
    };
  }

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

  it('stops immediately on user hangup while playback is idle', async () => {
    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot().hud).toBe('live');

    runtime.requestVoiceHangup();
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('waits for goodbye audio after end_voice_session while idle', async () => {
    const runtime = await boot();
    runtime.fakeCaller.emit('turnComplete', true);
    runtime.fakePlayback.setBusy(false);
    expect(runtime.getVoiceSessionSnapshot().hud).toBe('live');

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
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
  });

  it('waits for idle when end_voice_session arrives during goodbye playback', async () => {
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
    expect(runtime.getVoiceSessionSnapshot().active).toBe(false);

    runtime.resetVoiceSessionRuntimeForTests();
  });
});
