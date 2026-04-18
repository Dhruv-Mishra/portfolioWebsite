"use client";

/**
 * AdminPrefsController — mirrors the admin-prefs store into
 * `<html data-pref-*>` attributes so CSS selectors in globals.css can
 * toggle visual treatments. Also bridges for the sticker store's
 * `superuser` signal which the terminal relies on.
 *
 * Single-purpose + tiny. Mounted once by EagerEnhancements.
 */

import { useEffect } from 'react';
import { applyPrefsToDocument, useAdminPrefs } from '@/hooks/useAdminPrefs';

export default function AdminPrefsController(): null {
  const prefs = useAdminPrefs();
  useEffect(() => {
    applyPrefsToDocument(prefs);
  }, [prefs]);
  return null;
}
