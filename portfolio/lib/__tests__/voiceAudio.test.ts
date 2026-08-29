import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EndedHandler = () => void;

class FakeSource {
  ended: EndedHandler | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  buffer: FakeBuffer | null = null;

  addEventListener(type: string, handler: EndedHandler): void {
    if (type === 'ended') this.ended = handler;
  }

  connect(): void {}

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
    this.ended?.();
  }
}

class FakeGain {
  gain = {
    value: 1,
    cancelScheduledValues() {},
    setValueAtTime(value: number) { this.value = value; },
    linearRampToValueAtTime(value: number) { this.value = value; },
  };

  connect(): void {}
  disconnect(): void {}
}

interface FakeBuffer {
  duration: number;
  channel: Float32Array;
  getChannelData: () => Float32Array;
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  sources: FakeSource[] = [];
  buffers: FakeBuffer[] = [];
  master: FakeGain | null = null;
  closed = false;

  createGain() {
    const gain = new FakeGain();
    this.master = gain;
    return gain;
  }

  createBuffer(...args: number[]) {
    const length = args[1] ?? 0;
    const channel = new Float32Array(length);
    const buffer: FakeBuffer = {
      duration: length / 24_000,
      channel,
      getChannelData: () => channel,
    };
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    const originalStart = source.start.bind(source);
    source.start = (when = 0) => {
      source.buffer = this.buffers.at(-1) ?? null;
      originalStart(when);
    };
    return source;
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function pcm16Le(sampleCount: number, fill = 0): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(sampleCount * 2));
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(index * 2, fill, true);
  }
  return view.buffer;
}

describe('voice playback idle tracking', () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    context = new FakeAudioContext();
    function AudioContextStub() {
      return context;
    }
    vi.stubGlobal('AudioContext', AudioContextStub);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is busy while a source is live and becomes idle after ended plus the tail timer', async () => {
    const { createVoicePlayback } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    const idle = vi.fn();
    playback.subscribeIdle(idle);

    const samples = new Int16Array(24_000);
    playback.play(samples.buffer);
    expect(playback.isBusy()).toBe(true);
    expect(idle).not.toHaveBeenCalled();

    context.sources[0]?.ended?.();
    expect(playback.isBusy()).toBe(true);
    expect(idle).not.toHaveBeenCalled();

    const { VOICE_PLAYBACK_HANGOVER_MS } = await import('@/lib/voiceAudio');
    await vi.advanceTimersByTimeAsync(1_020);
    expect(playback.isBusy()).toBe(true);
    expect(idle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(VOICE_PLAYBACK_HANGOVER_MS);
    expect(playback.isBusy()).toBe(false);
    expect(idle).toHaveBeenCalledTimes(1);
    playback.close();
  });

  it('stays busy after interrupt until hangover elapses, then emits idle once', async () => {
    const { createVoicePlayback, VOICE_PLAYBACK_HANGOVER_MS } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    const idle = vi.fn();
    playback.subscribeIdle(idle);

    playback.play(new Int16Array(2_400).buffer);
    expect(playback.isBusy()).toBe(true);

    playback.interrupt();
    expect(playback.isBusy()).toBe(true);
    expect(idle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(VOICE_PLAYBACK_HANGOVER_MS);
    expect(playback.isBusy()).toBe(false);
    expect(idle).toHaveBeenCalledTimes(1);
    playback.close();
  });

  it('exposes a 0–1 playback meter that follows PCM energy and decays when idle', async () => {
    const {
      createVoicePlayback,
      getVoicePlaybackLevel,
      subscribeVoicePlaybackLevel,
    } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    const onLevel = vi.fn();
    const onGlobalLevel = vi.fn();
    expect(playback.subscribeLevel).toEqual(expect.any(Function));
    expect(playback.getLevel).toEqual(expect.any(Function));
    playback.subscribeLevel?.(onLevel);
    const unsubscribeGlobal = subscribeVoicePlaybackLevel(onGlobalLevel);

    expect(playback.getLevel?.()).toBe(0);
    expect(getVoicePlaybackLevel()).toBe(0);

    playback.play(new Int16Array(480).buffer);
    expect(playback.getLevel?.()).toBe(0);
    expect(getVoicePlaybackLevel()).toBe(0);

    const loud = new Int16Array(1_200);
    loud.fill(24_000);
    playback.play(loud.buffer);
    const first = playback.getLevel?.() ?? 0;
    expect(first).toBeGreaterThan(0.2);
    expect(first).toBeLessThanOrEqual(1);
    expect(getVoicePlaybackLevel()).toBe(first);
    expect(onLevel).toHaveBeenLastCalledWith(first);
    expect(onGlobalLevel).toHaveBeenLastCalledWith(first);

    loud.fill(32_000);
    playback.play(loud.buffer);
    const second = playback.getLevel?.() ?? 0;
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThanOrEqual(1);
    expect(getVoicePlaybackLevel()).toBe(second);

    playback.interrupt();
    expect(playback.getLevel?.() ?? 0).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1_200);
    expect(playback.getLevel?.()).toBe(0);
    expect(getVoicePlaybackLevel()).toBe(0);

    loud.fill(20_000);
    playback.play(loud.buffer);
    expect(playback.getLevel?.() ?? 0).toBeGreaterThan(0);
    playback.close();
    expect(playback.getLevel?.()).toBe(0);
    expect(getVoicePlaybackLevel()).toBe(0);
    unsubscribeGlobal();
  });
});

describe('voice playback pcm engine', () => {
  let context: FakeAudioContext;
  let constructed = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    constructed = 0;
    context = new FakeAudioContext();
    function AudioContextStub() {
      constructed += 1;
      return context;
    }
    vi.stubGlobal('AudioContext', AudioContextStub);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('decodes signed 16-bit little-endian PCM and rejects odd-length packets', async () => {
    const { createVoicePlayback, decodePcm16Le } = await import('@/lib/voiceAudio');
    const crafted = new Uint8Array([0x00, 0x80, 0xff, 0x7f]).buffer;
    const decoded = decodePcm16Le(crafted);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.samples[0]).toBe(-1);
      expect(decoded.samples[1]).toBeCloseTo(32_767 / 32_768, 6);
    }
    expect(decodePcm16Le(new Uint8Array([0x00, 0x80, 0xff]).buffer)).toEqual({
      ok: false,
      reason: 'odd-length',
    });
    expect(decodePcm16Le(new ArrayBuffer(0))).toEqual({ ok: false, reason: 'empty' });

    const playback = createVoicePlayback();
    playback.play(crafted);
    playback.finishTurn?.();
    expect(context.sources).toHaveLength(1);
    expect(Array.from(context.buffers[0]?.channel ?? [])).toEqual([
      -1,
      32_767 / 32_768,
    ]);

    playback.play(new Uint8Array([0x11, 0x22, 0x33]).buffer);
    expect(context.sources).toHaveLength(1);
    playback.close();
  });

  it('holds the first packets until the prebuffer fills, then flush short replies on finishTurn', async () => {
    const { createVoicePlayback, VOICE_PLAYBACK_PREBUFFER_MS } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    playback.play(pcm16Le(480));
    expect(context.sources).toHaveLength(0);
    expect(playback.isBusy()).toBe(true);

    playback.finishTurn?.();
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.startedAt).toBeCloseTo(0.02, 5);
    playback.close();

    context = new FakeAudioContext();
    constructed = 0;
    const held = createVoicePlayback();
    held.play(pcm16Le(480));
    expect(context.sources).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(VOICE_PLAYBACK_PREBUFFER_MS);
    expect(context.sources).toHaveLength(1);
    held.close();
  });

  it('flushes a short queued reply when a suspended context resumes', async () => {
    const resumeDeferred: { resolve: (() => void) | null } = { resolve: null };
    context.state = 'suspended';
    context.resume = vi.fn(() => new Promise<void>(resolve => {
      resumeDeferred.resolve = () => {
        context.state = 'running';
        resolve();
      };
    }));
    const { createVoicePlayback } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();

    playback.play(pcm16Le(480));
    expect(context.sources).toHaveLength(0);

    resumeDeferred.resolve?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(context.sources).toHaveLength(1);
    playback.close();
  });

  it('schedules later PCM contiguously against the previous source end', async () => {
    const { createVoicePlayback, VOICE_PLAYBACK_SCHEDULE_LEAD_S } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    playback.play(pcm16Le(24_000));
    playback.play(pcm16Le(2_400));
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]?.startedAt).toBeCloseTo(VOICE_PLAYBACK_SCHEDULE_LEAD_S, 5);
    expect(context.sources[1]?.startedAt).toBeCloseTo(
      VOICE_PLAYBACK_SCHEDULE_LEAD_S + 1,
      5,
    );
    playback.close();
  });

  it('preserves all queued PCM in order without resynchronizing active playback', async () => {
    const { createVoicePlayback } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    playback.play(pcm16Le(24_000 * 3));
    expect(context.sources).toHaveLength(1);
    expect(context.buffers[0]?.duration).toBeCloseTo(3, 5);

    playback.play(pcm16Le(24_000 * 2));
    const first = context.sources[0];
    const second = context.sources[1];
    expect(second).not.toBe(first);
    expect(first?.stoppedAt).toBeNull();
    expect(second?.startedAt).toBeCloseTo(3.02, 5);
    expect(second?.buffer?.duration).toBeCloseTo(2, 5);

    playback.interrupt();
    expect(first?.stoppedAt).toBe(0);
    expect(second?.stoppedAt).toBe(0);
    playback.play(pcm16Le(12_000));
    const latest = context.sources.at(-1);
    expect(latest).not.toBe(second);
    expect(latest?.startedAt).toBeCloseTo(0.02, 5);
    expect(latest?.buffer?.duration).toBeCloseTo(0.5, 5);
    playback.close();
  });

  it('accepts later PCM after an interruption fade/stop', async () => {
    const { createVoicePlayback } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    playback.play(pcm16Le(24_000));
    const first = context.sources[0];
    expect(first?.startedAt).toBeCloseTo(0.02, 5);
    playback.interrupt();
    expect(first?.stoppedAt).toBe(0);
    expect(context.master?.gain.value).toBe(0);

    playback.play(pcm16Le(2_400));
    const next = context.sources.at(-1);
    expect(next).not.toBe(first);
    expect(next?.startedAt).toBeCloseTo(0.02, 5);
    playback.close();
  });

  it('treats close as terminal so late play and ended callbacks cannot revive playback', async () => {
    const { createVoicePlayback } = await import('@/lib/voiceAudio');
    const playback = createVoicePlayback();
    playback.play(pcm16Le(24_000));
    const source = context.sources[0];
    const ended = source?.ended;
    playback.close();
    expect(context.closed).toBe(true);
    expect(playback.isBusy()).toBe(false);
    expect(constructed).toBe(1);

    playback.play(pcm16Le(2_400));
    playback.finishTurn?.();
    ended?.();
    expect(constructed).toBe(1);
    expect(context.sources).toHaveLength(1);
    expect(playback.isBusy()).toBe(false);
    expect(playback.getLevel?.()).toBe(0);
  });
});

class FakeCaptureTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeCaptureStream {
  tracks: FakeCaptureTrack[];

  constructor(tracks: FakeCaptureTrack[]) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }
}

class FakeCaptureNode {
  disconnected = 0;

  connect() {
    return this;
  }

  disconnect() {
    this.disconnected += 1;
  }
}

class FakeCaptureGain extends FakeCaptureNode {
  gain = { value: 1 };
}

type CaptureWorkletMessageHandler = (event: { data: ArrayBuffer }) => void;

class FakeCapturePort {
  closed = false;
  onmessage: CaptureWorkletMessageHandler | null = null;

  close() {
    this.closed = true;
  }

  emit(data: ArrayBuffer) {
    this.onmessage?.({ data });
  }
}

class FakeCaptureWorklet extends FakeCaptureNode {
  port = new FakeCapturePort();

  constructor(
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    super();
  }
}

class FakeCaptureContext {
  sampleRate = 48_000;
  destination = {};
  state: AudioContextState;
  closed = false;
  source: FakeCaptureNode | null = null;
  worklet: FakeCaptureWorklet | null = null;
  muteGain: FakeCaptureGain | null = null;
  failAt: 'source' | 'worklet' | 'gain' | 'connect' | null = null;
  resumeTo: AudioContextState = 'running';
  resumeCalls = 0;
  closeCalls = 0;
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  constructor(state: AudioContextState = 'running') {
    this.state = state;
  }

  createMediaStreamSource() {
    if (this.failAt === 'source') throw new Error('source failed');
    this.source = new FakeCaptureNode();
    return this.source;
  }

  createGain() {
    if (this.failAt === 'gain') throw new Error('gain failed');
    this.muteGain = new FakeCaptureGain();
    if (this.failAt === 'connect') {
      this.muteGain.connect = () => {
        throw new Error('connect failed');
      };
    }
    return this.muteGain;
  }

  resume() {
    this.resumeCalls += 1;
    this.state = this.resumeTo;
    return Promise.resolve();
  }

  close() {
    this.closeCalls += 1;
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function AudioWorkletNodeStub(
  audioContext: FakeCaptureContext,
  name: string,
  options: AudioWorkletNodeOptions,
) {
  if (audioContext.failAt === 'worklet') throw new Error('worklet failed');
  const worklet = new FakeCaptureWorklet(name, options);
  audioContext.worklet = worklet;
  return worklet;
}

function pcm16Samples(chunk: ArrayBuffer): number[] {
  const view = new DataView(chunk);
  const samples: number[] = [];
  for (let index = 0; index < chunk.byteLength; index += 2) {
    samples.push(view.getInt16(index, true) / 0x7fff);
  }
  return samples;
}

describe('voice capture graph', () => {
  let tracks: FakeCaptureTrack[];
  let stream: FakeCaptureStream;
  let context: FakeCaptureContext;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tracks = [new FakeCaptureTrack()];
    stream = new FakeCaptureStream(tracks);
    context = new FakeCaptureContext();
    getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });
    function AudioContextStub() {
      return context;
    }
    vi.stubGlobal('AudioContext', AudioContextStub);
    vi.stubGlobal('AudioWorkletNode', AudioWorkletNodeStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cleans up stream tracks and the audio graph if context construction fails', async () => {
    vi.stubGlobal('AudioContext', function AudioContextStub() {
      throw new Error('context failed');
    });
    const { startVoiceCapture } = await import('@/lib/voiceAudio');
    await expect(startVoiceCapture(() => {})).rejects.toThrow('context failed');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    expect(tracks[0]?.stopped).toBe(true);
  });

  it('cleans up stream, nodes, and context if graph wiring fails', async () => {
    context.failAt = 'connect';
    const { startVoiceCapture } = await import('@/lib/voiceAudio');
    await expect(startVoiceCapture(() => {})).rejects.toThrow('connect failed');
    expect(tracks[0]?.stopped).toBe(true);
    expect(context.source?.disconnected).toBeGreaterThan(0);
    expect(context.worklet?.disconnected).toBeGreaterThan(0);
    expect(context.muteGain?.disconnected).toBeGreaterThan(0);
    expect(context.closed).toBe(true);
  });

  it('resumes a suspended context and cleans up when it cannot become running', async () => {
    context.state = 'suspended';
    context.resumeTo = 'suspended';
    const { startVoiceCapture } = await import('@/lib/voiceAudio');
    await expect(startVoiceCapture(() => {})).rejects.toThrow(/failed to run/i);
    expect(context.resumeCalls).toBe(1);
    expect(tracks[0]?.stopped).toBe(true);
    expect(context.closed).toBe(true);
  });

  it('makes stop idempotent and ignores worklet frames after stop', async () => {
    const { startVoiceCapture } = await import('@/lib/voiceAudio');
    const onFrame = vi.fn();
    const handle = await startVoiceCapture(onFrame);
    const worklet = context.worklet;
    const receive = worklet?.port.onmessage;
    expect(receive).toEqual(expect.any(Function));

    worklet?.port.emit(pcm16Le(320, 8_192));
    const framesBeforeStop = onFrame.mock.calls.length;
    expect(framesBeforeStop).toBe(1);

    handle.stop();
    handle.stop();
    expect(tracks[0]?.stopped).toBe(true);
    expect(context.closeCalls).toBe(1);
    expect(worklet?.port.onmessage).toBeNull();
    expect(worklet?.port.closed).toBe(true);
    expect(worklet?.disconnected).toBe(1);
    expect(context.source?.disconnected).toBe(1);
    expect(context.muteGain?.disconnected).toBe(1);

    receive?.({ data: pcm16Le(320, 29_490) });
    expect(onFrame.mock.calls.length).toBe(framesBeforeStop);
  });

  it('configures 16 kHz PCM16 LE worklet frames and interpolates continuously across blocks', async () => {
    vi.stubGlobal('sampleRate', 48_000);
    const registerProcessor = vi.fn();
    vi.stubGlobal('registerProcessor', registerProcessor);
    class AudioWorkletProcessorStub {
      port = { postMessage: vi.fn() };
    }
    vi.stubGlobal('AudioWorkletProcessor', AudioWorkletProcessorStub);

    await import('../../public/voice/voice-capture-processor.js' as string);
    const Processor = registerProcessor.mock.calls[0]?.[1] as (new (options: {
      processorOptions: { frameSamples: number };
    }) => {
      port: { postMessage: ReturnType<typeof vi.fn> };
      process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
    }) | undefined;
    expect(Processor).toBeDefined();

    const { VOICE_AGENT_INPUT_RATE, VOICE_AUDIO_FRAME_MS } = await import('@/lib/voiceAgentConfig');
    const frameSamples = Math.round(VOICE_AGENT_INPUT_RATE * (VOICE_AUDIO_FRAME_MS / 1000));
    const processor = new Processor!({ processorOptions: { frameSamples } });
    const combined = new Float32Array(4_096);
    for (let index = 0; index < combined.length; index += 1) {
      combined[index] = index / combined.length;
    }
    const blockA = combined.subarray(0, 2_048);
    const blockB = combined.subarray(2_048);

    expect(processor.process([[blockA]], [[new Float32Array(blockA.length)]])).toBe(true);
    expect(processor.process([[blockB]], [[new Float32Array(blockB.length)]])).toBe(true);

    const frames = processor.port.postMessage.mock.calls.map(([chunk]) => chunk as ArrayBuffer);
    expect(frames.length).toBeGreaterThan(0);
    for (const chunk of frames) {
      expect(chunk.byteLength).toBe(frameSamples * 2);
    }

    const decoded = frames.flatMap(chunk => pcm16Samples(chunk));
    const expected: number[] = [];
    const step = 48_000 / VOICE_AGENT_INPUT_RATE;
    for (let position = 0; Math.floor(position) + 1 < combined.length; position += step) {
      const index = Math.floor(position);
      const s0 = combined[index] ?? 0;
      const s1 = combined[index + 1] ?? 0;
      expected.push(s0 + (s1 - s0) * (position - index));
    }

    expect(decoded.length).toBe(Math.floor(expected.length / frameSamples) * frameSamples);
    for (let index = 0; index < decoded.length; index += 1) {
      expect(decoded[index]).toBeCloseTo(expected[index] ?? 0, 3);
    }
  });
});
