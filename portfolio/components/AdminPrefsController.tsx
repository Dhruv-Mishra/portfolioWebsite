"use client";

/**
 * AdminPrefsController — mirrors public visual preferences into
 * `<html data-pref-*>` attributes so CSS selectors in globals.css can
 * toggle visual treatments. Internal puzzle preferences are intentionally
 * never exposed as document attributes.
 *
 * Single-purpose + tiny. Mounted once by EagerEnhancements.
 */

import { useEffect } from 'react';
import { applyPrefsToDocument, REDUCED_MOTION_QUERY, useAdminPrefs } from '@/hooks/useAdminPrefs';

export default function AdminPrefsController(): null {
  const prefs = useAdminPrefs();
  useEffect(() => {
    applyPrefsToDocument(prefs);
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => applyPrefsToDocument(prefs);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [prefs]);
  return null;
}
