import {
  VOICE_AGENT_INPUT_RATE,
  VOICE_AGENT_OUTPUT_RATE,
} from '@/lib/voiceAgentConfig';

let primedCaptureContext: AudioContext | null = null;
let primedPlaybackContext: AudioContext | null = null;

function closeUnconsumedContext(context: AudioContext | null): void {
  if (!context || context.state === 'closed') return;
  try {
    void context.close().catch(() => {});
  } catch {
    /* already closed */
  }
}

export function createVoiceAudioContext(sampleRate: number): AudioContext {
  try {
    return new AudioContext({ sampleRate });
  } catch {
    return new AudioContext();
  }
}

function unlockContext(context: AudioContext): void {
  try {
    void context.resume().catch(() => {});
  } catch {
    /* resume can throw synchronously on partially supported implementations */
  }

  try {
    const buffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.addEventListener('ended', () => {
      try { source.disconnect(); } catch { /* already disconnected */ }
    }, { once: true });
    source.start();
  } catch {
    /* resume is still useful when silent-buffer unlock is unsupported */
  }
}

export function primeVoiceEnterAudio(): void {
  disposePrimedVoiceAudio();

  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;

  let capture: AudioContext | null = null;
  let playback: AudioContext | null = null;
  try {
    capture = createVoiceAudioContext(VOICE_AGENT_INPUT_RATE);
    playback = createVoiceAudioContext(VOICE_AGENT_OUTPUT_RATE);
    unlockContext(capture);
    unlockContext(playback);
    primedCaptureContext = capture;
    primedPlaybackContext = playback;
  } catch {
    closeUnconsumedContext(capture);
    closeUnconsumedContext(playback);
  }
}

export function disposePrimedVoiceAudio(): void {
  closeUnconsumedContext(primedCaptureContext);
  closeUnconsumedContext(primedPlaybackContext);
  primedCaptureContext = null;
  primedPlaybackContext = null;
}

export function takePrimedVoiceCaptureContext(): AudioContext | null {
  const context = primedCaptureContext;
  primedCaptureContext = null;
  return context;
}

export function takePrimedVoicePlaybackContext(): AudioContext | null {
  const context = primedPlaybackContext;
  primedPlaybackContext = null;
  return context;
}