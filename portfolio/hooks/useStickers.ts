"use client";

/**
 * useStickers — React hook over the sticker store.
 *
 * Architecture:
 *   - A module-level singleton holds the canonical state (unlocked set,
 *     lastEarnedAt, lastSeenAlbumAt, visitedRoutes). LocalStorage is the
 *     persistence layer, with version gating for future migrations.
 *   - A toast queue runs serially with a 500ms gap between toasts.
 *   - React consumers subscribe via useSyncExternalStore for tearing-free reads.
 *
 * The wide entrypoint is `useStickers()` which returns the full API. Hot-path
 * consumers (toast listener, glance badge, individual sticker cards) should
 * instead use one of the narrow selector hooks:
 *   - useStickerUnlocked()      — the unlocked-id array identity
 *   - useIsStickerUnlocked(id)  — boolean for a single sticker
 *   - useStickerProgress()      — { unlocked, total, hasUnseenSticker }
 *   - useActiveStickerToast()   — current toast id or null
 *
 * These subscribe to narrow slices so they skip re-renders when unrelated
 * store fields change. React's default Object.is comparator on the snapshot
 * result is what gates the re-render; the store guarantees slice references
 * are identity-stable until that specific field mutates.
 *
 * Also exposes `unlockSticker(id)` (imperative) used from the bus listener.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { STICKER_ROSTER, STICKER_TOTAL, type StickerId } from '@/lib/stickers';
import { STICKER_TIMING } from '@/lib/designTokens';

const STORAGE_KEY = 'dhruv-stickers';
const STORAGE_VERSION = 1 as const;

// ─── State shape ────────────────────────────────────────────────────────
export interface StickerState {
  version: typeof STORAGE_VERSION;
  unlocked: StickerId[];
  unlockedAt: Record<string, number>;
  lastEarnedAt: number;
  lastSeenAlbumAt: number;
  visitedRoutes: string[];
}

// Valid sticker ID set for incoming emits (guards against typos / stale events)
const VALID_STICKER_IDS: ReadonlySet<StickerId> = new Set(STICKER_ROSTER.map((s) => s.id));

function defaultState(): StickerState {
  return {
    version: STORAGE_VERSION,
    unlocked: [],
    unlockedAt: {},
    lastEarnedAt: 0,
    lastSeenAlbumAt: 0,
    visitedRoutes: [],
  };
}

function readFromStorage(): StickerState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<StickerState> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) {
      return defaultState();
    }
    // Sanitize unlocked list against the current roster
    const unlocked = Array.isArray(parsed.unlocked)
      ? (parsed.unlocked.filter((id): id is StickerId => typeof id === 'string' && VALID_STICKER_IDS.has(id as StickerId)))
      : [];
    const unlockedAt =
      parsed.unlockedAt && typeof parsed.unlockedAt === 'object'
        ? (parsed.unlockedAt as Record<string, number>)
        : {};
    const visitedRoutes = Array.isArray(parsed.visitedRoutes)
      ? parsed.visitedRoutes.filter((r): r is string => typeof r === 'string')
      : [];
    return {
      version: STORAGE_VERSION,
      unlocked,
      unlockedAt,
      lastEarnedAt: typeof parsed.lastEarnedAt === 'number' ? parsed.lastEarnedAt : 0,
      lastSeenAlbumAt: typeof parsed.lastSeenAlbumAt === 'number' ? parsed.lastSeenAlbumAt : 0,
      visitedRoutes,
    };
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
/**
 * Progress slice — { unlocked, total, hasUnseenSticker }. Cached on the store
 * so consumers get a stable reference across reads until one of the inputs
 * (unlocked array identity, lastEarnedAt, lastSeenAlbumAt) changes. Without
 * the cache, `useSyncExternalStore` would allocate a fresh object per read and
 * every subscriber would re-render on every store emit.
 */
export interface StickerProgress {
  readonly unlocked: number;
  readonly total: number;
  readonly hasUnseenSticker: boolean;
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
    unlocked: state.unlocked.length,
    total: STICKER_TOTAL,
    hasUnseenSticker: state.lastEarnedAt > state.lastSeenAlbumAt,
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

/**
 * Recompute the cached progress slice. Call after any mutation that could
 * affect {unlocked length, lastEarnedAt, lastSeenAlbumAt}. Keeps the previous
 * reference if all three fields produce an equal value (avoids spurious
 * re-renders when, say, a visitedRoute mutation doesn't touch progress).
 */
function recomputeProgress(): void {
  const next = computeProgress(store.state);
  const prev = store.progress;
  if (
    prev.unlocked === next.unlocked &&
    prev.total === next.total &&
    prev.hasUnseenSticker === next.hasUnseenSticker
  ) {
    return;
  }
  store.progress = next;
}

function initializeStoreOnce(): void {
  if (store.initialized || typeof window === 'undefined') return;
  store.state = readFromStorage();
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

// Cache the server snapshot at module load. React's useSyncExternalStore calls
// getServerSnapshot repeatedly and uses Object.is to detect identity changes;
// returning a fresh `defaultState()` each call would trip the "result of
// getServerSnapshot should be cached to avoid an infinite loop" warning.
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
  // Auto-dismiss after toastDuration
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
  // Schedule the next one after the configured gap
  setTimeout(scheduleNextToast, STICKER_TIMING.toastGap);
}

function enqueueToast(id: StickerId): void {
  // Cap the queue to avoid runaway rapid-fire unlocks
  if (store.toastQueue.length >= STICKER_TIMING.toastMaxInQueue) return;
  store.toastQueue.push(id);
  if (store.activeToast === null) {
    scheduleNextToast();
  }
}

// ─── Imperative mutations ───────────────────────────────────────────────
export function unlockSticker(id: StickerId): void {
  initializeStoreOnce();
  if (!VALID_STICKER_IDS.has(id)) return;
  const current = store.state;
  // Idempotency guard: if already unlocked, bail BEFORE any state swap or
  // notify. Rapid-fire emits from the bus (e.g. repeated terminal commands)
  // cannot trigger a site-wide re-render cascade.
  if (current.unlocked.includes(id)) return;
  const now = Date.now();
  const next: StickerState = {
    ...current,
    unlocked: [...current.unlocked, id],
    unlockedAt: { ...current.unlockedAt, [id]: now },
    lastEarnedAt: now,
  };
  store.state = next;
  recomputeProgress();
  writeToStorage(next);
  emitChange();
  enqueueToast(id);
}

export function markAlbumSeenImperative(): void {
  initializeStoreOnce();
  const current = store.state;
  const nextSeen = Date.now();
  // No-op if the new timestamp wouldn't change the derived hasUnseenSticker
  // flag (cheap guard against accidental double-calls).
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
  // visitedRoutes can't affect progress; skip recomputeProgress() to preserve
  // the cached reference and avoid the redundant equality check.
  writeToStorage(next);
  emitChange();
}

export function dismissActiveToast(): void {
  dismissToastInternal();
}

// ─── Narrow selector snapshots ──────────────────────────────────────────
// Each selector below returns an identity-stable slice so that React's default
// Object.is comparator inside useSyncExternalStore can skip re-renders when
// unrelated store fields mutate. The full store-change subscription is shared
// (single listener set), but the *snapshot* comparison is what gates re-render.

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
});

function getUnlockedServerSnapshot(): readonly StickerId[] {
  return EMPTY_UNLOCKED;
}

function getProgressServerSnapshot(): StickerProgress {
  return SERVER_PROGRESS;
}

// ─── Narrow public hooks ────────────────────────────────────────────────
/**
 * Subscribe to the unlocked-id array identity. Re-renders only when the array
 * reference changes — i.e. when a new sticker is unlocked. Album-seen marks,
 * toast state changes, and visitedRoute mutations do NOT trigger a re-render.
 */
export function useStickerUnlocked(): readonly StickerId[] {
  return useSyncExternalStore(subscribe, getUnlockedSnapshot, getUnlockedServerSnapshot);
}

/**
 * Subscribe to whether a single sticker is unlocked. Re-renders only when the
 * boolean flips. Ideal for per-card usage on the /stickers grid — twelve cards
 * each subscribe to their own slice instead of all sharing the wide API.
 */
export function useIsStickerUnlocked(id: StickerId): boolean {
  const getIsUnlocked = useCallback((): boolean => {
    initializeStoreOnce();
    return store.state.unlocked.includes(id);
  }, [id]);
  const getServerIsUnlocked = useCallback((): boolean => false, []);
  return useSyncExternalStore(subscribe, getIsUnlocked, getServerIsUnlocked);
}

/**
 * Subscribe to the progress triple { unlocked, total, hasUnseenSticker }. The
 * returned reference is cached on the store and only replaced when one of the
 * three values actually changes. Toast queue churn, visitedRoute mutations,
 * and unlockedAt updates that don't affect progress are all filtered out.
 */
export function useStickerProgress(): StickerProgress {
  return useSyncExternalStore(subscribe, getProgressSnapshot, getProgressServerSnapshot);
}

/**
 * Subscribe to the currently-active toast id (or null). Re-renders only when
 * the toast slot changes — sticker unlocks themselves push onto the queue but
 * don't change `activeToast` until `scheduleNextToast` promotes an item.
 */
export function useActiveStickerToast(): StickerId | null {
  return useSyncExternalStore(subscribeToast, getToastSnapshot, () => null);
}

// ─── Public hook ────────────────────────────────────────────────────────
export interface UseStickersReturn {
  unlocked: readonly StickerId[];
  unlockedAt: Readonly<Record<string, number>>;
  total: number;
  isUnlocked: (id: StickerId) => boolean;
  hasUnseenSticker: boolean;
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

  return {
    unlocked: state.unlocked,
    unlockedAt: state.unlockedAt,
    total: STICKER_TOTAL,
    isUnlocked,
    hasUnseenSticker,
    markAlbumSeen,
    visitedRoutes: state.visitedRoutes,
    addVisitedRoute,
    activeToast,
    dismissToast,
  };
}
