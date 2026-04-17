"use client";

/**
 * useStickers — React hook over the sticker store.
 *
 * Architecture:
 *   - A module-level singleton holds the canonical state (unlocked set,
 *     lastEarnedAt, lastSeenAlbumAt, visitedRoutes, sudo mode, disco toggle,
 *     terminalCommands set, openedProjects set). LocalStorage is the
 *     persistence layer with explicit version gating + migration.
 *   - A toast queue runs serially with a 500ms gap between toasts.
 *   - React consumers subscribe via useSyncExternalStore for tearing-free reads.
 *
 * The wide entrypoint is `useStickers()` which returns the full API. Hot-path
 * consumers (toast listener, glance badge, individual sticker cards) should
 * instead use one of the narrow selector hooks:
 *   - useStickerUnlocked()      — the unlocked-id array identity
 *   - useIsStickerUnlocked(id)  — boolean for a single sticker
 *   - useStickerProgress()      — { unlocked, total, hasUnseenSticker,
 *                                    hasSuperuser }
 *   - useActiveStickerToast()   — current toast id or null
 *   - useSuperuserUnlocked()    — boolean — has earned superuser
 *   - useDiscoActive()          — boolean — disco theme active
 *
 * These subscribe to narrow slices so they skip re-renders when unrelated
 * store fields change. React's default Object.is comparator on the snapshot
 * result is what gates the re-render; the store guarantees slice references
 * are identity-stable until that specific field mutates.
 *
 * Also exposes `unlockSticker(id)` (imperative) used from the bus listener.
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  STICKER_ROSTER,
  STICKER_TOTAL,
  SUPERUSER_STICKER,
  hasEarnedAllRegularStickers,
  type StickerId,
  type RegularStickerId,
  type SuperuserId,
} from '@/lib/stickers';
import { STICKER_TIMING } from '@/lib/designTokens';

const STORAGE_KEY = 'dhruv-stickers';
/** v2 adds superuser tracking, unique terminal command set, opened-project set, sudo/disco flags. */
export const STORAGE_VERSION = 2 as const;

// ─── State shape ────────────────────────────────────────────────────────
export interface StickerState {
  version: typeof STORAGE_VERSION;
  unlocked: StickerId[];
  unlockedAt: Record<string, number>;
  lastEarnedAt: number;
  lastSeenAlbumAt: number;
  visitedRoutes: string[];
  /** Distinct terminal commands run — unlocks `terminal-addict` at size ≥5 */
  terminalCommands: string[];
  /** Distinct project slugs whose modal has been opened — unlocks `project-explorer` at size 8 */
  openedProjects: string[];
  /** Persisted disco theme flag — null/false when off. Only meaningful post-superuser. */
  discoActive: boolean;
  /** Persisted disco music mute preference. Sticky across sessions. */
  discoMuted: boolean;
}

// Valid sticker ID set — regulars + superuser.
const VALID_STICKER_IDS: ReadonlySet<StickerId> = new Set<StickerId>([
  ...STICKER_ROSTER.map((s) => s.id),
  SUPERUSER_STICKER.id,
]);

function defaultState(): StickerState {
  return {
    version: STORAGE_VERSION,
    unlocked: [],
    unlockedAt: {},
    lastEarnedAt: 0,
    lastSeenAlbumAt: 0,
    visitedRoutes: [],
    terminalCommands: [],
    openedProjects: [],
    discoActive: false,
    discoMuted: false,
  };
}

/**
 * Migrate a v1 persisted state to v2 without losing earned stickers or
 * visited-routes progress. Older clients only tracked `{unlocked, unlockedAt,
 * lastEarnedAt, lastSeenAlbumAt, visitedRoutes}`; we keep those, seed the new
 * set-based fields as empty, and never touch localStorage for users who
 * haven't upgraded yet (we rewrite on first mutation).
 */
function migrateV1ToV2(parsed: Record<string, unknown>): StickerState {
  const unlocked = Array.isArray(parsed.unlocked)
    ? parsed.unlocked.filter((id): id is StickerId => typeof id === 'string' && VALID_STICKER_IDS.has(id as StickerId))
    : [];
  const unlockedAt =
    parsed.unlockedAt && typeof parsed.unlockedAt === 'object'
      ? (parsed.unlockedAt as Record<string, number>)
      : {};
  const visitedRoutes = Array.isArray(parsed.visitedRoutes)
    ? (parsed.visitedRoutes as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];

  return {
    version: STORAGE_VERSION,
    unlocked,
    unlockedAt,
    lastEarnedAt: typeof parsed.lastEarnedAt === 'number' ? parsed.lastEarnedAt : 0,
    lastSeenAlbumAt: typeof parsed.lastSeenAlbumAt === 'number' ? parsed.lastSeenAlbumAt : 0,
    visitedRoutes,
    terminalCommands: [],
    openedProjects: [],
    discoActive: false,
    discoMuted: false,
  };
}

/**
 * Parse + sanitize a persisted state blob. Exposed for unit tests so we can
 * verify migration behaviour without touching localStorage directly.
 */
export function parseStoredState(raw: string | null): StickerState {
  if (!raw) return defaultState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultState();
  }
  if (!parsed || typeof parsed !== 'object') return defaultState();
  const obj = parsed as Record<string, unknown>;

  const version = obj.version;
  // v1 → v2 migration
  if (version === 1) {
    return migrateV1ToV2(obj);
  }
  if (version !== STORAGE_VERSION) {
    // Unknown/future version — rather than wipe, take what we can safely keep
    // (just the unlocked list, if valid). This is still safer than blowing
    // away years of progress on a bad deploy.
    if (Array.isArray(obj.unlocked)) {
      return migrateV1ToV2(obj);
    }
    return defaultState();
  }

  // Current version — sanitize every array field.
  const unlocked = Array.isArray(obj.unlocked)
    ? obj.unlocked.filter((id): id is StickerId => typeof id === 'string' && VALID_STICKER_IDS.has(id as StickerId))
    : [];
  const unlockedAt =
    obj.unlockedAt && typeof obj.unlockedAt === 'object'
      ? (obj.unlockedAt as Record<string, number>)
      : {};
  const visitedRoutes = Array.isArray(obj.visitedRoutes)
    ? (obj.visitedRoutes as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];
  const terminalCommands = Array.isArray(obj.terminalCommands)
    ? (obj.terminalCommands as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const openedProjects = Array.isArray(obj.openedProjects)
    ? (obj.openedProjects as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  return {
    version: STORAGE_VERSION,
    unlocked,
    unlockedAt,
    lastEarnedAt: typeof obj.lastEarnedAt === 'number' ? obj.lastEarnedAt : 0,
    lastSeenAlbumAt: typeof obj.lastSeenAlbumAt === 'number' ? obj.lastSeenAlbumAt : 0,
    visitedRoutes,
    terminalCommands,
    openedProjects,
    discoActive: obj.discoActive === true,
    discoMuted: obj.discoMuted === true,
  };
}

function readFromStorage(): StickerState {
  if (typeof window === 'undefined') return defaultState();
  try {
    return parseStoredState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultState();
  }
}

function writeToStorage(state: StickerState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or disabled — silently ignore */
  }
}

// ─── Store (module-level singleton) ─────────────────────────────────────
export interface StickerProgress {
  readonly unlocked: number;
  readonly total: number;
  readonly hasUnseenSticker: boolean;
  /** Whether the hidden superuser sticker has been awarded. */
  readonly hasSuperuser: boolean;
}

interface StoreShape {
  state: StickerState;
  toastQueue: StickerId[];
  activeToast: StickerId | null;
  listeners: Set<() => void>;
  toastTimerId: ReturnType<typeof setTimeout> | null;
  initialized: boolean;
  /** Cached progress snapshot — invalidated by recomputeProgress() on mutation. */
  progress: StickerProgress;
}

function computeProgress(state: StickerState): StickerProgress {
  return Object.freeze({
    unlocked: state.unlocked.filter((id) => id !== SUPERUSER_STICKER.id).length,
    total: STICKER_TOTAL,
    hasUnseenSticker: state.lastEarnedAt > state.lastSeenAlbumAt,
    hasSuperuser: state.unlocked.includes(SUPERUSER_STICKER.id),
  });
}

const store: StoreShape = {
  state: defaultState(),
  toastQueue: [],
  activeToast: null,
  listeners: new Set(),
  toastTimerId: null,
  initialized: false,
  progress: computeProgress(defaultState()),
};

function recomputeProgress(): void {
  const next = computeProgress(store.state);
  const prev = store.progress;
  if (
    prev.unlocked === next.unlocked &&
    prev.total === next.total &&
    prev.hasUnseenSticker === next.hasUnseenSticker &&
    prev.hasSuperuser === next.hasSuperuser
  ) {
    return;
  }
  store.progress = next;
}

function initializeStoreOnce(): void {
  if (store.initialized || typeof window === 'undefined') return;
  store.state = readFromStorage();
  // If the persisted blob was a v1 schema (or otherwise mutated by migration),
  // proactively rewrite once at initialization so subsequent reads are fast
  // and version-stable. Only do this if we actually have data to write —
  // avoid polluting storage for fresh visitors.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORAGE_VERSION) {
        writeToStorage(store.state);
      }
    }
  } catch {
    /* ignore — write-on-migrate is best-effort */
  }
  store.progress = computeProgress(store.state);
  store.initialized = true;
}

function emitChange(): void {
  for (const l of store.listeners) l();
}

function subscribe(listener: () => void): () => void {
  initializeStoreOnce();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function getSnapshot(): StickerState {
  initializeStoreOnce();
  return store.state;
}

// Cache server snapshot to keep useSyncExternalStore happy.
const SERVER_STATE: StickerState = defaultState();

function getServerSnapshot(): StickerState {
  return SERVER_STATE;
}

function getToastSnapshot(): StickerId | null {
  return store.activeToast;
}

function subscribeToast(listener: () => void): () => void {
  return subscribe(listener);
}

// ─── Toast queue ────────────────────────────────────────────────────────
function scheduleNextToast(): void {
  if (store.activeToast !== null) return;
  const next = store.toastQueue.shift();
  if (!next) return;
  store.activeToast = next;
  emitChange();
  store.toastTimerId = setTimeout(() => {
    dismissToastInternal();
  }, STICKER_TIMING.toastDuration);
}

function dismissToastInternal(): void {
  if (store.toastTimerId !== null) {
    clearTimeout(store.toastTimerId);
    store.toastTimerId = null;
  }
  store.activeToast = null;
  emitChange();
  setTimeout(scheduleNextToast, STICKER_TIMING.toastGap);
}

function enqueueToast(id: StickerId): void {
  if (store.toastQueue.length >= STICKER_TIMING.toastMaxInQueue) return;
  store.toastQueue.push(id);
  if (store.activeToast === null) {
    scheduleNextToast();
  }
}

// ─── Imperative mutations ───────────────────────────────────────────────

/**
 * Unlock a sticker. Idempotent — returns early if already unlocked.
 *
 * Atomic side effect: when the unlocked list covers every regular sticker,
 * the Superuser sticker is automatically unlocked in the same tick (before
 * listeners fire), keeping the "earn the last regular → superuser appears"
 * transition tear-free.
 */
export function unlockSticker(id: StickerId): void {
  initializeStoreOnce();
  if (!VALID_STICKER_IDS.has(id)) return;
  const current = store.state;
  if (current.unlocked.includes(id)) return;

  const now = Date.now();
  let next: StickerState = {
    ...current,
    unlocked: [...current.unlocked, id],
    unlockedAt: { ...current.unlockedAt, [id]: now },
    lastEarnedAt: now,
  };

  // Auto-award superuser the moment every regular sticker is collected.
  // Skip if the id being unlocked IS the superuser (would double-award).
  if (
    id !== SUPERUSER_STICKER.id &&
    !next.unlocked.includes(SUPERUSER_STICKER.id) &&
    hasEarnedAllRegularStickers(next.unlocked)
  ) {
    next = {
      ...next,
      unlocked: [...next.unlocked, SUPERUSER_STICKER.id],
      unlockedAt: { ...next.unlockedAt, [SUPERUSER_STICKER.id]: now + 1 },
      lastEarnedAt: now + 1,
    };
  }

  store.state = next;
  recomputeProgress();
  writeToStorage(next);
  emitChange();
  enqueueToast(id);
  // Also enqueue the superuser toast so the user sees both pops.
  if (
    id !== SUPERUSER_STICKER.id &&
    next.unlocked.includes(SUPERUSER_STICKER.id) &&
    !current.unlocked.includes(SUPERUSER_STICKER.id)
  ) {
    enqueueToast(SUPERUSER_STICKER.id);
  }
}

export function markAlbumSeenImperative(): void {
  initializeStoreOnce();
  const current = store.state;
  const nextSeen = Date.now();
  if (current.lastSeenAlbumAt >= nextSeen) return;
  const next: StickerState = { ...current, lastSeenAlbumAt: nextSeen };
  store.state = next;
  recomputeProgress();
  writeToStorage(next);
  emitChange();
}

export function addVisitedRouteImperative(route: string): void {
  initializeStoreOnce();
  if (!route || typeof route !== 'string') return;
  const current = store.state;
  if (current.visitedRoutes.includes(route)) return;
  const next: StickerState = {
    ...current,
    visitedRoutes: [...current.visitedRoutes, route],
  };
  store.state = next;
  writeToStorage(next);
  emitChange();
}

/**
 * Record a distinct terminal command invocation. Returns the new distinct
 * count so the caller can decide whether to emit terminal-addict.
 */
export function recordTerminalCommandImperative(cmd: string): number {
  initializeStoreOnce();
  if (!cmd || typeof cmd !== 'string') return store.state.terminalCommands.length;
  const normalized = cmd.trim().toLowerCase();
  if (!normalized) return store.state.terminalCommands.length;
  const current = store.state;
  if (current.terminalCommands.includes(normalized)) return current.terminalCommands.length;
  const next: StickerState = {
    ...current,
    terminalCommands: [...current.terminalCommands, normalized],
  };
  store.state = next;
  writeToStorage(next);
  emitChange();
  return next.terminalCommands.length;
}

/**
 * Record that a project modal has been opened. Returns the new distinct
 * count so the caller can decide whether to emit project-explorer.
 */
export function recordOpenedProjectImperative(slug: string): number {
  initializeStoreOnce();
  if (!slug || typeof slug !== 'string') return store.state.openedProjects.length;
  const current = store.state;
  if (current.openedProjects.includes(slug)) return current.openedProjects.length;
  const next: StickerState = {
    ...current,
    openedProjects: [...current.openedProjects, slug],
  };
  store.state = next;
  writeToStorage(next);
  emitChange();
  return next.openedProjects.length;
}

/** Explicit setter for the disco flag — used by sudo commands. */
export function setDiscoActiveImperative(active: boolean): void {
  initializeStoreOnce();
  const current = store.state;
  if (current.discoActive === active) return;
  const next: StickerState = { ...current, discoActive: active };
  store.state = next;
  writeToStorage(next);
  emitChange();
}

/** Persist the user's mute preference for disco music. */
export function setDiscoMutedImperative(muted: boolean): void {
  initializeStoreOnce();
  const current = store.state;
  if (current.discoMuted === muted) return;
  const next: StickerState = { ...current, discoMuted: muted };
  store.state = next;
  writeToStorage(next);
  emitChange();
}

/**
 * Nuke all sticker progress. Invoked by `sudo reset` after confirmation.
 * Preserves the toast queue view so no orphan toasts flicker through.
 */
export function resetStickerProgressImperative(): void {
  initializeStoreOnce();
  store.state = defaultState();
  store.toastQueue = [];
  if (store.toastTimerId !== null) {
    clearTimeout(store.toastTimerId);
    store.toastTimerId = null;
  }
  store.activeToast = null;
  recomputeProgress();
  writeToStorage(store.state);
  emitChange();
}

export function dismissActiveToast(): void {
  dismissToastInternal();
}

// ─── Narrow selector snapshots ──────────────────────────────────────────

function getUnlockedSnapshot(): readonly StickerId[] {
  initializeStoreOnce();
  return store.state.unlocked;
}

function getProgressSnapshot(): StickerProgress {
  initializeStoreOnce();
  return store.progress;
}

// Server snapshots — stable references reused across requests.
const EMPTY_UNLOCKED: readonly StickerId[] = Object.freeze([]);
const SERVER_PROGRESS: StickerProgress = Object.freeze({
  unlocked: 0,
  total: STICKER_TOTAL,
  hasUnseenSticker: false,
  hasSuperuser: false,
});

function getUnlockedServerSnapshot(): readonly StickerId[] {
  return EMPTY_UNLOCKED;
}

function getProgressServerSnapshot(): StickerProgress {
  return SERVER_PROGRESS;
}

// ─── Narrow public hooks ────────────────────────────────────────────────

export function useStickerUnlocked(): readonly StickerId[] {
  return useSyncExternalStore(subscribe, getUnlockedSnapshot, getUnlockedServerSnapshot);
}

export function useIsStickerUnlocked(id: StickerId): boolean {
  const getIsUnlocked = useCallback((): boolean => {
    initializeStoreOnce();
    return store.state.unlocked.includes(id);
  }, [id]);
  const getServerIsUnlocked = useCallback((): boolean => false, []);
  return useSyncExternalStore(subscribe, getIsUnlocked, getServerIsUnlocked);
}

export function useStickerProgress(): StickerProgress {
  return useSyncExternalStore(subscribe, getProgressSnapshot, getProgressServerSnapshot);
}

export function useActiveStickerToast(): StickerId | null {
  return useSyncExternalStore(subscribeToast, getToastSnapshot, () => null);
}

function getSuperuserSnapshot(): boolean {
  initializeStoreOnce();
  return store.state.unlocked.includes(SUPERUSER_STICKER.id);
}

function getSuperuserServerSnapshot(): boolean {
  return false;
}

/** True when the hidden superuser sticker has been earned. */
export function useSuperuserUnlocked(): boolean {
  return useSyncExternalStore(subscribe, getSuperuserSnapshot, getSuperuserServerSnapshot);
}

function getDiscoSnapshot(): boolean {
  initializeStoreOnce();
  return store.state.discoActive;
}

function getDiscoServerSnapshot(): boolean {
  return false;
}

export function useDiscoActive(): boolean {
  return useSyncExternalStore(subscribe, getDiscoSnapshot, getDiscoServerSnapshot);
}

function getDiscoMutedSnapshot(): boolean {
  initializeStoreOnce();
  return store.state.discoMuted;
}

function getDiscoMutedServerSnapshot(): boolean {
  return false;
}

export function useDiscoMuted(): boolean {
  return useSyncExternalStore(subscribe, getDiscoMutedSnapshot, getDiscoMutedServerSnapshot);
}

// ─── Non-reactive accessor (for imperative call sites) ──────────────────
/**
 * Synchronous read of whether the user has earned superuser. Intended for use
 * inside terminal command handlers — they are one-shot and don't need a
 * subscription. Never call this during render.
 */
export function isSuperuserEarnedSync(): boolean {
  initializeStoreOnce();
  return store.state.unlocked.includes(SUPERUSER_STICKER.id);
}

// ─── Public hook ────────────────────────────────────────────────────────
export interface UseStickersReturn {
  unlocked: readonly StickerId[];
  unlockedAt: Readonly<Record<string, number>>;
  total: number;
  isUnlocked: (id: StickerId) => boolean;
  hasUnseenSticker: boolean;
  hasSuperuser: boolean;
  markAlbumSeen: () => void;
  visitedRoutes: readonly string[];
  addVisitedRoute: (route: string) => void;
  activeToast: StickerId | null;
  dismissToast: () => void;
}

export function useStickers(): UseStickersReturn {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const activeToast = useSyncExternalStore(subscribeToast, getToastSnapshot, () => null);

  const isUnlocked = useCallback((id: StickerId) => state.unlocked.includes(id), [state.unlocked]);

  const markAlbumSeen = useCallback(() => {
    markAlbumSeenImperative();
  }, []);

  const addVisitedRoute = useCallback((route: string) => {
    addVisitedRouteImperative(route);
  }, []);

  const dismissToast = useCallback(() => {
    dismissActiveToast();
  }, []);

  const hasUnseenSticker = state.lastEarnedAt > state.lastSeenAlbumAt;
  const hasSuperuser = state.unlocked.includes(SUPERUSER_STICKER.id);

  return {
    unlocked: state.unlocked,
    unlockedAt: state.unlockedAt,
    total: STICKER_TOTAL,
    isUnlocked,
    hasUnseenSticker,
    hasSuperuser,
    markAlbumSeen,
    visitedRoutes: state.visitedRoutes,
    addVisitedRoute,
    activeToast,
    dismissToast,
  };
}

// ─── Test hook — reset the module singleton in tests. Never call in app. ──
/** @internal — do not use outside test environments. */
export function __resetStoreForTest(): void {
  store.state = defaultState();
  store.toastQueue = [];
  store.activeToast = null;
  store.listeners.clear();
  if (store.toastTimerId !== null) {
    clearTimeout(store.toastTimerId);
    store.toastTimerId = null;
  }
  store.initialized = false;
  store.progress = computeProgress(store.state);
}

export type { RegularStickerId, SuperuserId };
