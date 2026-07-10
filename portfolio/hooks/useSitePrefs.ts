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
  experimentalFeatures: boolean;
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
    experimentalFeatures: prefs.experimentalFeatures,
    stickersEnabled: prefs.stickersEnabled,
    stickerToastsEnabled: prefs.stickerToastsEnabled,
    hapticsEnabled: prefs.hapticsEnabled,
    motionPreference: prefs.motionPreference,
  };
}

export function setSitePref<K extends SitePrefKey>(
  key: K,
  value: SitePrefs[K],
): boolean;
export function setSitePref(
  key: SitePrefKey,
  value: SitePrefs[SitePrefKey],
): boolean {
  if (key === 'motionPreference') {
    if (value === 'system' || value === 'reduced' || value === 'full') {
      return setAdminPref('motionPreference', value);
    }
    return false;
  }
  if (typeof value !== 'boolean') return false;
  switch (key) {
    case 'paperGrain':
      return setAdminPref('paperGrain', value);
    case 'tapeEffects':
      return setAdminPref('tapeEffects', value);
    case 'sketchOutlines':
      return setAdminPref('sketchOutlines', value);
    case 'experimentalFeatures':
      return setAdminPref('experimentalFeatures', value);
    case 'stickersEnabled':
      return setAdminPref('stickersEnabled', value);
    case 'stickerToastsEnabled':
      return setAdminPref('stickerToastsEnabled', value);
    case 'hapticsEnabled':
      return setAdminPref('hapticsEnabled', value);
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