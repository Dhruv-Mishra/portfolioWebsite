import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiLiveCaller } from '@/lib/geminiLiveAdapter';
import { VOICE_LIVE_WS_PATH } from '@/lib/voiceAgentConfig';
import type { VoiceCallerEventMap, VoiceSessionHandle } from '@/lib/voiceAgentProtocol';

type LiveMessageHandler = {
  handleMessage: (
    raw: unknown,
    context?: {
      epoch: number;
      socket: WebSocket;
      onReady?: () => void;
      onError?: () => void;
    },
  ) => Promise<void>;
  socket: WebSocket | null;
  ready: boolean;
};

function internals(caller: GeminiLiveCaller): LiveMessageHandler {
  return caller as unknown as LiveMessageHandler;
}

function collect(caller: GeminiLiveCaller) {
  const events: Array<{ event: keyof VoiceCallerEventMap; payload: unknown }> = [];
  const keys = [
    'phase',
    'userTranscript',
    'agentTranscript',
    'audio',
    'interrupted',
    'turnComplete',
    'health',
    'error',
    'ended',
  ] as const;
  for (const key of keys) {
    caller.on(key, payload => {
      events.push({ event: key, payload });
    });
  }
  return events;
}

async function becomeReady(caller: GeminiLiveCaller): Promise<void> {
  await internals(caller).handleMessage(JSON.stringify({ setupComplete: true }));
}

function pcmInline(): string {
  return typeof btoa === 'function' ? btoa('\u0000\u0001') : 'AAE=';
}

function sessionHandle(resumeHandle?: string): VoiceSessionHandle {
  return {
    token: 'token-1',
    expiresAt: '2099-01-01T00:00:00.000Z',
    newSessionExpiresAt: '2099-01-01T00:01:00.000Z',
    ...(resumeHandle ? { resumeHandle } : {}),
    setup: {
      modelLabel: 'native-live',
      voiceLabel: 'male',
      inputSampleRate: 16_000,
      outputSampleRate: 24_000,
      greetOnConnect: false,
      lowNetwork: false,
      welcomeGreeting: 'Hey, welcome in.',
      welcomeHint: 'Try saying open projects.',
      ...(resumeHandle ? { resumeHandle } : {}),
    },
  };
}

type SocketListener = (event?: { data?: unknown }) => void;

class TestSocket {
  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];
  listeners = new Map<string, Set<SocketListener>>();
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: SocketListener) {
    const bucket = this.listeners.get(type) ?? new Set<SocketListener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  emit(type: string, event?: { data?: unknown }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open() {
    this.readyState = 1;
    this.emit('open');
  }
}

let createdSockets: TestSocket[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  createdSockets = [];
});

function stubSockets() {
  createdSockets = [];
  vi.stubGlobal('WebSocket', class {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url: string) {
      const socket = new TestSocket(url);
      createdSockets.push(socket);
      return socket;
    }
  });
}

describe('gemini live adapter message handling', () => {
  it('emits transcripts and speaking without flipping to listening on input or generationComplete', async () => {
    const caller = new GeminiLiveCaller();
    const events = collect(caller);
    await becomeReady(caller);
    events.length = 0;

    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { inputTranscription: { text: 'hello there' } },
    }));
    expect(events).toEqual([
      { event: 'userTranscript', payload: 'hello there' },
    ]);

    events.length = 0;
    await internals(caller).handleMessage(JSON.stringify({
      serverContent: {
        outputTranscription: { text: 'welcome in' },
        modelTurn: {
          parts: [{ inlineData: { data: pcmInline() } }],
        },
      },
    }));
    expect(events.some(event => event.event === 'agentTranscript' && event.payload === 'welcome in')).toBe(true);
    expect(events.some(event => event.event === 'audio')).toBe(true);
    expect(events.filter(event => event.event === 'phase').map(event => event.payload)).toEqual(['speaking', 'speaking']);

    events.length = 0;
    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { generationComplete: true },
    }));
    expect(events).toEqual([]);

    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { turnComplete: true },
    }));
    expect(events).toEqual([
      { event: 'turnComplete', payload: true },
      { event: 'phase', payload: 'listening' },
    ]);
  });

  it('emits interrupted and listening when the model reports an interrupt', async () => {
    const caller = new GeminiLiveCaller();
    const events = collect(caller);
    await becomeReady(caller);
    events.length = 0;

    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { interrupted: true },
    }));
    expect(events).toEqual([
      { event: 'interrupted', payload: true },
      { event: 'phase', payload: 'listening' },
    ]);
  });

  it('emits audio immediately after an interrupt without a persistent latch', async () => {
    const caller = new GeminiLiveCaller();
    const events = collect(caller);
    await becomeReady(caller);
    events.length = 0;

    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { interrupted: true },
    }));
    await internals(caller).handleMessage(JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: pcmInline() } }],
        },
      },
    }));

    expect(events.filter(event => event.event === 'audio')).toHaveLength(1);
    expect(events.filter(event => event.event === 'phase').map(event => event.payload)).toEqual([
      'listening',
      'speaking',
    ]);
  });

  it('stores only a bounded resumable handle and emits GoAway health once', async () => {
    const caller = new GeminiLiveCaller();
    const events = collect(caller);
    await becomeReady(caller);
    events.length = 0;

    await internals(caller).handleMessage(JSON.stringify({
      sessionResumptionUpdate: { resumable: false, newHandle: 'stale-handle' },
    }));
    expect(caller.getResumeHandle()).toBeNull();

    await internals(caller).handleMessage(JSON.stringify({
      sessionResumptionUpdate: { resumable: true, newHandle: '  next-handle  ' },
    }));
    expect(caller.getResumeHandle()).toBe('next-handle');

    await internals(caller).handleMessage(JSON.stringify({
      sessionResumptionUpdate: { resumable: true, newHandle: `bad\u0001handle` },
    }));
    expect(caller.getResumeHandle()).toBe('next-handle');

    await internals(caller).handleMessage(JSON.stringify({ goAway: { timeLeft: '10s' } }));
    await internals(caller).handleMessage(JSON.stringify({ goAway: { timeLeft: '5s' } }));
    expect(events.filter(event => event.event === 'health')).toEqual([
      { event: 'health', payload: { ok: false, configured: true, reason: 'Voice session is ending.' } },
    ]);
  });
});

describe('gemini live adapter connect and send path', () => {
  it('resolves connect only after setupComplete and includes a resume handle in setup', async () => {
    stubSockets();
    const caller = new GeminiLiveCaller();
    const connecting = caller.connect(sessionHandle('resume-1'));
    const socket = createdSockets[0];
    expect(socket).toBeTruthy();
    expect(socket?.url).toContain(VOICE_LIVE_WS_PATH);
    expect(socket?.listeners.has('open')).toBe(true);
    expect(socket?.listeners.has('message')).toBe(true);
    expect(socket?.listeners.has('close')).toBe(true);
    expect(socket?.listeners.has('error')).toBe(true);

    socket?.open();
    await Promise.resolve();
    expect(socket?.sent).toHaveLength(1);
    expect(JSON.parse(socket?.sent[0] ?? '{}')).toMatchObject({
      setup: {
        generationConfig: { thinkingConfig: { thinkingLevel: 'MINIMAL' } },
        sessionResumption: { handle: 'resume-1' },
      },
    });

    let resolved = false;
    void connecting.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    socket?.emit('message', { data: JSON.stringify({ setupComplete: true }) });
    await connecting;
    expect(resolved).toBe(true);
    expect(internals(caller).ready).toBe(true);
  });

  it('rejects connect when the socket closes before setupComplete', async () => {
    stubSockets();
    const caller = new GeminiLiveCaller();
    const connecting = caller.connect(sessionHandle());
    createdSockets[0]?.open();
    createdSockets[0]?.emit('close');
    await expect(connecting).rejects.toThrow('Voice connection failed.');
  });

  it('rejects connect if setupComplete never arrives', async () => {
    vi.useFakeTimers();
    stubSockets();
    const caller = new GeminiLiveCaller();
    const connecting = caller.connect(sessionHandle());
    createdSockets[0]?.open();
    const expectation = expect(connecting).rejects.toThrow('Voice connection timed out.');
    await vi.advanceTimersByTimeAsync(8_000);
    await expectation;
  });

  it('drops PCM when the socket is backpressured and can send stream end', async () => {
    stubSockets();
    const caller = new GeminiLiveCaller();
    const connecting = caller.connect(sessionHandle());
    const socket = createdSockets[0];
    socket?.open();
    socket?.emit('message', { data: JSON.stringify({ setupComplete: true }) });
    await connecting;
    socket!.sent = [];

    socket!.bufferedAmount = 256 * 1024 + 1;
    caller.sendAudio(new Uint8Array([1, 2]).buffer);
    expect(socket?.sent).toEqual([]);

    socket!.bufferedAmount = 0;
    caller.sendAudio(new Uint8Array([3, 4]).buffer);
    caller.endAudioStream();
    expect(socket?.sent).toHaveLength(2);
    expect(JSON.parse(socket?.sent[1] ?? '{}')).toEqual({
      realtimeInput: { audioStreamEnd: true },
    });
  });

  it('emits ended health once for an unexpected close after ready', async () => {
    stubSockets();
    const caller = new GeminiLiveCaller();
    const events = collect(caller);
    const connecting = caller.connect(sessionHandle());
    const socket = createdSockets[0];
    socket?.open();
    socket?.emit('message', { data: JSON.stringify({ setupComplete: true }) });
    await connecting;
    events.length = 0;

    socket?.emit('close');
    socket?.emit('close');
    expect(events.filter(event => event.event === 'health')).toEqual([
      { event: 'health', payload: { ok: false, configured: true, reason: 'Voice connection closed.' } },
    ]);
    expect(events.filter(event => event.event === 'ended')).toEqual([
      { event: 'ended', payload: 'health' },
    ]);
  });

  it('emits recoverable health for post-ready socket and provider errors', async () => {
    stubSockets();
    const socketCaller = new GeminiLiveCaller();
    const socketEvents = collect(socketCaller);
    const socketConnect = socketCaller.connect(sessionHandle());
    createdSockets[0]?.open();
    createdSockets[0]?.emit('message', { data: JSON.stringify({ setupComplete: true }) });
    await socketConnect;
    socketEvents.length = 0;

    createdSockets[0]?.emit('error');
    createdSockets[0]?.emit('error');
    expect(socketEvents.filter(event => event.event === 'health')).toEqual([
      { event: 'health', payload: { ok: false, configured: true, reason: 'Voice connection interrupted.' } },
    ]);

    const providerCaller = new GeminiLiveCaller();
    const providerEvents = collect(providerCaller);
    const providerConnect = providerCaller.connect(sessionHandle());
    createdSockets[1]?.open();
    createdSockets[1]?.emit('message', { data: JSON.stringify({ setupComplete: true }) });
    await providerConnect;
    providerEvents.length = 0;

    createdSockets[1]?.emit('message', { data: JSON.stringify({ error: { code: 500 } }) });
    expect(providerEvents.filter(event => event.event === 'health')).toEqual([
      { event: 'health', payload: { ok: false, configured: true, reason: 'Voice connection interrupted.' } },
    ]);
  });
});
