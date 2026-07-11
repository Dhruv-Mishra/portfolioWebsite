"use client";

/**
 * useAdminPrefs — the internal preferences store used by /admin and the
 * public site settings facade.
 *
 * Contains internal and public preferences. Public callers must use
 * `useSitePrefs` rather than this module so `experimentalCommands` remains
 * private to the admin console and terminal puzzle.
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
const STORAGE_VERSION = 5 as const;

export type MotionPreference = 'system' | 'reduced' | 'full';

export interface AdminPrefs {
  version: typeof STORAGE_VERSION;
  /** Paper grain texture on main surfaces. Default: on. */
  paperGrain: boolean;
  /** Decorative tape strips on stickers + notes. Default: on. */
  tapeEffects: boolean;
  /** Dashed sketch outlines on cards. Default: on. */
  sketchOutlines: boolean;
  /** Opts into preview site features and the staging build. Default: off. */
  experimentalFeatures: boolean;
  /** The flagship gate — enables `sudo matrix` in sudo help. Default: off. */
  experimentalCommands: boolean;
  /** Master switch — when false, no new stickers are earned (no roster
   *  mutation, no bus emit, no toast). Default: on. */
  stickersEnabled: boolean;
  /** When false, sticker unlocks happen silently (no toast UI, no sound,
   *  no haptic). The glance badge can still pulse. Default: OFF — toasts
   *  are opt-in to keep the experience uncluttered. */
  stickerToastsEnabled: boolean;
  /** Whether supported touch/pen interactions may emit haptics. */
  hapticsEnabled: boolean;
  /** `system` follows the OS; `reduced` always reduces; `full` overrides the OS. */
  motionPreference: MotionPreference;
}

function defaultPrefs(): AdminPrefs {
  return {
    version: STORAGE_VERSION,
    paperGrain: true,
    tapeEffects: true,
    sketchOutlines: true,
    experimentalFeatures: false,
    experimentalCommands: false,
    stickersEnabled: true,
    stickerToastsEnabled: false,
    hapticsEnabled: true,
    motionPreference: 'system',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanField(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof record[key] === 'boolean' ? record[key] : fallback;
}

function parseStoredPrefs(raw: string | null): AdminPrefs {
  if (!raw) return defaultPrefs();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return defaultPrefs();

    return {
      version: STORAGE_VERSION,
      paperGrain: booleanField(parsed, 'paperGrain', true),
      tapeEffects: booleanField(parsed, 'tapeEffects', true),
      sketchOutlines: booleanField(parsed, 'sketchOutlines', true),
      experimentalFeatures: booleanField(parsed, 'experimentalFeatures', false),
      experimentalCommands: booleanField(parsed, 'experimentalCommands', false),
      stickersEnabled: booleanField(parsed, 'stickersEnabled', true),
      stickerToastsEnabled: booleanField(parsed, 'stickerToastsEnabled', false),
      hapticsEnabled: booleanField(parsed, 'hapticsEnabled', true),
      motionPreference:
        parsed.motionPreference === 'reduced' || parsed.motionPreference === 'full'
          ? parsed.motionPreference
          : 'system',
    };
  } catch {
    return defaultPrefs();
  }
}

function readFromStorage(): AdminPrefs {
  if (typeof window === 'undefined') return defaultPrefs();
  try {
    return parseStoredPrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultPrefs();
  }
}

function writeToStorage(next: AdminPrefs): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

// ─── Module-level singleton ────────────────────────────────────────────────
let state: AdminPrefs = defaultPrefs();
let initialized = false;
let storageListenerAttached = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return;
  state = parseStoredPrefs(event.newValue);
  initialized = true;
  emit();
}

function attachStorageListener(): void {
  if (
    storageListenerAttached
    || typeof window === 'undefined'
    || typeof window.addEventListener !== 'function'
  ) return;
  window.addEventListener('storage', handleStorageEvent);
  storageListenerAttached = true;
}

function initOnce(): void {
  if (initialized || typeof window === 'undefined') return;
  state = readFromStorage();
  initialized = true;
  attachStorageListener();
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
): boolean {
  initOnce();
  if (state[key] === value) return writeToStorage(state);
  const next: AdminPrefs = { ...state, [key]: value };
  state = next;
  const persisted = writeToStorage(next);
  emit();
  return persisted;
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
  if (prefs.motionPreference === 'reduced' || prefs.motionPreference === 'full') {
    root.dataset.motion = prefs.motionPreference;
  } else {
    delete root.dataset.motion;
  }
}

/**
 * Synchronous read for non-React call sites (e.g. the terminal's sudo
 * help handler).
 */
export function getExperimentalCommandsSync(): boolean {
  initOnce();
  return state.experimentalCommands;
}

/**
 * Imperative snapshot reader for non-React call sites (e.g. the sticker
 * unlock pipeline). Returns the live module state — do NOT mutate.
 */
export function getAdminPrefsSnapshot(): AdminPrefs {
  initOnce();
  return state;
}

/** @internal — test helper, never call in app code. */
export function __resetAdminPrefsForTest(): void {
  if (
    storageListenerAttached
    && typeof window !== 'undefined'
    && typeof window.removeEventListener === 'function'
  ) {
    window.removeEventListener('storage', handleStorageEvent);
  }
  state = defaultPrefs();
  initialized = false;
  storageListenerAttached = false;
  listeners.clear();
}
