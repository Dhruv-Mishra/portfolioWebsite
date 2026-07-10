"use client";

import { useCallback } from 'react';
import {
  getAdminPrefsSnapshot,
  setAdminPref,
  useAdminPrefs,
  type AdminPrefs,
  type MotionPreference,
} from '@/hooks/useAdminPrefs';

export interface SitePrefs {
  paperGrain: boolean;
  tapeEffects: boolean;
  sketchOutlines: boolean;
  stickersEnabled: boolean;
  stickerToastsEnabled: boolean;
  hapticsEnabled: boolean;
  motionPreference: MotionPreference;
}

export type SitePrefKey = keyof SitePrefs;

function toSitePrefs(prefs: AdminPrefs): SitePrefs {
  return {
    paperGrain: prefs.paperGrain,
    tapeEffects: prefs.tapeEffects,
    sketchOutlines: prefs.sketchOutlines,
    stickersEnabled: prefs.stickersEnabled,
    stickerToastsEnabled: prefs.stickerToastsEnabled,
    hapticsEnabled: prefs.hapticsEnabled,
    motionPreference: prefs.motionPreference,
  };
}

export function setSitePref<K extends SitePrefKey>(
  key: K,
  value: SitePrefs[K],
): void;
export function setSitePref(
  key: SitePrefKey,
  value: SitePrefs[SitePrefKey],
): void {
  if (key === 'motionPreference') {
    if (value === 'system' || value === 'reduced') {
      setAdminPref('motionPreference', value);
    }
    return;
  }
  if (typeof value !== 'boolean') return;
  switch (key) {
    case 'paperGrain':
      setAdminPref('paperGrain', value);
      return;
    case 'tapeEffects':
      setAdminPref('tapeEffects', value);
      return;
    case 'sketchOutlines':
      setAdminPref('sketchOutlines', value);
      return;
    case 'stickersEnabled':
      setAdminPref('stickersEnabled', value);
      return;
    case 'stickerToastsEnabled':
      setAdminPref('stickerToastsEnabled', value);
      return;
    case 'hapticsEnabled':
      setAdminPref('hapticsEnabled', value);
  }
}

export function getSitePrefsSnapshot(): SitePrefs {
  return toSitePrefs(getAdminPrefsSnapshot());
}

export function useSitePrefs(): SitePrefs {
  return toSitePrefs(useAdminPrefs());
}

export interface UseSitePrefsApi {
  prefs: SitePrefs;
  setPref: <K extends SitePrefKey>(key: K, value: SitePrefs[K]) => void;
}

export function useSitePrefsApi(): UseSitePrefsApi {
  const prefs = useSitePrefs();
  const setPref = useCallback(
    <K extends SitePrefKey>(key: K, value: SitePrefs[K]) => {
      setSitePref(key, value);
    },
    [],
  );
  return { prefs, setPref };
}