import { getSoundsMutedSync } from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';

export type VoiceSoundId =
  | 'voice-enter'
  | 'voice-exit'
  | 'voice-action'
  | 'voice-listen'
  | 'voice-ambient';

const VOICE_SOUND_URLS: Record<VoiceSoundId, string> = {
  'voice-enter': '/sounds/voice/enter.mp3',
  'voice-exit': '/sounds/voice/exit.mp3',
  'voice-action': '/sounds/voice/action.mp3',
  'voice-listen': '/sounds/voice/listen.mp3',
  'voice-ambient': '/sounds/voice/ambient.mp3',
};

const cache = new Map<VoiceSoundId, HTMLAudioElement>();

function getAudio(id: VoiceSoundId): HTMLAudioElement {
  const existing = cache.get(id);
  if (existing) return existing;
  const audio = new Audio(VOICE_SOUND_URLS[id]);
  audio.preload = 'auto';
  audio.loop = id === 'voice-ambient';
  cache.set(id, audio);
  return audio;
}

export function prefetchVoiceSounds(): void {
  (Object.keys(VOICE_SOUND_URLS) as VoiceSoundId[]).forEach(id => {
    getAudio(id).load();
  });
}

export function playVoiceSound(id: VoiceSoundId): void {
  if (getSoundsMutedSync()) return;
  const audio = getAudio(id);
  audio.currentTime = 0;
  void audio.play().catch(() => {
    /* keep voice cues isolated from site fallbacks */
  });
}

export function startVoiceAmbient(enabled: boolean): void {
  if (!enabled || getSoundsMutedSync()) return;
  const audio = getAudio('voice-ambient');
  audio.volume = 0.18;
  void audio.play().catch(() => {
    /* do not start disco-loop as a voice ambient fallback */
  });
}

export function stopVoiceAmbient(): void {
  const audio = cache.get('voice-ambient');
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  soundManager.stopLoop('disco-loop');
}
