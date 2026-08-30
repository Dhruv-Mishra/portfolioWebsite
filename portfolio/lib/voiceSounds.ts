import {
  getEffectiveAudioCategoryVolumeSync,
  subscribeAudioCategoryVolume,
} from '@/hooks/useStickers';
import { SITE_VERSION } from '@/lib/siteVersion';

const AMBIENT_URL = `/sounds/voice/ambient.mp3?v=${SITE_VERSION}`;
const ACTION_URL = `/sounds/voice/action.mp3?v=${SITE_VERSION}`;
const TOGGLE_URL = `/sounds/voice/toggle.mp3?v=${SITE_VERSION}`;
const AMBIENT_GAIN = 0.36;
const ACTION_GAIN = 0.38;
const TOGGLE_GAIN = 0.38;

let ambientEl: HTMLAudioElement | null = null;
let actionEl: HTMLAudioElement | null = null;
let toggleEl: HTMLAudioElement | null = null;
let volumeUnsubscribe: (() => void) | null = null;
let ambientUnlockToken = 0;
let actionUnlockToken = 0;
let togglePlayToken = 0;

function canUseAudio(): boolean {
  return typeof window !== 'undefined' && typeof Audio === 'function';
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function applyVoiceSoundVolumes(
  categoryVolume = getEffectiveAudioCategoryVolumeSync('voiceAgent'),
): void {
  const effective = clamp01(categoryVolume);
  if (ambientEl) ambientEl.volume = clamp01(effective * AMBIENT_GAIN);
  if (actionEl) actionEl.volume = clamp01(effective * ACTION_GAIN);
  if (toggleEl) toggleEl.volume = clamp01(effective * TOGGLE_GAIN);
}

function ensureVolumeSubscription(): void {
  if (volumeUnsubscribe) return;
  volumeUnsubscribe = subscribeAudioCategoryVolume('voiceAgent', applyVoiceSoundVolumes);
}

function unsubscribeVolume(): void {
  volumeUnsubscribe?.();
  volumeUnsubscribe = null;
}

function quietPlay(el: HTMLAudioElement): void {
  try {
    const play = el.play();
    if (play && typeof play.catch === 'function') {
      play.catch(() => {});
    }
  } catch {
    /* autoplay / play can throw synchronously */
  }
}

function silentUnlock(el: HTMLAudioElement, token: number, kind: 'ambient' | 'action'): void {
  const wasMuted = el.muted;
  el.muted = true;
  const restore = () => {
    if (kind === 'ambient' ? token !== ambientUnlockToken : token !== actionUnlockToken) return;
    try { el.pause(); } catch { /* ignore */ }
    try { el.currentTime = 0; } catch { /* ignore */ }
    el.muted = wasMuted;
  };
  try {
    const play = el.play();
    if (play && typeof play.then === 'function') {
      play.then(restore, restore);
    } else {
      restore();
    }
  } catch {
    restore();
  }
}

function ensureElements(): boolean {
  if (!canUseAudio()) return false;
  if (!ambientEl) {
    ambientEl = new Audio(AMBIENT_URL);
    ambientEl.loop = true;
    ambientEl.preload = 'auto';
  }
  if (!actionEl) {
    actionEl = new Audio(ACTION_URL);
    actionEl.preload = 'auto';
  }
  if (!toggleEl) {
    toggleEl = new Audio(TOGGLE_URL);
    toggleEl.preload = 'auto';
  }
  applyVoiceSoundVolumes();
  return true;
}

export function primeVoiceSounds(): void {
  if (volumeUnsubscribe) return;
  if (!ensureElements() || !ambientEl || !actionEl) return;
  ambientUnlockToken += 1;
  actionUnlockToken += 1;
  silentUnlock(ambientEl, ambientUnlockToken, 'ambient');
  silentUnlock(actionEl, actionUnlockToken, 'action');
}

export function startVoiceAmbient(): void {
  if (!ensureElements() || !ambientEl) return;
  ambientUnlockToken += 1;
  ensureVolumeSubscription();
  ambientEl.muted = false;
  quietPlay(ambientEl);
}

export function playVoiceAction(): void {
  if (!ensureElements() || !actionEl) return;
  actionUnlockToken += 1;
  ensureVolumeSubscription();
  actionEl.muted = false;
  try { actionEl.currentTime = 0; } catch { /* ignore */ }
  quietPlay(actionEl);
}

export function playVoiceToggle(onEnded?: () => void): void {
  if (!ensureElements() || !toggleEl) return;
  togglePlayToken += 1;
  const token = togglePlayToken;
  let completed = false;
  const complete = () => {
    if (completed || token !== togglePlayToken) return;
    completed = true;
    toggleEl!.onended = null;
    onEnded?.();
  };
  ensureVolumeSubscription();
  toggleEl.muted = false;
  toggleEl.onended = complete;
  try { toggleEl.currentTime = 0; } catch { /* ignore */ }
  try {
    const play = toggleEl.play();
    if (play && typeof play.catch === 'function') {
      play.catch(complete);
    }
  } catch {
    complete();
  }
}

export function stopVoiceSounds(): void {
  ambientUnlockToken += 1;
  actionUnlockToken += 1;
  togglePlayToken += 1;
  if (toggleEl) toggleEl.onended = null;
  unsubscribeVolume();
  for (const el of [ambientEl, actionEl]) {
    if (!el) continue;
    try { el.pause(); } catch { /* ignore */ }
    try { el.currentTime = 0; } catch { /* ignore */ }
  }
}

export function resetVoiceSoundsForTests(): void {
  stopVoiceSounds();
  if (toggleEl) {
    try { toggleEl.pause(); } catch { /* ignore */ }
    try { toggleEl.currentTime = 0; } catch { /* ignore */ }
  }
  ambientEl = null;
  actionEl = null;
  toggleEl = null;
}
