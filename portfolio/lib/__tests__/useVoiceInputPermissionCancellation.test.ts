import React, { useImperativeHandle } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  useVoiceInput,
  type UseVoiceInputResult,
  type VoiceBackend,
} from '@/hooks/useVoiceInput';

const nativeVoice = {
  isSupported: false,
  isListening: false,
  isRequestingPermission: false,
  transcript: '',
  interimTranscript: '',
  error: null,
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => nativeVoice,
}));

const voiceModeEvents = new EventTarget();
const documentShim = { documentElement: { dataset: {} as DOMStringMap } };
const transcription = vi.hoisted(() => vi.fn());
vi.mock('@/lib/whisperWorkerClient', () => ({
  preloadWhisperWorker: async () => true,
  transcribeWithWorker: transcription,
}));
vi.mock('@/lib/whisperShared', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/whisperShared')>(),
  blobToWhisperAudio: async () => new Float32Array(4000),
}));

const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalAudioContext = globalThis.AudioContext;
const originalOfflineAudioContext = globalThis.OfflineAudioContext;

let mediaRecorderConstructed: Mock<() => void>;
let getUserMedia: ReturnType<typeof vi.fn>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const Harness = React.forwardRef<UseVoiceInputResult, { backend: VoiceBackend }>(function Harness(
  { backend },
  ref,
) {
  const voice = useVoiceInput({ backend });
  useImperativeHandle(ref, () => voice, [voice]);
  return null;
});

function createLateStream() {
  const stop = vi.fn();
  return {
    stop,
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  documentShim.documentElement.dataset = {};
  mediaRecorderConstructed = vi.fn();
  getUserMedia = vi.fn();

  class MediaRecorderMock {
    static isTypeSupported() { return true; }
    state = 'inactive';
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void) | null = null;

    constructor() {
      mediaRecorderConstructed();
    }

    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['audio']) } as BlobEvent);
      void this.onstop?.();
    }
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(Object.create(globalThis), {
      addEventListener: voiceModeEvents.addEventListener.bind(voiceModeEvents),
      removeEventListener: voiceModeEvents.removeEventListener.bind(voiceModeEvents),
      dispatchEvent: voiceModeEvents.dispatchEvent.bind(voiceModeEvents),
    }),
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentShim });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      language: 'en-US',
      mediaDevices: { getUserMedia },
    },
  });
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: MediaRecorderMock,
  });
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: class AudioContextMock {},
  });
  Object.defineProperty(globalThis, 'OfflineAudioContext', {
    configurable: true,
    value: class OfflineAudioContextMock {},
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalMediaRecorder });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: originalAudioContext });
  Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: originalOfflineAudioContext });
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('useVoiceInput pending Whisper permission cancellation', () => {
  it.each(['reset', 'unmount', 'backend change'] as const)(
    '%s clears pending UI and rejects a late stream before recording starts',
    async (cancellation) => {
      const pendingStream = deferred<MediaStream>();
      getUserMedia.mockReturnValue(pendingStream.promise);
      let renderer!: TestRenderer.ReactTestRenderer;
      const voiceRef = React.createRef<UseVoiceInputResult>();

      await act(async () => {
        renderer = TestRenderer.create(React.createElement(Harness, { backend: 'whisper', ref: voiceRef }));
      });
      act(() => voiceRef.current!.start());

      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(voiceRef.current!.isRequestingPermission).toBe(true);

      await act(async () => {
        if (cancellation === 'reset') voiceRef.current!.reset();
        else if (cancellation === 'unmount') renderer.unmount();
        else renderer.update(React.createElement(Harness, { backend: 'native', ref: voiceRef }));
      });

      if (cancellation !== 'unmount') {
        expect(voiceRef.current!.isRequestingPermission).toBe(false);
      }

      const { stream, stop } = createLateStream();
      await act(async () => {
        pendingStream.resolve(stream);
        await pendingStream.promise;
      });

      expect(stop).toHaveBeenCalledOnce();
      expect(mediaRecorderConstructed).not.toHaveBeenCalled();
      if (cancellation !== 'unmount') {
        expect(voiceRef.current!.isListening).toBe(false);
        expect(voiceRef.current!.backend).not.toBe('whisper');
      }

      if (cancellation !== 'unmount') renderer.unmount();
    },
  );

  it('suppresses overlapping starts while the browser prompt is unresolved', async () => {
    const pendingStream = deferred<MediaStream>();
    getUserMedia.mockReturnValue(pendingStream.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    const voiceRef = React.createRef<UseVoiceInputResult>();

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { backend: 'whisper', ref: voiceRef }));
    });
    act(() => {
      voiceRef.current!.start();
      voiceRef.current!.start();
    });

    expect(getUserMedia).toHaveBeenCalledOnce();

    await act(async () => voiceRef.current!.reset());
    const { stream, stop } = createLateStream();
    await act(async () => {
      pendingStream.resolve(stream);
      await pendingStream.promise;
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(mediaRecorderConstructed).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('ignores a canceled transcription that finishes during a newer recording', async () => {
    const oldResult = deferred<string>();
    transcription.mockReturnValueOnce(oldResult.promise).mockResolvedValueOnce('new draft');
    const first = createLateStream();
    const second = createLateStream();
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    const voiceRef = React.createRef<UseVoiceInputResult>();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { backend: 'whisper', ref: voiceRef }));
    });
    await act(async () => voiceRef.current!.start());
    await act(async () => voiceRef.current!.stop());
    expect(transcription).toHaveBeenCalledOnce();
    await act(async () => {
      voiceRef.current!.reset();
      voiceRef.current!.start();
    });
    await act(async () => oldResult.resolve('canceled draft'));
    expect(voiceRef.current!.transcript).toBe('');
    expect(voiceRef.current!.isListening).toBe(true);
    expect(second.stop).not.toHaveBeenCalled();
    await act(async () => voiceRef.current!.stop());
    expect(voiceRef.current!.transcript).toBe('new draft');
    await act(async () => renderer.unmount());
  });

  it.each(['recording', 'permission pending'] as const)('cancels dictation when a live call starts (%s)', async phase => {
    const stream = createLateStream();
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValue(phase === 'recording' ? Promise.resolve(stream.stream) : pending.promise);
    const voiceRef = React.createRef<UseVoiceInputResult>();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { backend: 'whisper', ref: voiceRef }));
    });
    await act(async () => voiceRef.current!.start());
    await act(async () => {
      documentShim.documentElement.dataset.voiceMode = 'intro';
      window.dispatchEvent(new Event('voice-mode:change'));
      pending.resolve(stream.stream);
    });
    expect(stream.stop).toHaveBeenCalledOnce();
    expect(voiceRef.current!.isListening).toBe(false);
    expect(voiceRef.current!.isRequestingPermission).toBe(false);
    expect(nativeVoice.stop).toHaveBeenCalled();
    expect(voiceRef.current!.transcript).toBe('');
    await act(async () => renderer.unmount());
  });

});