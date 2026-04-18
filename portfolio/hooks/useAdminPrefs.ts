"use client";

/**
 * useAdminPrefs — the /admin console preferences store.
 *
 * Contains four toggles:
 *   1. Paper grain — cosmetic paper texture on bodies
 *   2. Tape effects — the decorative tape strips on stickers/notes
 *   3. Sketch outlines — the dashed "sketch" borders on cards
 *   4. Experimental commands — the gate that unlocks `sudo matrix` in
 *      `sudo help`. Emphasized on /admin because its patience ties into
 *      the puzzle's 20-second wait.
 *
 * Persistence: localStorage (`dhruv-admin-prefs`). Applied by:
 *   - body-level `data-pref-*` attributes on <html> (set by
 *     `AdminPrefsController` mounted globally) → CSS selectors in
 *     globals.css toggle the visual treatments off/on.
 *   - the terminal help output reads `experimentalCommandsEnabled`
 *     directly to decide whether to list `sudo matrix`.
 *
 * Not-persisted-in-sticker-store reasoning: stickers.ts already carries a
 * lot of cross-cutting user state and has a tightly versioned migration
 * chain. Admin prefs are a separate concern with their own small
 * surface — keeping them in a tiny standalone store makes them easy to
 * reset without touching sticker progress.
 */

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'dhruv-admin-prefs';
const STORAGE_VERSION = 1 as const;

export interface AdminPrefs {
  version: typeof STORAGE_VERSION;
  /** Paper grain texture on main surfaces. Default: on. */
  paperGrain: boolean;
  /** Decorative tape strips on stickers + notes. Default: on. */
  tapeEffects: boolean;
  /** Dashed sketch outlines on cards. Default: on. */
  sketchOutlines: boolean;
  /** The flagship gate — enables `sudo matrix` in sudo help. Default: off. */
  experimentalCommands: boolean;
}

function defaultPrefs(): AdminPrefs {
  return {
    version: STORAGE_VERSION,
    paperGrain: true,
    tapeEffects: true,
    sketchOutlines: true,
    experimentalCommands: false,
  };
}

function readFromStorage(): AdminPrefs {
  if (typeof window === 'undefined') return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<AdminPrefs>;
    if (!parsed || typeof parsed !== 'object') return defaultPrefs();
    return {
      version: STORAGE_VERSION,
      paperGrain: parsed.paperGrain !== false,
      tapeEffects: parsed.tapeEffects !== false,
      sketchOutlines: parsed.sketchOutlines !== false,
      experimentalCommands: parsed.experimentalCommands === true,
    };
  } catch {
    return defaultPrefs();
  }
}

function writeToStorage(next: AdminPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

// ─── Module-level singleton ────────────────────────────────────────────────
let state: AdminPrefs = defaultPrefs();
let initialized = false;
const listeners = new Set<() => void>();

function initOnce(): void {
  if (initialized || typeof window === 'undefined') return;
  state = readFromStorage();
  initialized = true;
}

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  initOnce();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AdminPrefs {
  initOnce();
  return state;
}

// ─── Imperative setters (used by the admin page toggles) ───────────────────

export function setAdminPref<K extends keyof Omit<AdminPrefs, 'version'>>(
  key: K,
  value: AdminPrefs[K],
): void {
  initOnce();
  if (state[key] === value) return;
  const next: AdminPrefs = { ...state, [key]: value };
  state = next;
  writeToStorage(next);
  emit();
}

// ─── Hook ──────────────────────────────────────────────────────────────────

const SERVER_PREFS: AdminPrefs = defaultPrefs();
function getServerSnapshot(): AdminPrefs {
  return SERVER_PREFS;
}

export function useAdminPrefs(): AdminPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface UseAdminPrefsApi {
  prefs: AdminPrefs;
  setPref: <K extends keyof Omit<AdminPrefs, 'version'>>(key: K, value: AdminPrefs[K]) => void;
}

/** Convenience API — prefs + stable setter. */
export function useAdminPrefsApi(): UseAdminPrefsApi {
  const prefs = useAdminPrefs();
  const setPref = useCallback(
    <K extends keyof Omit<AdminPrefs, 'version'>>(key: K, value: AdminPrefs[K]) => {
      setAdminPref(key, value);
    },
    [],
  );
  return { prefs, setPref };
}

// ─── Sync to <html data-pref-*> attributes ─────────────────────────────────

/**
 * Imperatively apply prefs to `<html data-pref-...>`. Called once on boot
 * and on every pref change by the controller component so CSS selectors
 * in globals.css can react.
 */
export function applyPrefsToDocument(prefs: AdminPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (prefs.paperGrain) root.dataset.prefPaper = 'on';
  else delete root.dataset.prefPaper;
  if (prefs.tapeEffects) root.dataset.prefTape = 'on';
  else delete root.dataset.prefTape;
  if (prefs.sketchOutlines) root.dataset.prefSketch = 'on';
  else delete root.dataset.prefSketch;
  if (prefs.experimentalCommands) root.dataset.prefExperimental = 'on';
  else delete root.dataset.prefExperimental;
}

/**
 * Synchronous read for non-React call sites (e.g. the terminal's sudo
 * help handler).
 */
export function getExperimentalCommandsSync(): boolean {
  initOnce();
  return state.experimentalCommands;
}

/** @internal — test helper, never call in app code. */
export function __resetAdminPrefsForTest(): void {
  state = defaultPrefs();
  initialized = false;
  listeners.clear();
}
