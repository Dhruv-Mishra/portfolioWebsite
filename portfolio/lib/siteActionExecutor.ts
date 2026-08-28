'use client';

import type { ActionExecution } from '@/lib/actions';
import {
  getSoundVolumeSync,
  setDiscoActiveImperative,
  setSoundsMutedImperative,
  setSoundVolumeImperative,
} from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';
import {
  dispatchProjectVideoControl,
  waitForSiteActionHost,
} from '@/lib/siteActionEvents';

const VOLUME_STEP = 0.1;
const executedIds = new Set<string>();

function applyVolume(next: number): void {
  const clamped = Math.min(1, Math.max(0, next));
  setSoundVolumeImperative(clamped);
  soundManager.setVolume(clamped);
  soundManager.setMuted(clamped <= 0);
}

export async function executeSiteAction(
  action: ActionExecution,
  options: {
    id?: string;
    setTheme?: (theme: 'light' | 'dark') => void;
    resolvedTheme?: string;
    openProject?: (slug: string) => void;
    navigate?: (path: string) => void;
    openFeedback?: () => void;
    markOpenUrlsFailed?: () => void;
  } = {},
): Promise<void> {
  if (options.id) {
    if (executedIds.has(options.id)) return;
    executedIds.add(options.id);
  }

  if (action.themeAction) {
    if (action.themeAction === 'toggle') {
      options.setTheme?.(options.resolvedTheme === 'dark' ? 'light' : 'dark');
    } else if (action.themeAction === 'disco') {
      if (typeof window !== 'undefined') {
        void import('@/components/DiscoMediaLayer').catch(() => undefined);
      }
      setDiscoActiveImperative(true);
    } else if (action.themeAction === 'disco-off') {
      setDiscoActiveImperative(false);
    } else {
      options.setTheme?.(action.themeAction);
    }
  }

  if (action.feedbackAction) {
    options.openFeedback?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-feedback'));
    }
  }

  if (action.projectSlug) {
    options.openProject?.(action.projectSlug);
  }

  if (action.openUrls?.length && typeof window !== 'undefined') {
    let blocked = false;
    for (const url of action.openUrls) {
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) blocked = true;
    }
    if (blocked) options.markOpenUrlsFailed?.();
  }

  if (action.audioAction) {
    if (action.audioAction === 'mute') {
      setSoundsMutedImperative(true);
      soundManager.setMuted(true);
    } else if (action.audioAction === 'unmute') {
      const volume = Math.max(getSoundVolumeSync(), VOLUME_STEP);
      setSoundVolumeImperative(volume);
      setSoundsMutedImperative(false);
      soundManager.setVolume(volume);
      soundManager.setMuted(false);
    } else if (action.audioAction === 'toggle') {
      const next = !soundManager.isMuted();
      setSoundsMutedImperative(next);
      soundManager.setMuted(next);
    } else if (action.audioAction === 'volume-up') {
      applyVolume(getSoundVolumeSync() + VOLUME_STEP);
    } else if (action.audioAction === 'volume-down') {
      applyVolume(getSoundVolumeSync() - VOLUME_STEP);
    } else if (action.audioAction === 'volume-set') {
      const percent = typeof action.audioVolume === 'number' ? action.audioVolume : 100;
      applyVolume(percent / 100);
    }
  }

  if (action.projectVideoAction) {
    const ready = await waitForSiteActionHost('project-video');
    if (ready) dispatchProjectVideoControl(action.projectVideoAction);
  }

  if (action.navigateTo) {
    options.navigate?.(action.navigateTo);
  }
}
