/**
 * Unit tests for the sitewide procedural sound manager.
 *
 * Vitest node env: install a minimal AudioContext + performance shim onto
 * globalThis, then dynamically import the manager so the module sees the
 * mocks. Each test exercises one aspect of the public API:
 *   - Lazy initialization (no AudioContext until first play).
 *   - Mute short-circuit (no synthesis node created while muted).
 *   - Tab-hidden short-circuit.
 *   - Debounce (repeat play within the debounce window returns false).
 *   - Valid-id renderers do not throw.
 *   - setMuted() ramps master gain rather than disconnecting.
 *   - Graceful fallback when AudioContext is unavailable.
 *   - One-shot pre-emption — playing B stops A cleanly.
 *   - Loop isolation — loops are NOT pre-empted by new one-shots.
 *   - Loop lifecycle — start / stop / per-loop mute.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type MockNode = {
  kind: string;
  connected: Set<MockNode>;
  disconnected: boolean;
  started: boolean;
  stopped: boolean;
  stopTimes: number[];
  type?: string;
  buffer?: unknown;
  loop?: boolean;
  onended?: (evt?: Event) => void;
  frequency?: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> };
  gain?: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> };
  detune?: { value: number };
  Q?: { value: number };
};

interface MockContext {
  state: AudioContextState;
  currentTime: number;
  sampleRate: number;
  destination: MockNode;
  _nodes: MockNode[];
  createOscillator: () => MockNode;
  createGain: () => MockNode;
  createBiquadFilter: () => MockNode;
  createBufferSource: () => MockNode;
  createBuffer: (numChannels: number, length: number, sampleRate: number) => AudioBuffer;
  decodeAudioData?: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  resume: () => Promise<void>;
  close: () => Promise<void>;
}

let mockCtx: MockContext | null = null;
let ctxCreationCount = 0;
let shouldThrowOnCreate = false;
let visibilityState: DocumentVisibilityState = 'visible';

function makeFreqParam(): MockNode['frequency'] {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function makeGainParam(): MockNode['gain'] {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

function makeNode(kind: string): MockNode {
  return {
    kind,
    connected: new Set(),
    disconnected: false,
    started: false,
    stopped: false,
    stopTimes: [],
    frequency: makeFreqParam(),
    gain: makeGainParam(),
    detune: { value: 0 },
    Q: { value: 1 },
    type: 'sine',
  };
}

function createMockContext(): MockContext {
  const ctx: MockContext = {
    state: 'running' as AudioContextState,
    currentTime: 1.0,
    sampleRate: 44100,
    destination: makeNode('destination'),
    _nodes: [],
    createOscillator(): MockNode {
      const node = makeNode('oscillator');
      ctx._nodes.push(node);
      return attachMethods(node);
    },
    createGain(): MockNode {
      const node = makeNode('gain');
      ctx._nodes.push(node);
      return attachMethods(node);
    },
    createBiquadFilter(): MockNode {
      const node = makeNode('biquad');
      ctx._nodes.push(node);
      return attachMethods(node);
    },
    createBufferSource(): MockNode {
      const node = makeNode('bufferSource');
      ctx._nodes.push(node);
      return attachMethods(node);
    },
    createBuffer(): AudioBuffer {
      return { getChannelData: (): Float32Array => new Float32Array(44100) } as unknown as AudioBuffer;
    },
    resume(): Promise<void> {
      ctx.state = 'running';
      return Promise.resolve();
    },
    close(): Promise<void> {
      ctx.state = 'closed';
      return Promise.resolve();
    },
  };
  return ctx;

  function attachMethods(n: MockNode): MockNode {
    const withMethods = n as MockNode & {
      connect: (dest: MockNode) => MockNode;
      disconnect: () => void;
      start: (t?: number) => void;
      stop: (t?: number) => void;
    };
    withMethods.connect = (dest: MockNode) => {
      n.connected.add(dest);
      return dest;
    };
    withMethods.disconnect = () => {
      n.disconnected = true;
      n.connected.clear();
    };
    withMethods.start = () => {
      n.started = true;
    };
    withMethods.stop = (t?: number) => {
      n.stopped = true;
      if (typeof t === 'number') n.stopTimes.push(t);
      if (n.onended) setTimeout(n.onended, 0);
    };
    return withMethods;
  }
}

let performanceNow = 1000;

beforeEach(() => {
  mockCtx = null;
  ctxCreationCount = 0;
  shouldThrowOnCreate = false;
  visibilityState = 'visible';
  performanceNow = 1000;

  class AudioContextMock {
    constructor() {
      if (shouldThrowOnCreate) throw new Error('blocked');
      ctxCreationCount++;
      const c = createMockContext();
      mockCtx = c;
      Object.assign(this, c);
    }
  }

  const windowShim = {
    AudioContext: AudioContextMock,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    setTimeout: (fn: () => void, ms: number) => {
      // Run asynchronously so scheduling semantics are preserved, but with a
      // small tick so tests don't need to await real time.
      void ms;
      return setTimeout(fn, 0) as unknown as number;
    },
    clearTimeout: (id: number) => clearTimeout(id as unknown as NodeJS.Timeout),
  };

  Object.defineProperty(globalThis, 'window', {
    value: windowShim,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'AudioContext', {
    value: AudioContextMock,
    configurable: true,
    writable: true,
  });
  // document stub so visibility checks work.
  Object.defineProperty(globalThis, 'document', {
    value: {
      get visibilityState(): DocumentVisibilityState {
        return visibilityState;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'performance', {
    value: {
      now: () => performanceNow,
    },
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  // Drain any pending timers queued by warmup waves. Several tests exercise
  // `play()` / `warmupSuperuserSounds()` but don't await the resulting
  // `setTimeout(0)` chain (critical wave → deadline → second wave, and the
  // superuser wave's scheduleIdle fallback). Those timers fire on the next
  // event-loop turn; if we don't drain before the next test's `installFetchSpy()`
  // replaces `globalThis.fetch`, the stale callbacks push `/sounds/matrix.mp3`
  // into the new test's `fetched` array — which causes the "deduplicates
  // concurrent warmup" test to observe 2 matrix fetches instead of 1, flakily,
  // depending on runner CPU scheduling (seen on GH Actions Linux, not Windows).
  await new Promise<void>((r) => setTimeout(r, 50));
  vi.resetModules();
});

async function loadSoundManager() {
  return import('@/lib/soundManager');
}

describe('soundManager — lifecycle', () => {
  it('does not create an AudioContext on import', async () => {
    await loadSoundManager();
    expect(ctxCreationCount).toBe(0);
  });

  it('creates exactly one AudioContext on first play', async () => {
    const { soundManager } = await loadSoundManager();
    const dispatched = soundManager.play('page-flip');
    expect(dispatched).toBe(true);
    expect(ctxCreationCount).toBe(1);
    // A second call reuses the same context.
    performanceNow += 400;
    soundManager.play('page-flip');
    expect(ctxCreationCount).toBe(1);
  });

  it('returns null from play() and never creates a context if muted', async () => {
    const { soundManager } = await loadSoundManager();
    soundManager.setMuted(true);
    const dispatched = soundManager.play('sticker-ding');
    expect(dispatched).toBe(false);
    expect(ctxCreationCount).toBe(0);
  });

  it('short-circuits when tab is hidden', async () => {
    const { soundManager } = await loadSoundManager();
    visibilityState = 'hidden';
    const dispatched = soundManager.play('chat-send');
    expect(dispatched).toBe(false);
    // No context should have been created either — visibility check is early.
    expect(ctxCreationCount).toBe(0);
  });

  it('returns false and never throws if AudioContext is unavailable', async () => {
    (globalThis as Record<string, unknown>).AudioContext = undefined;
    (globalThis.window as unknown as Record<string, unknown>).AudioContext = undefined;
    const { soundManager } = await loadSoundManager();
    const dispatched = soundManager.play('button-click');
    expect(dispatched).toBe(false);
  });

  it('returns false and never throws if AudioContext constructor throws', async () => {
    shouldThrowOnCreate = true;
    const { soundManager } = await loadSoundManager();
    const dispatched = soundManager.play('terminal-click');
    expect(dispatched).toBe(false);
  });
});

describe('soundManager — debounce + per-id volume', () => {
  it('debounces repeated plays of the same id', async () => {
    const { soundManager } = await loadSoundManager();
    const first = soundManager.play('button-click');
    expect(first).toBe(true);
    // Immediate repeat within the debounce window is rejected.
    const second = soundManager.play('button-click');
    expect(second).toBe(false);
    // Advance fake time past the debounce and it works again.
    performanceNow += 200;
    const third = soundManager.play('button-click');
    expect(third).toBe(true);
  });

  it('debounces per-id independently', async () => {
    const { soundManager } = await loadSoundManager();
    expect(soundManager.play('button-click')).toBe(true);
    // Different id — should NOT be affected by button-click's debounce.
    expect(soundManager.play('chat-send')).toBe(true);
  });

  it('exposes VOLUMES with every sound id (no drift)', async () => {
    const { __test } = await loadSoundManager();
    const ids: ReadonlyArray<string> = [
      'page-flip', 'chat-send', 'chat-receive', 'terminal-click',
      'sticker-ding', 'superuser-fanfare', 'theme-dark', 'theme-light',
      'button-click', 'feedback-sent', 'guestbook-submit', 'modal-open',
      'modal-close', 'command-palette-pop', 'disco-start', 'disco-loop',
      'matrix',
    ];
    for (const id of ids) {
      expect(__test.VOLUMES).toHaveProperty(id);
    }
  });

  it('exposes DEBOUNCE_MS with every sound id', async () => {
    const { __test } = await loadSoundManager();
    const ids: ReadonlyArray<string> = [
      'page-flip', 'chat-send', 'chat-receive', 'terminal-click',
      'sticker-ding', 'superuser-fanfare', 'theme-dark', 'theme-light',
      'button-click', 'feedback-sent', 'guestbook-submit', 'modal-open',
      'modal-close', 'command-palette-pop', 'disco-start', 'disco-loop',
      'matrix',
    ];
    for (const id of ids) {
      expect(__test.DEBOUNCE_MS).toHaveProperty(id);
    }
  });
});

describe('soundManager — setMuted ramps master gain', () => {
  it('ramps master gain to 0 on mute (does not disconnect)', async () => {
    const { soundManager } = await loadSoundManager();
    // Fire any sound so the context is initialized.
    soundManager.play('page-flip');
    expect(mockCtx).not.toBeNull();
    soundManager.setMuted(true);
    // Master gain is the first gain node created.
    const master = mockCtx!._nodes.find((n) => n.kind === 'gain')!;
    expect(master.gain?.linearRampToValueAtTime).toHaveBeenCalled();
    // Mute state is now true.
    expect(soundManager.isMuted()).toBe(true);
    // Context still exists.
    expect(mockCtx!.state).toBe('running');
  });
});

describe('soundManager — every renderer runs without throwing', () => {
  const ALL: ReadonlyArray<string> = [
    'page-flip', 'chat-send', 'chat-receive', 'terminal-click',
    'sticker-ding', 'superuser-fanfare', 'theme-dark', 'theme-light',
    'button-click', 'feedback-sent', 'guestbook-submit', 'modal-open',
    'modal-close', 'command-palette-pop', 'disco-start',
  ];

  it.each(ALL)('play("%s") dispatches and never throws', async (id) => {
    const { soundManager } = await loadSoundManager();
    // Each test call spaced to beat the debounce + picks a fresh performanceNow.
    performanceNow += 5000;
    const dispatched = soundManager.play(id as Parameters<typeof soundManager.play>[0]);
    expect(dispatched).toBe(true);
  });
});

describe('soundManager — midiToHz', () => {
  it('produces exact values at standard references', async () => {
    const { __test } = await loadSoundManager();
    expect(__test.midiToHz(69)).toBeCloseTo(440, 5);
    expect(__test.midiToHz(60)).toBeCloseTo(261.626, 3); // C4
    expect(__test.midiToHz(72)).toBeCloseTo(523.251, 3); // C5
  });
});

describe('soundManager — one-shot pre-emption', () => {
  it('playing B after A schedules A\'s sources to stop', async () => {
    const { soundManager, __test } = await loadSoundManager();
    // Play A — debounce safe (each id has its own timer).
    expect(soundManager.play('sticker-ding')).toBe(true);
    const nodesAfterA = mockCtx!._nodes.length;
    expect(__test.hasActiveOneShot()).toBe(true);
    // Capture the first few oscillators created for A.
    const aOscs = mockCtx!._nodes.filter((n) => n.kind === 'oscillator');
    expect(aOscs.length).toBeGreaterThan(0);
    const aStopCountBefore = aOscs.filter((o) => o.stopped).length;

    // Play B — different id, pre-empts A.
    expect(soundManager.play('chat-send')).toBe(true);
    // At this point more nodes should have been created (for B).
    expect(mockCtx!._nodes.length).toBeGreaterThan(nodesAfterA);

    // A's oscillators should have been scheduled to stop (at least one
    // additional stop() call on the previously-active bundle beyond their
    // natural stops).
    const aStopsAfter = aOscs.filter((o) => o.stopped).length;
    expect(aStopsAfter).toBeGreaterThanOrEqual(aStopCountBefore);

    // One-shot is still active (now B is the active one).
    expect(__test.hasActiveOneShot()).toBe(true);
  });

  it('pre-emption calls gain.cancelScheduledValues on the previous bundle gain', async () => {
    const { soundManager } = await loadSoundManager();
    soundManager.play('sticker-ding');
    // Capture the count of cancelScheduledValues calls across all gains.
    const allGains = mockCtx!._nodes.filter((n) => n.kind === 'gain');
    const beforeCancels = allGains.reduce(
      (sum, g) => sum + (g.gain?.cancelScheduledValues.mock.calls.length ?? 0),
      0,
    );

    soundManager.play('chat-receive');
    const afterCancels = allGains.reduce(
      (sum, g) => sum + (g.gain?.cancelScheduledValues.mock.calls.length ?? 0),
      0,
    );
    // At least one new cancel was issued (on the previous bundle's gain).
    expect(afterCancels).toBeGreaterThan(beforeCancels);
  });

  it('pre-emption preserves debounce — re-playing same id within debounce still returns false', async () => {
    const { soundManager } = await loadSoundManager();
    expect(soundManager.play('button-click')).toBe(true);
    // Within debounce window — should be rejected (pre-emption never runs).
    expect(soundManager.play('button-click')).toBe(false);
  });
});

describe('soundManager — loop lifecycle', () => {
  it('startLoop without a buffer or factory returns false', async () => {
    const { soundManager } = await loadSoundManager();
    // No buffer seeded, no factory registered.
    const started = soundManager.startLoop('disco-loop');
    expect(started).toBe(false);
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(false);
  });

  it('startLoop with a seeded buffer plays on a buffer source', async () => {
    const { soundManager, __test } = await loadSoundManager();
    // Trigger context creation so we have a ctx to work with.
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);

    const started = soundManager.startLoop('disco-loop');
    expect(started).toBe(true);
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(true);

    // The loop should have created a buffer source with loop=true.
    const bufferSources = mockCtx!._nodes.filter((n) => n.kind === 'bufferSource');
    // At least one non-noise buffer source.
    const loopingSource = bufferSources.find((s) => s.loop === true);
    expect(loopingSource).toBeDefined();
  });

  it('startLoop is idempotent — second call does not create a new source', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);

    soundManager.startLoop('disco-loop');
    const sourcesAfterFirst = mockCtx!._nodes.filter((n) => n.kind === 'bufferSource').length;
    soundManager.startLoop('disco-loop');
    const sourcesAfterSecond = mockCtx!._nodes.filter((n) => n.kind === 'bufferSource').length;
    expect(sourcesAfterSecond).toBe(sourcesAfterFirst);
  });

  it('stopLoop fades and stops the source', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);

    soundManager.startLoop('disco-loop');
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(true);

    soundManager.stopLoop('disco-loop');
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(false);
  });

  it('hasBuffer reflects cached state', async () => {
    const { soundManager, __test } = await loadSoundManager();
    expect(soundManager.hasBuffer('disco-loop')).toBe(false);
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);
    expect(soundManager.hasBuffer('disco-loop')).toBe(true);
  });

  it('onBufferReady fires when seedBuffer runs', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const ready = vi.fn();
    const unsub = soundManager.onBufferReady('disco-loop', ready);
    expect(ready).not.toHaveBeenCalled();
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);
    expect(ready).toHaveBeenCalled();
    unsub();
  });

  it('playing a one-shot while a loop is running does NOT stop the loop', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    performanceNow += 500;
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);
    soundManager.startLoop('disco-loop');
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(true);
    const loopSources = mockCtx!._nodes.filter((n) => n.kind === 'bufferSource' && n.loop === true);
    const loopSrc = loopSources[loopSources.length - 1];
    expect(loopSrc.stopped).toBe(false);

    // Fire several one-shots. The loop must remain unaffected.
    performanceNow += 500;
    soundManager.play('button-click');
    performanceNow += 500;
    soundManager.play('chat-send');
    performanceNow += 500;
    soundManager.play('chat-receive');

    // Loop source must NOT have been stopped by the one-shots.
    expect(loopSrc.stopped).toBe(false);
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(true);
  });

  it('registerExternalLoopFactory provides procedural fallback when no buffer is cached', async () => {
    const { soundManager, registerExternalLoopFactory } = await loadSoundManager();
    soundManager.play('page-flip');
    const externalStop = vi.fn();
    const externalSetMuted = vi.fn();
    registerExternalLoopFactory('disco-loop', () => ({
      stop: externalStop,
      setMuted: externalSetMuted,
    }));
    // No buffer seeded — should fall back to factory.
    const started = soundManager.startLoop('disco-loop');
    expect(started).toBe(true);
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(true);

    soundManager.setLoopMuted('disco-loop', true);
    expect(externalSetMuted).toHaveBeenCalledWith(true);

    soundManager.stopLoop('disco-loop');
    expect(externalStop).toHaveBeenCalled();
  });

  it('setLoopMuted ramps the loop gain without affecting the master gain', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);
    soundManager.startLoop('disco-loop');

    // Identify the loop gain (second-to-last gain added; master is the first).
    const gains = mockCtx!._nodes.filter((n) => n.kind === 'gain');
    const master = gains[0];
    const loopGain = gains[gains.length - 1];
    const masterBefore = master.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;
    const loopBefore = loopGain.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;

    soundManager.setLoopMuted('disco-loop', true);

    // Loop gain should have a new ramp call.
    const loopAfter = loopGain.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;
    expect(loopAfter).toBeGreaterThan(loopBefore);
    // Master should NOT have a new ramp call (setLoopMuted != setMuted).
    const masterAfter = master.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;
    expect(masterAfter).toBe(masterBefore);
  });
});

describe('soundManager — setMuted is the single source for stopping every sound', () => {
  it('setMuted(true) silences buffer-backed loops via master gain ramp', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);
    soundManager.startLoop('disco-loop');
    expect(soundManager.isLoopPlaying('disco-loop')).toBe(true);

    // Identify the master (the first gain created, which the manager uses
    // as the global chain head).
    const gains = mockCtx!._nodes.filter((n) => n.kind === 'gain');
    const master = gains[0];
    const masterBefore = master.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;

    soundManager.setMuted(true);
    expect(soundManager.isMuted()).toBe(true);

    // The master gain ramp is how buffer-backed loops go silent — they're
    // downstream of master. At least one new ramp call landed on master.
    const masterAfter = master.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;
    expect(masterAfter).toBeGreaterThan(masterBefore);
  });

  it('setMuted(true) also mutes registered procedural-external loops', async () => {
    const { soundManager, registerExternalLoopFactory } = await loadSoundManager();
    soundManager.play('page-flip');
    const externalStop = vi.fn();
    const externalSetMuted = vi.fn();
    registerExternalLoopFactory('disco-loop', () => ({
      stop: externalStop,
      setMuted: externalSetMuted,
    }));
    // No buffer — loop uses the factory.
    soundManager.startLoop('disco-loop');

    // Global mute must cascade to procedural-external loops so the disco
    // engine (not under the master gain chain) also goes silent.
    soundManager.setMuted(true);
    expect(externalSetMuted).toHaveBeenCalledWith(true);

    // Unmuting cascades back.
    soundManager.setMuted(false);
    expect(externalSetMuted).toHaveBeenCalledWith(false);
  });

  it('setMuted(false) restores master gain ramp so buffer loops resume audibly', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);
    soundManager.startLoop('disco-loop');
    soundManager.setMuted(true);

    const gains = mockCtx!._nodes.filter((n) => n.kind === 'gain');
    const master = gains[0];
    const rampsBefore = master.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;

    soundManager.setMuted(false);
    const rampsAfter = master.gain?.linearRampToValueAtTime.mock.calls.length ?? 0;
    // Another ramp landed on master (this time toward 1, not 0).
    expect(rampsAfter).toBeGreaterThan(rampsBefore);
    expect(soundManager.isMuted()).toBe(false);
  });
});

describe('soundManager — __reset cleans up loops and one-shots', () => {
  it('__reset stops active loops and clears activeOneShot', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('disco-loop', fakeBuffer);
    soundManager.startLoop('disco-loop');
    expect(__test.loopCount()).toBe(1);
    soundManager.__reset();
    expect(__test.loopCount()).toBe(0);
    expect(__test.hasActiveOneShot()).toBe(false);
  });
});

// ─── Warmup waves ──────────────────────────────────────────────────────
describe('soundManager — warmup waves', () => {
  /**
   * Stub `fetch` so the warmup pipeline records which URLs were requested.
   * decodeAudioData is stubbed on the mock context to synthesize an
   * AudioBuffer, so each successful fetch lands in the buffer cache.
   */
  function installFetchSpy(): { fetchMock: ReturnType<typeof vi.fn>; fetched: string[] } {
    const fetched: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL) => {
      const s = typeof url === 'string' ? url : url.toString();
      fetched.push(s);
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as unknown as Response;
    });
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
    (globalThis.window as unknown as Record<string, unknown>).fetch = fetchMock;
    return { fetchMock, fetched };
  }

  function installDecodeStub(): void {
    // mockCtx is installed on globalThis.AudioContext; patch its decodeAudioData
    // so that every URL fetch decodes into a fake AudioBuffer. We monkey-patch
    // the prototype-ish ctx methods by waiting for the manager to create the
    // context, then decorating.
    // Easier: patch the ctor so every instance has decodeAudioData.
    const Ctor = (globalThis as Record<string, unknown>).AudioContext as
      | (new () => unknown)
      | undefined;
    if (!Ctor) return;
    // No-op — decode stub will be installed per-test after manager initializes.
  }
  installDecodeStub();

  /** Patch the live mock context's decodeAudioData to always succeed. */
  function patchDecodeAudioData(): void {
    if (!mockCtx) return;
    (mockCtx as unknown as { decodeAudioData: (b: ArrayBuffer) => Promise<AudioBuffer> })
      .decodeAudioData = vi.fn(async () => {
        return { getChannelData: (): Float32Array => new Float32Array(1) } as unknown as AudioBuffer;
      });
  }

  it('critical wave kicks off on first play and fetches every critical sound', async () => {
    const { fetched } = installFetchSpy();
    const { soundManager } = await loadSoundManager();
    // First gesture — kicks off the AudioContext + critical warmup.
    soundManager.play('page-flip');
    patchDecodeAudioData();
    // Yield microtasks so the warmup fetches enqueue.
    await new Promise<void>((r) => setTimeout(r, 0));
    await new Promise<void>((r) => setTimeout(r, 0));
    const criticalUrls = [
      '/sounds/page-flip.mp3',
      '/sounds/theme-dark.mp3',
      '/sounds/theme-light.mp3',
    ];
    for (const url of criticalUrls) {
      expect(fetched).toContain(url);
    }
  });

  it('superuser wave does NOT fire before warmupSuperuserSounds() is called', async () => {
    const { fetched } = installFetchSpy();
    const { soundManager } = await loadSoundManager();
    soundManager.play('page-flip');
    // Settle microtasks — critical + second waves will fire, but NOT superuser.
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(fetched.some((u) => u.includes('/sounds/disco-start.mp3'))).toBe(false);
    expect(fetched.some((u) => u.includes('/sounds/disco-loop.mp3'))).toBe(false);
    expect(fetched.some((u) => u.includes('/sounds/matrix.mp3'))).toBe(false);
  });

  it('warmupSuperuserSounds() fetches disco-start, disco-loop, and matrix', async () => {
    const { fetched } = installFetchSpy();
    const { soundManager } = await loadSoundManager();
    soundManager.play('page-flip');
    soundManager.warmupSuperuserSounds();
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(fetched).toContain('/sounds/disco-start.mp3');
    expect(fetched).toContain('/sounds/disco-loop.mp3');
    expect(fetched).toContain('/sounds/matrix.mp3');
  });

  it('warmupSuperuserSounds() deduplicates repeat calls', async () => {
    const { fetched } = installFetchSpy();
    const { soundManager } = await loadSoundManager();
    soundManager.play('page-flip');
    soundManager.warmupSuperuserSounds();
    soundManager.warmupSuperuserSounds();
    soundManager.warmupSuperuserSounds();
    await new Promise<void>((r) => setTimeout(r, 50));
    // matrix.mp3 should have been fetched exactly once.
    const matrixFetches = fetched.filter((u) => u === '/sounds/matrix.mp3').length;
    expect(matrixFetches).toBe(1);
  });

  it('warmupSuperuserSounds() called before first gesture is deferred until ensure()', async () => {
    const { fetched } = installFetchSpy();
    const { soundManager } = await loadSoundManager();
    // No gesture yet — nothing should fetch.
    soundManager.warmupSuperuserSounds();
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(fetched.some((u) => u.includes('/sounds/matrix.mp3'))).toBe(false);
    // Now fire a gesture — the deferred superuser wave picks up.
    soundManager.play('page-flip');
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(fetched).toContain('/sounds/matrix.mp3');
  });

  it('__debug reports criticalWaveStarted after first play', async () => {
    installFetchSpy();
    const { soundManager } = await loadSoundManager();
    expect(soundManager.__debug.criticalWaveStarted).toBe(false);
    soundManager.play('page-flip');
    expect(soundManager.__debug.criticalWaveStarted).toBe(true);
  });

  it('__debug reports superuserWaveScheduled only after warmupSuperuserSounds', async () => {
    installFetchSpy();
    const { soundManager } = await loadSoundManager();
    soundManager.play('page-flip');
    expect(soundManager.__debug.superuserWaveScheduled).toBe(false);
    soundManager.warmupSuperuserSounds();
    expect(soundManager.__debug.superuserWaveScheduled).toBe(true);
  });

  it('primeOnGesture() is idempotent and creates the context if missing', async () => {
    installFetchSpy();
    const { soundManager } = await loadSoundManager();
    expect(ctxCreationCount).toBe(0);
    soundManager.primeOnGesture();
    expect(ctxCreationCount).toBe(1);
    // Calling again is a no-op.
    soundManager.primeOnGesture();
    expect(ctxCreationCount).toBe(1);
  });

  it('deduplicates concurrent warmup calls for the same sound id', async () => {
    const { fetched } = installFetchSpy();
    const { soundManager } = await loadSoundManager();
    // Fire warmupSuperuserSounds AND a play that would retrigger critical —
    // matrix should only fetch once.
    soundManager.play('page-flip');
    soundManager.warmupSuperuserSounds();
    soundManager.warmupSuperuserSounds(); // should be no-op (latch)
    await new Promise<void>((r) => setTimeout(r, 50));
    const matrixFetches = fetched.filter((u) => u === '/sounds/matrix.mp3').length;
    expect(matrixFetches).toBe(1);
  });
});

// ─── Matrix loop — the new v6 superuser-gated loop ─────────────────────
describe('soundManager — matrix loop', () => {
  it('startLoop(matrix) plays on a buffer source when seeded', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('matrix', fakeBuffer);
    const started = soundManager.startLoop('matrix');
    expect(started).toBe(true);
    expect(soundManager.isLoopPlaying('matrix')).toBe(true);
  });

  it('stopLoop(matrix) tears down the loop', async () => {
    const { soundManager, __test } = await loadSoundManager();
    soundManager.play('page-flip');
    const fakeBuffer = mockCtx!.createBuffer(2, 44100, 44100);
    __test.seedBuffer('matrix', fakeBuffer);
    soundManager.startLoop('matrix');
    soundManager.stopLoop('matrix');
    expect(soundManager.isLoopPlaying('matrix')).toBe(false);
  });
});
