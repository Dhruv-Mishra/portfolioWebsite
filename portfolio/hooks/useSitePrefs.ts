"use client";

import { useCallback } from 'react';
import { PAPER_STOCK_ORDER } from '@/lib/designTokens';
import { LOOK_KEYS, isLookKey, isLookValue, type LookPrefs } from '@/lib/lookPrefs';
import {
  getAdminPrefsSnapshot,
  isPaperStock,
  resetAdminPrefs,
  setAdminPref,
  useAdminPrefs,
  type AdminPrefs,
  type MotionPreference,
  type PaperStock,
  type ReadingFont,
} from '@/hooks/useAdminPrefs';

export type { PaperStock, ReadingFont };

export interface SitePrefs extends LookPrefs {
  paperStock: PaperStock;
  paperGrain: boolean;
  tapeEffects: boolean;
  sketchOutlines: boolean;
  experimentalFeatures: boolean;
  stickersEnabled: boolean;
  stickerToastsEnabled: boolean;
  hapticsEnabled: boolean;
  pageFlipEnabled: boolean;
  motionPreference: MotionPreference;
  readingFont: ReadingFont;
}

export type SitePrefKey = keyof SitePrefs;

/** Everything under Settings > Customization: how the sketchbook looks and moves. */
export const CUSTOMIZATION_KEYS = [
  ...LOOK_KEYS,
  'paperStock',
  'paperGrain',
  'tapeEffects',
  'sketchOutlines',
  'pageFlipEnabled',
  'motionPreference',
] as const satisfies readonly SitePrefKey[];

export function resetCustomization(): boolean {
  return resetAdminPrefs(CUSTOMIZATION_KEYS);
}

function toSitePrefs(prefs: AdminPrefs): SitePrefs {
  const look = Object.fromEntries(LOOK_KEYS.map((key) => [key, prefs[key]])) as LookPrefs;
  return {
    ...look,
    paperStock: prefs.paperStock,
    paperGrain: prefs.paperGrain,
    tapeEffects: prefs.tapeEffects,
    sketchOutlines: prefs.sketchOutlines,
    experimentalFeatures: prefs.experimentalFeatures,
    stickersEnabled: prefs.stickersEnabled,
    stickerToastsEnabled: prefs.stickerToastsEnabled,
    hapticsEnabled: prefs.hapticsEnabled,
    pageFlipEnabled: prefs.pageFlipEnabled,
    motionPreference: prefs.motionPreference,
    readingFont: prefs.readingFont,
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
  if (isLookKey(key)) {
    return isLookValue(key, value) ? setAdminPref(key, value) : false;
  }
  if (key === 'paperStock') {
    return isPaperStock(value) ? setAdminPref('paperStock', value) : false;
  }
  if (key === 'motionPreference') {
    if (value === 'system' || value === 'reduced' || value === 'full') {
      return setAdminPref('motionPreference', value);
    }
    return false;
  }
  if (key === 'readingFont') {
    return value === 'hand' || value === 'clean' ? setAdminPref('readingFont', value) : false;
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
    case 'pageFlipEnabled':
      return setAdminPref('pageFlipEnabled', value);
  }
}

export function cyclePaperStock(): PaperStock {
  const current = getAdminPrefsSnapshot().paperStock;
  const idx = PAPER_STOCK_ORDER.indexOf(current);
  const next = PAPER_STOCK_ORDER[(idx + 1) % PAPER_STOCK_ORDER.length];
  setAdminPref('paperStock', next);
  return next;
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