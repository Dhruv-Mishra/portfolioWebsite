import { getSoundsMutedSync } from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';

export type VoiceCueId = 'voice-toggle' | 'voice-action';
export type VoiceSoundId = VoiceCueId | 'voice-ambient';

const VOICE_SOUND_URLS: Record<VoiceSoundId, string> = {
  'voice-toggle': '/sounds/voice/toggle.mp3',
  'voice-action': '/sounds/voice/action.mp3',
  'voice-ambient': '/sounds/voice/ambient.mp3',
};

const VOICE_VISUAL_URLS = [
  '/voice/ai-ripple.gif',
  '/voice/ai-ripple-still.webp',
] as const;

const TOGGLE_VOLUME = 0.38;
const ACTION_VOLUME = 0.30;
const AMBIENT_VOLUME = 0.10;
const AMBIENT_FADE_IN_MS = 900;
const AMBIENT_FADE_OUT_MS = 320;
const AMBIENT_FADE_OUT_REDUCED_MS = 120;

const cache = new Map<VoiceSoundId, HTMLAudioElement>();
let ambientPhase: 'idle' | 'in' | 'playing' | 'out' = 'idle';
let ambientFadeFrame = 0;
let ambientFadeToken = 0;

function getAudio(id: VoiceSoundId): HTMLAudioElement {
  const existing = cache.get(id);
  if (existing) return existing;
  const audio = new Audio(VOICE_SOUND_URLS[id]);
  audio.preload = 'auto';
  audio.loop = id === 'voice-ambient';
  if (id === 'voice-ambient') audio.volume = 0;
  cache.set(id, audio);
  return audio;
}

function isCuePlaying(audio: HTMLAudioElement): boolean {
  return !audio.paused && audio.currentTime > 0 && !audio.ended;
}

function prefersReducedVoiceMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced') {
    return true;
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'full') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function cancelAmbientFade(): void {
  ambientFadeToken += 1;
  if (ambientFadeFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(ambientFadeFrame);
  }
  ambientFadeFrame = 0;
}

function fadeAmbientVolume(
  audio: HTMLAudioElement,
  from: number,
  to: number,
  ms: number,
  onDone: () => void,
): void {
  cancelAmbientFade();
  const token = ambientFadeToken;
  audio.volume = from;
  if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
    audio.volume = to;
    if (token === ambientFadeToken) onDone();
    return;
  }

  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const step = (now: number) => {
    if (token !== ambientFadeToken) return;
    const elapsed = now - startedAt;
    const t = Math.min(1, elapsed / ms);
    audio.volume = from + (to - from) * t;
    if (t < 1) {
      ambientFadeFrame = requestAnimationFrame(step);
      return;
    }
    ambientFadeFrame = 0;
    onDone();
  };
  ambientFadeFrame = requestAnimationFrame(step);
}

export function prefetchVoiceSounds(): void {
  (Object.keys(VOICE_SOUND_URLS) as VoiceSoundId[]).forEach(id => {
    getAudio(id).load();
  });
}

export function prefetchVoiceVisuals(): void {
  if (typeof Image === 'undefined') return;
  for (const src of VOICE_VISUAL_URLS) {
    const image = new Image();
    image.src = src;
  }
}

export function playVoiceSound(id: VoiceCueId): void {
  if (getSoundsMutedSync()) return;
  const audio = getAudio(id);
  if (isCuePlaying(audio)) return;
  audio.volume = id === 'voice-toggle' ? TOGGLE_VOLUME : ACTION_VOLUME;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    /* keep voice cues isolated from site fallbacks */
  });
}

export function startVoiceAmbient(enabled: boolean): void {
  if (!enabled || getSoundsMutedSync()) return;
  if (ambientPhase === 'in' || ambientPhase === 'playing' || ambientPhase === 'out') return;
  const audio = getAudio('voice-ambient');
  ambientPhase = 'in';
  audio.volume = 0;
  const playResult = audio.play();
  const beginFade = () => {
    if (ambientPhase !== 'in') return;
    fadeAmbientVolume(audio, 0, AMBIENT_VOLUME, AMBIENT_FADE_IN_MS, () => {
      if (ambientPhase !== 'in') return;
      ambientPhase = 'playing';
      audio.volume = AMBIENT_VOLUME;
    });
  };
  if (playResult && typeof playResult.then === 'function') {
    void playResult.then(beginFade).catch(() => {
      ambientPhase = 'idle';
    });
    return;
  }
  beginFade();
}

export function stopVoiceAmbient(options: { fadeMs?: number } = {}): void {
  const audio = cache.get('voice-ambient');
  const fadeMs = options.fadeMs ?? (
    prefersReducedVoiceMotion() ? AMBIENT_FADE_OUT_REDUCED_MS : AMBIENT_FADE_OUT_MS
  );
  if (!audio || ambientPhase === 'idle') {
    soundManager.stopLoop('disco-loop');
    return;
  }

  ambientPhase = 'out';
  fadeAmbientVolume(audio, audio.volume || AMBIENT_VOLUME, 0, fadeMs, () => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
    ambientPhase = 'idle';
  });
  soundManager.stopLoop('disco-loop');
}

export function __resetVoiceSoundsForTest(): void {
  cancelAmbientFade();
  ambientPhase = 'idle';
  for (const audio of cache.values()) {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
  }
  cache.clear();
}
