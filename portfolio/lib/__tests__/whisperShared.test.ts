import { afterEach, describe, expect, it } from 'vitest';

import {
  getAudioContextConstructor,
  getOfflineAudioContextConstructor,
  hasWhisperAudioSupport,
} from '@/lib/whisperShared';

describe('Whisper browser support detection', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'navigator');
  });

  it('accepts Safari-prefixed Web Audio constructors', () => {
    class AudioContextMock {}
    class OfflineAudioContextMock {}
    class MediaRecorderMock {}
    Object.defineProperty(globalThis, 'window', {
      value: {
        MediaRecorder: MediaRecorderMock,
        webkitAudioContext: AudioContextMock,
        webkitOfflineAudioContext: OfflineAudioContextMock,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia: () => Promise.resolve({}) } },
      configurable: true,
      writable: true,
    });

    expect(getAudioContextConstructor()).toBe(AudioContextMock);
    expect(getOfflineAudioContextConstructor()).toBe(OfflineAudioContextMock);
    expect(hasWhisperAudioSupport()).toBe(true);
  });

  it('requires offline audio rendering for Whisper resampling', () => {
    class AudioContextMock {}
    class MediaRecorderMock {}
    Object.defineProperty(globalThis, 'window', {
      value: {
        MediaRecorder: MediaRecorderMock,
        AudioContext: AudioContextMock,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia: () => Promise.resolve({}) } },
      configurable: true,
      writable: true,
    });

    expect(getAudioContextConstructor()).toBe(AudioContextMock);
    expect(getOfflineAudioContextConstructor()).toBeNull();
    expect(hasWhisperAudioSupport()).toBe(false);
  });
});
