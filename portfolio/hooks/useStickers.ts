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
 * The single entrypoint is `useStickers()` which returns:
 *   { unlocked, total, unlockedAt, isUnlocked, hasUnseenSticker,
 *     markAlbumSeen, visitedRoutes, addVisitedRoute, activeToast, dismissToast }
 *
 * Also exposes `unlock(id)` (imperative) used from the bus listener.
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
interface StoreShape {
  state: StickerState;
  toastQueue: StickerId[];
  activeToast: StickerId | null;
  listeners: Set<() => void>;
  toastTimerId: ReturnType<typeof setTimeout> | null;
  initialized: boolean;
}

const store: StoreShape = {
  state: defaultState(),
  toastQueue: [],
  activeToast: null,
  listeners: new Set(),
  toastTimerId: null,
  initialized: false,
};

function initializeStoreOnce(): void {
  if (store.initialized || typeof window === 'undefined') return;
  store.state = readFromStorage();
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

function getServerSnapshot(): StickerState {
  return defaultState();
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
  if (current.unlocked.includes(id)) return;
  const now = Date.now();
  const next: StickerState = {
    ...current,
    unlocked: [...current.unlocked, id],
    unlockedAt: { ...current.unlockedAt, [id]: now },
    lastEarnedAt: now,
  };
  store.state = next;
  writeToStorage(next);
  emitChange();
  enqueueToast(id);
}

export function markAlbumSeenImperative(): void {
  initializeStoreOnce();
  const current = store.state;
  const next: StickerState = { ...current, lastSeenAlbumAt: Date.now() };
  store.state = next;
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

export function dismissActiveToast(): void {
  dismissToastInternal();
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
