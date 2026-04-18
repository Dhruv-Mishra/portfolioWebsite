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
/**
 * v6 — added persisted `matrixActive` boolean. UNLIKE `discoActive` (which
 *      resets on every reload — session-only UX), the matrix effect is a
 *      "Morpheus trap": it persists across navigation AND reloads, so the
 *      user can only escape by clicking the in-overlay WAKE UP button. A
 *      legacy migration drops the dead `konami` sticker id if present.
 *      New field defaults to `false`; existing progress is untouched.
 * v5 — collapsed the disco-specific mute (`discoMuted`) into the sitewide
 *      `soundsMuted` preference. One toggle now governs every sound the site
 *      can make, including the disco loop. The per-loop `setLoopMuted` API
 *      is retained as an internal plumbing primitive, but the store no
 *      longer tracks a disco-only mute flag. Migration from v4: the
 *      `discoMuted` field is dropped during parse/write; the user's last
 *      `soundsMuted` choice continues to apply, and disco audio honors it.
 * v4 — added sitewide sound preferences (`soundsMuted`) and a
 *      `superuserRevealedAt` timestamp used by SuperuserBanner to gate the
 *      one-shot fanfare/confetti reveal. Both fields are sticky preferences
 *      that survive reloads.
 * v3 — `discoActive` is no longer persisted. Each page load begins with disco
 *      OFF regardless of what the previous session ended in; users must opt
 *      back in via `sudo disco` (which still requires superuser, which DOES
 *      persist via the `unlocked` array).
 * v2 — added superuser tracking, unique terminal command set, opened-project
 *      set, sudo/disco flags.
 */
export const STORAGE_VERSION = 6 as const;

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
  /**
   * Runtime-only disco flag. NOT persisted — every page load begins with disco
   * OFF. The field lives on the in-memory state so selectors can subscribe to
   * it, but `writeToStorage` strips it before serialization and
   * `parseStoredState` forces it to `false` on read. Superuser access itself is
   * preserved through the `unlocked` array, so `sudo disco` still works.
   */
  discoActive: boolean;
  /**
   * Persisted global sound-effects mute preference. Sticky. v4+. In v5 this
   * preference also governs the disco loop — there is no longer a separate
   * disco-only mute flag.
   */
  soundsMuted: boolean;
  /**
   * Timestamp of the LAST time SuperuserBanner played its reveal fanfare.
   * When `unlockedAt.superuser > superuserRevealedAt`, the banner will play
   * the fanfare + confetti on mount and then write back the current
   * `unlockedAt.superuser`. Guarantees the full celebration fires once,
   * future album visits show the quieter persistent banner. v4+.
   */
  superuserRevealedAt: number;
  /**
   * Persisted matrix-effect active flag. v6+. UNLIKE `discoActive`, this
   * DOES survive page reloads — the matrix overlay is intentionally a
   * persistent trap. The only way out is clicking the in-overlay WAKE UP
   * button (which clears this flag). Navigation, ESC, and any other keys
   * are ignored. Existing v1–v5 migrations default this to `false`.
   */
  matrixActive: boolean;
}

// Valid sticker ID set — regulars + superuser.
const VALID_STICKER_IDS: ReadonlySet<StickerId> = new Set<StickerId>([
  ...STICKER_ROSTER.map((s) => s.id),
  SUPERUSER_STICKER.id,
]);

/**
 * Dead sticker ids dropped on migration. When a sticker is retired from the
 * roster (e.g. konami in v6), its id may still be persisted in old blobs.
 * These ids are scrubbed from `unlocked` on load so the superuser
 * auto-award predicate doesn't get confused and so the album doesn't try
 * to render a missing SVG.
 */
const DEAD_STICKER_IDS: ReadonlySet<string> = new Set<string>(['konami']);

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
    soundsMuted: false,
    superuserRevealedAt: 0,
    matrixActive: false,
  };
}

/**
 * Sanitize an arbitrary parsed blob into a clean current-version StickerState.
 * Handles every historical version (v1 → v6). Shape details per version:
 *
 *   - v1/v2 blobs may carry a `discoActive: true` that pre-v3 builds wrote;
 *     it is unconditionally scrubbed.
 *   - v2/v3/v4 blobs may carry a `discoMuted` boolean — DROPPED in v5. The
 *     sitewide `soundsMuted` preference now governs the disco loop too.
 *   - v1–v5 blobs may include a persisted `konami` sticker id. Dropped in
 *     v6 (roster retirement). The rest of the `unlocked` array is kept
 *     so the superuser auto-award predicate still works correctly on the
 *     reduced 18-sticker roster.
 *   - v3+ adds terminalCommands / openedProjects, v4+ adds soundsMuted /
 *     superuserRevealedAt, v6+ adds matrixActive. Missing fields default
 *     to empty/false/0.
 *
 * Invariants that hold regardless of input version:
 *   - Every array is filtered to only contain strings (or valid StickerIds for
 *     `unlocked`). Corrupt entries are silently dropped rather than crashing.
 *   - Dead sticker ids (`konami`) are stripped from `unlocked` AND from
 *     `unlockedAt` to keep the two maps in sync.
 *   - `discoActive` is ALWAYS forced to `false`. Disco never survives a page
 *     reload — it's a session-only flag.
 *   - `matrixActive` DOES survive reloads (it's a persistent trap) — this is
 *     an intentional asymmetry with disco.
 *   - `soundsMuted` preserves the user's last mute choice across migrations.
 */
function migrateToCurrent(parsed: Record<string, unknown>): StickerState {
  const rawUnlocked = Array.isArray(parsed.unlocked)
    ? parsed.unlocked.filter((id): id is string => typeof id === 'string')
    : [];
  // Drop dead ids (`konami`) AND anything not in the current valid set.
  const unlocked = rawUnlocked.filter(
    (id): id is StickerId =>
      !DEAD_STICKER_IDS.has(id) && VALID_STICKER_IDS.has(id as StickerId),
  );
  // Keep unlockedAt in sync with the filtered unlocked list — drop dead-id
  // timestamps so they can't leak through. Passing through unknown keys is
  // fine; only `unlocked` drives rendering.
  const rawUnlockedAt =
    parsed.unlockedAt && typeof parsed.unlockedAt === 'object'
      ? (parsed.unlockedAt as Record<string, number>)
      : {};
  const unlockedAt: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawUnlockedAt)) {
    if (DEAD_STICKER_IDS.has(key)) continue;
    if (typeof value === 'number') unlockedAt[key] = value;
  }
  const visitedRoutes = Array.isArray(parsed.visitedRoutes)
    ? (parsed.visitedRoutes as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];
  const terminalCommands = Array.isArray(parsed.terminalCommands)
    ? (parsed.terminalCommands as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const openedProjects = Array.isArray(parsed.openedProjects)
    ? (parsed.openedProjects as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  return {
    version: STORAGE_VERSION,
    unlocked,
    unlockedAt,
    lastEarnedAt: typeof parsed.lastEarnedAt === 'number' ? parsed.lastEarnedAt : 0,
    lastSeenAlbumAt: typeof parsed.lastSeenAlbumAt === 'number' ? parsed.lastSeenAlbumAt : 0,
    visitedRoutes,
    terminalCommands,
    openedProjects,
    /** Always false on load — discoActive is session-only, never persisted. */
    discoActive: false,
    /** v4 preference — default OFF (sounds enabled). Governs disco loop in v5+. */
    soundsMuted: parsed.soundsMuted === true,
    /** v4 — last time SuperuserBanner fired the reveal. 0 for fresh migrations. */
    superuserRevealedAt: typeof parsed.superuserRevealedAt === 'number' ? parsed.superuserRevealedAt : 0,
    /** v6 — persisted matrix overlay state. Defaults to false for v1–v5 blobs. */
    matrixActive: parsed.matrixActive === true,
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

  // All version branches route through migrateToCurrent, which guarantees:
  //   - discoActive is ALWAYS false on load (disco never survives a reload).
  //   - The latest schema shape is produced (version === STORAGE_VERSION).
  //   - Unknown/future versions still preserve the unlocked array (defensive),
  //     so progress survives a bad deploy.
  //
  // Even if the persisted blob is already at the current version, we re-run
  // sanitization to strip any stale discoActive / discoMuted fields written
  // by older code paths (pre-v3 wrote discoActive, pre-v5 wrote discoMuted).
  const version = obj.version;
  if (
    version === 1 ||
    version === 2 ||
    version === 3 ||
    version === 4 ||
    version === 5 ||
    version === STORAGE_VERSION
  ) {
    return migrateToCurrent(obj);
  }
  // Unknown/future — preserve unlocked if shape looks salvageable, else wipe.
  if (Array.isArray(obj.unlocked)) {
    return migrateToCurrent(obj);
  }
  return defaultState();
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
    // Strip `discoActive` from the persisted shape. This is belt-and-suspenders
    // alongside the forced `discoActive: false` in parseStoredState: even if a
    // stale build previously wrote `discoActive: true`, it won't come back on
    // reload, and we never write it forward either.
    //
    // Note: `discoMuted` was removed in v5. The StickerState interface no
    // longer carries it, so it cannot be written by this path — but we still
    // strip any lingering occurrence from the initializeStoreOnce migration
    // write below, which feeds a legacy blob through this function.
    //
    // `matrixActive` IS persisted (v6+) — unlike disco, the matrix overlay
    // is intentionally a "Morpheus trap" that survives reloads and can only
    // be dismissed via the in-overlay WAKE UP button.
    const { discoActive: _unused, ...persistable } = state;
    void _unused;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
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
  // If the persisted blob was a v1–v5 schema (or otherwise mutated by
  // migration) OR contains a stale `discoActive: true` from pre-v3 builds,
  // OR still carries the pre-v5 `discoMuted` preference, OR carries a dead
  // `konami` sticker id from pre-v6, proactively rewrite once at
  // initialization so subsequent reads are fast and version-stable.
  // Only do this if we actually have data to write — avoid polluting storage
  // for fresh visitors.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const isOutdatedVersion = !parsed || parsed.version !== STORAGE_VERSION;
      const hasStaleDiscoFlag = parsed && parsed.discoActive !== undefined;
      const hasLegacyDiscoMuted = parsed && parsed.discoMuted !== undefined;
      const hasLegacyKonami =
        parsed &&
        Array.isArray(parsed.unlocked) &&
        (parsed.unlocked as unknown[]).includes('konami');
      if (
        isOutdatedVersion ||
        hasStaleDiscoFlag ||
        hasLegacyDiscoMuted ||
        hasLegacyKonami
      ) {
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

/**
 * Explicit setter for the matrix flag — used by `sudo matrix yes` to engage
 * the persistent matrix overlay, and by the in-overlay WAKE UP button to
 * tear it down. Unlike `setDiscoActiveImperative`, this flag IS persisted
 * across reloads.
 */
export function setMatrixActiveImperative(active: boolean): void {
  initializeStoreOnce();
  const current = store.state;
  if (current.matrixActive === active) return;
  const next: StickerState = { ...current, matrixActive: active };
  store.state = next;
  writeToStorage(next);
  emitChange();
}

/** Persist the user's mute preference for sitewide sound effects (v4+). */
export function setSoundsMutedImperative(muted: boolean): void {
  initializeStoreOnce();
  const current = store.state;
  if (current.soundsMuted === muted) return;
  const next: StickerState = { ...current, soundsMuted: muted };
  store.state = next;
  writeToStorage(next);
  emitChange();
}

/**
 * Record that the superuser banner has played its reveal fanfare. Caller
 * passes the current `unlockedAt.superuser` value so subsequent mounts can
 * compare timestamps and avoid replaying the fanfare.
 */
export function setSuperuserRevealedAtImperative(revealedAt: number): void {
  initializeStoreOnce();
  const current = store.state;
  if (current.superuserRevealedAt >= revealedAt) return;
  const next: StickerState = { ...current, superuserRevealedAt: revealedAt };
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

function getMatrixSnapshot(): boolean {
  initializeStoreOnce();
  return store.state.matrixActive;
}

function getMatrixServerSnapshot(): boolean {
  return false;
}

/** Subscribe to the persisted matrix-overlay active flag (v6+). */
export function useMatrixActive(): boolean {
  return useSyncExternalStore(subscribe, getMatrixSnapshot, getMatrixServerSnapshot);
}

/**
 * Synchronous read of the persisted matrix-active flag. Used by the
 * AssetPrefetch controller to detect matrix on first mount.
 */
export function getMatrixActiveSync(): boolean {
  initializeStoreOnce();
  return store.state.matrixActive;
}

function getSoundsMutedSnapshot(): boolean {
  initializeStoreOnce();
  return store.state.soundsMuted;
}

function getSoundsMutedServerSnapshot(): boolean {
  return false;
}

/** Subscribe to the sitewide sound-effects mute preference (v4+). */
export function useSoundsMuted(): boolean {
  return useSyncExternalStore(subscribe, getSoundsMutedSnapshot, getSoundsMutedServerSnapshot);
}

function getSuperuserRevealedAtSnapshot(): number {
  initializeStoreOnce();
  return store.state.superuserRevealedAt;
}

function getSuperuserRevealedAtServerSnapshot(): number {
  return 0;
}

/** Subscribe to the SuperuserBanner reveal timestamp (v4+). */
export function useSuperuserRevealedAt(): number {
  return useSyncExternalStore(
    subscribe,
    getSuperuserRevealedAtSnapshot,
    getSuperuserRevealedAtServerSnapshot,
  );
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

/**
 * Synchronous read of the sounds-muted preference. Used by the visibility
 * listener in `hooks/useSounds.ts` to restore the manager's mute state when
 * the tab becomes visible again (no React subscription available there).
 */
export function getSoundsMutedSync(): boolean {
  initializeStoreOnce();
  return store.state.soundsMuted;
}

/**
 * Synchronous read of the superuser reveal timestamp. Used by banner effects
 * that need to compare against `unlockedAt.superuser` outside a render.
 */
export function getSuperuserRevealedAtSync(): number {
  initializeStoreOnce();
  return store.state.superuserRevealedAt;
}

/**
 * Synchronous read of the `unlockedAt.superuser` timestamp. Returns 0 if
 * the superuser sticker has not been earned. Used by the sitewide reveal
 * toast controller to compare against `superuserRevealedAt` without having
 * to subscribe to the full state snapshot.
 */
export function getSuperuserEarnedAtSync(): number {
  initializeStoreOnce();
  const ts = store.state.unlockedAt[SUPERUSER_STICKER.id];
  return typeof ts === 'number' ? ts : 0;
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
