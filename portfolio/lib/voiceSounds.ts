import { getEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { getSitePrefsSnapshot } from '@/hooks/useSitePrefs';
import { getSoundsMutedSync } from '@/hooks/useStickers';
import { SITE_VERSION } from '@/lib/siteVersion';
import { soundManager } from '@/lib/soundManager';

export type VoiceCueId = 'voice-enter' | 'voice-exit' | 'voice-action';
export type VoiceSoundId = VoiceCueId | 'voice-ambient';

type AmbientPhase = 'idle' | 'primed' | 'in' | 'playing' | 'out';

// Enter/exit: Mixkit "Software interface start" (2574) + "Software interface back" (2575), Mixkit SFX Free License. https://mixkit.co/free-sound-effects/interface/ https://mixkit.co/license/#sfxFree
const VOICE_SOUND_URLS: Record<VoiceSoundId, string> = {
  'voice-enter': `/sounds/voice/enter.mp3?v=${SITE_VERSION}`,
  'voice-exit': `/sounds/voice/exit.mp3?v=${SITE_VERSION}`,
  'voice-action': `/sounds/voice/action.mp3?v=${SITE_VERSION}`,
  'voice-ambient': `/sounds/voice/ambient.mp3?v=${SITE_VERSION}`,
};

const VOICE_VISUAL_URLS = [
  '/voice/ai-ripple.gif',
  '/voice/ai-ripple-still.webp',
] as const;

const TOGGLE_VOLUME = 0.22;
const ACTION_VOLUME = 0.38;
const AMBIENT_VOLUME = 0.36;
const AMBIENT_DUCK_VOLUME = 0.10;
const TOGGLE_PLAY_MS = 450;
const TOGGLE_FADE_OUT_MS = 80;
const AMBIENT_FADE_IN_MS = 900;
const AMBIENT_FADE_OUT_MS = 320;
const AMBIENT_FADE_OUT_REDUCED_MS = 120;
const AMBIENT_DUCK_FADE_MS = 180;

const cache = new Map<VoiceSoundId, HTMLAudioElement>();
let ambientPhase: AmbientPhase = 'idle';
let ambientFadeFrame = 0;
let ambientFadeToken = 0;
let ambientDucked = false;
let toggleFadeTimer: ReturnType<typeof setTimeout> | null = null;
let toggleFadeFrame = 0;
let toggleFadeToken = 0;
let togglePlayUntil = 0;
let enterCuePrimed = false;

function clampMediaVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function getAudio(id: VoiceSoundId): HTMLAudioElement {
  const existing = cache.get(id);
  if (existing) return existing;
  const audio = new Audio(VOICE_SOUND_URLS[id]);
  audio.preload = 'none';
  audio.loop = id === 'voice-ambient';
  if (id === 'voice-ambient') audio.volume = clampMediaVolume(0);
  cache.set(id, audio);
  return audio;
}

function isAmbientPlaying(audio: HTMLAudioElement): boolean {
  return !audio.paused && !audio.ended;
}

function shouldPrefetchLoad(id: VoiceSoundId, audio: HTMLAudioElement): boolean {
  if (isAmbientPlaying(audio)) return false;
  if (id === 'voice-ambient' && ambientPhase !== 'idle') return false;
  if (audio.readyState > 0) return false;
  return true;
}

function prefersReducedVoiceMotion(): boolean {
  return getEffectiveReducedMotion(getSitePrefsSnapshot().motionPreference);
}

function cancelAmbientFade(): void {
  ambientFadeToken += 1;
  if (ambientFadeFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(ambientFadeFrame);
  }
  ambientFadeFrame = 0;
}

function ambientTargetVolume(): number {
  return ambientDucked ? AMBIENT_DUCK_VOLUME : AMBIENT_VOLUME;
}

function cancelToggleCue(): void {
  toggleFadeToken += 1;
  if (toggleFadeTimer !== null) {
    clearTimeout(toggleFadeTimer);
    toggleFadeTimer = null;
  }
  if (toggleFadeFrame && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(toggleFadeFrame);
  }
  toggleFadeFrame = 0;
}

function fadeMediaVolume(
  audio: HTMLAudioElement,
  from: number,
  to: number,
  ms: number,
  isCurrent: () => boolean,
  setFrame: (id: number) => void,
  onDone: () => void,
): void {
  from = clampMediaVolume(from);
  to = clampMediaVolume(to);
  audio.volume = from;
  if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
    audio.volume = to;
    if (isCurrent()) onDone();
    return;
  }

  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const step = (now: number) => {
    if (!isCurrent()) return;
    const elapsed = now - startedAt;
    const t = Math.min(1, elapsed / ms);
    const next = clampMediaVolume(from + (to - from) * t);
    audio.volume = next;
    if (t < 1) {
      setFrame(requestAnimationFrame(step));
      return;
    }
    setFrame(0);
    onDone();
  };
  setFrame(requestAnimationFrame(step));
}

function stopToggleElement(audio: HTMLAudioElement, fadeMs: number): void {
  const token = toggleFadeToken;
  fadeMediaVolume(
    audio,
    audio.volume,
    0,
    fadeMs,
    () => token === toggleFadeToken,
    (id) => { toggleFadeFrame = id; },
    () => {
      if (token !== toggleFadeToken) return;
      audio.pause();
      audio.volume = clampMediaVolume(0);
    },
  );
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
  fadeMediaVolume(
    audio,
    from,
    to,
    ms,
    () => token === ambientFadeToken,
    (id) => { ambientFadeFrame = id; },
    onDone,
  );
}

export function prefetchVoiceSounds(): void {
  (Object.keys(VOICE_SOUND_URLS) as VoiceSoundId[]).forEach(id => {
    const audio = getAudio(id);
    if (!shouldPrefetchLoad(id, audio)) return;
    audio.load();
  });
}

export function prefetchVoiceVisuals(): void {
  if (typeof Image === 'undefined') return;
  for (const src of VOICE_VISUAL_URLS) {
    const image = new Image();
    image.src = src;
  }
}

export function unlockVoiceAudio(): void {
  if (typeof Audio === 'undefined') return;
  const enter = getAudio('voice-enter');
  const action = getAudio('voice-action');
  const ambient = getAudio('voice-ambient');
  if (!isAmbientPlaying(enter) && enter.readyState === 0) enter.load();
  if (!isAmbientPlaying(action) && action.readyState === 0) action.load();

  const ambientLive = ambientPhase !== 'idle' || isAmbientPlaying(ambient);
  if (ambientLive) return;

  if (ambient.readyState === 0) ambient.load();
  ambient.loop = true;
  ambient.volume = clampMediaVolume(0);
  ambientPhase = 'primed';
  const playResult = ambient.play();
  if (playResult && typeof playResult.then === 'function') {
    void playResult.catch(() => {
      if (ambientPhase === 'primed') ambientPhase = 'idle';
    });
  }
}

export function playVoiceSound(id: VoiceCueId): void {
  if (getSoundsMutedSync()) return;
  const audio = getAudio(id);
  if (id === 'voice-enter') {
    cancelToggleCue();
    audio.volume = clampMediaVolume(TOGGLE_VOLUME);
    audio.currentTime = 0;
    togglePlayUntil = Date.now() + TOGGLE_PLAY_MS;
    void audio.play().catch(() => {
      cache.delete(id);
    });
    toggleFadeTimer = setTimeout(() => {
      toggleFadeTimer = null;
      stopToggleElement(audio, TOGGLE_FADE_OUT_MS);
    }, TOGGLE_PLAY_MS);
    return;
  }
  audio.volume = clampMediaVolume(id === 'voice-exit' ? TOGGLE_VOLUME : ACTION_VOLUME);
  audio.currentTime = 0;
  void audio.play().catch(() => {
    cache.delete(id);
  });
}

export function primeVoiceEnterAudio(): void {
  unlockVoiceAudio();
  playVoiceSound('voice-enter');
  enterCuePrimed = true;
}

export function playVoiceEnterFallback(): void {
  if (enterCuePrimed) {
    enterCuePrimed = false;
    return;
  }
  unlockVoiceAudio();
  playVoiceSound('voice-enter');
}

export function stopVoiceToggleCue(options: { force?: boolean } = {}): void {
  if (!options.force && Date.now() < togglePlayUntil) return;
  const audio = cache.get('voice-enter');
  cancelToggleCue();
  togglePlayUntil = 0;
  if (!audio) return;
  stopToggleElement(audio, 0);
}

export function forceStopVoiceToggleCue(): void {
  stopVoiceToggleCue({ force: true });
}

export function setVoiceAmbientDucked(ducked: boolean): void {
  if (ambientDucked === ducked) return;
  ambientDucked = ducked;
  if (getSoundsMutedSync()) return;
  if (ambientPhase !== 'in' && ambientPhase !== 'playing') return;
  const audio = cache.get('voice-ambient');
  if (!audio) return;
  const target = ambientTargetVolume();
  if (Math.abs(audio.volume - target) < 0.005) {
    audio.volume = clampMediaVolume(target);
    return;
  }
  fadeAmbientVolume(audio, audio.volume, target, AMBIENT_DUCK_FADE_MS, () => {
    if (ambientPhase !== 'in' && ambientPhase !== 'playing') return;
    audio.volume = clampMediaVolume(target);
  });
}

export function startVoiceAmbient(enabled: boolean): void {
  soundManager.stopLoop('disco-loop');
  if (!enabled || getSoundsMutedSync()) return;
  if (ambientPhase === 'in' || ambientPhase === 'playing' || ambientPhase === 'out') return;
  const audio = getAudio('voice-ambient');
  audio.loop = true;

  if (ambientPhase === 'primed' && isAmbientPlaying(audio)) {
    ambientPhase = 'in';
    fadeAmbientVolume(audio, audio.volume || 0, ambientTargetVolume(), AMBIENT_FADE_IN_MS, () => {
      if (ambientPhase !== 'in') return;
      ambientPhase = 'playing';
      audio.volume = clampMediaVolume(ambientTargetVolume());
    });
    return;
  }

  ambientPhase = 'in';
  audio.volume = clampMediaVolume(0);
  const playResult = audio.play();
  const beginFade = () => {
    if (ambientPhase !== 'in') return;
    fadeAmbientVolume(audio, 0, ambientTargetVolume(), AMBIENT_FADE_IN_MS, () => {
      if (ambientPhase !== 'in') return;
      ambientPhase = 'playing';
      audio.volume = clampMediaVolume(ambientTargetVolume());
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
  ambientDucked = false;
  if (!audio || ambientPhase === 'idle') {
    soundManager.stopLoop('disco-loop');
    return;
  }

  ambientPhase = 'out';
  fadeAmbientVolume(audio, audio.volume || AMBIENT_VOLUME, 0, fadeMs, () => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = clampMediaVolume(0);
    ambientPhase = 'idle';
  });
  soundManager.stopLoop('disco-loop');
}

export function __resetVoiceSoundsForTest(): void {
  cancelAmbientFade();
  cancelToggleCue();
  soundManager.stopLoop('disco-loop');
  ambientPhase = 'idle';
  ambientDucked = false;
  togglePlayUntil = 0;
  enterCuePrimed = false;
  for (const audio of cache.values()) {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = clampMediaVolume(0);
  }
  cache.clear();
}
