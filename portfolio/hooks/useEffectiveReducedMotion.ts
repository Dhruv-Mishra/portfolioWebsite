"use client";

import { useSyncExternalStore } from 'react';
import { useSitePrefs } from '@/hooks/useSitePrefs';
import type { MotionPreference } from '@/hooks/useAdminPrefs';

const QUERY = '(prefers-reduced-motion: reduce)';

export function resolveReducedMotion(
  preference: MotionPreference,
  devicePrefersReducedMotion: boolean,
): boolean {
  if (preference === 'reduced') return true;
  if (preference === 'full') return false;
  return devicePrefersReducedMotion;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mediaQuery = window.matchMedia(QUERY);
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
}

function getDeviceSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

export function getEffectiveReducedMotion(preference: MotionPreference): boolean {
  return resolveReducedMotion(preference, getDeviceSnapshot());
}

export function useEffectiveReducedMotion(): boolean {
  const { motionPreference } = useSitePrefs();
  const devicePrefersReducedMotion = useSyncExternalStore(
    subscribe,
    getDeviceSnapshot,
    () => false,
  );
  return resolveReducedMotion(motionPreference, devicePrefersReducedMotion);
}