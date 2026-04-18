/**
 * Store-level tests — exercise the parser/migration + the superuser
 * auto-award path via the imperative unlockSticker API.
 *
 * Vitest runs in a node environment by default. We install a minimal
 * localStorage shim onto `globalThis` before importing the store so the module
 * sees a working storage backend.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Install window + localStorage shim for the store module. ─────────────
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const memoryStorage = new MemoryStorage();

const windowShim = {
  localStorage: memoryStorage,
  // The store only calls setItem/getItem on window.localStorage — we don't
  // need to mirror the full window surface.
};

// Install BEFORE importing the store.
Object.defineProperty(globalThis, 'window', {
  value: windowShim,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

// Dynamic import so the shim is in place when the module initializes.
async function loadStore() {
  const mod = await import('@/hooks/useStickers');
  return mod;
}

describe('parseStoredState migration', () => {
  beforeEach(() => {
    memoryStorage.clear();
  });

  it('empty storage yields defaultState', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const state = parseStoredState(null);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.unlocked).toEqual([]);
    expect(state.terminalCommands).toEqual([]);
    expect(state.openedProjects).toEqual([]);
    expect(state.discoActive).toBe(false);
  });

  it('malformed JSON yields defaultState (graceful)', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const state = parseStoredState('{not:json');
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.unlocked).toEqual([]);
  });

  it('migrates a v1 blob to current preserving unlocked + visitedRoutes', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const v1 = JSON.stringify({
      version: 1,
      unlocked: ['first-word', 'theme-flipper'],
      unlockedAt: { 'first-word': 1, 'theme-flipper': 2 },
      lastEarnedAt: 2,
      lastSeenAlbumAt: 1,
      visitedRoutes: ['/', '/projects'],
    });
    const state = parseStoredState(v1);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.unlocked).toContain('first-word');
    expect(state.unlocked).toContain('theme-flipper');
    expect(state.visitedRoutes).toEqual(['/', '/projects']);
    // Post-v1 fields default to empty.
    expect(state.terminalCommands).toEqual([]);
    expect(state.openedProjects).toEqual([]);
    expect(state.discoActive).toBe(false);
  });

  it('migrates a v2 blob to v3, preserving progress but forcing discoActive=false', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    // Pre-v3 clients could persist `discoActive: true`. v3 must strip it so
    // every page load begins with disco off — while KEEPING the superuser
    // sticker (which lives in `unlocked`) so `sudo disco` still works.
    const v2 = JSON.stringify({
      version: 2,
      unlocked: ['first-word', 'superuser'],
      unlockedAt: { 'first-word': 1, superuser: 2 },
      lastEarnedAt: 2,
      lastSeenAlbumAt: 1,
      visitedRoutes: ['/'],
      terminalCommands: ['help', 'about'],
      openedProjects: ['cropio'],
      discoActive: true, // <-- this MUST become false after parse
      discoMuted: true, // <-- this MUST stay true (preference)
    });
    const state = parseStoredState(v2);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.unlocked).toContain('superuser');
    expect(state.discoActive).toBe(false);
    expect(state.discoMuted).toBe(true);
    expect(state.terminalCommands).toEqual(['help', 'about']);
    expect(state.openedProjects).toEqual(['cropio']);
  });

  it('forces discoActive=false even for current-version blobs (stale flag cleanup)', async () => {
    // Defensive: even if a bad deploy at the current version somehow wrote
    // discoActive:true (e.g., a developer running a pre-fix build locally),
    // parseStoredState must scrub it on read.
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const blob = JSON.stringify({
      version: STORAGE_VERSION,
      unlocked: ['first-word'],
      unlockedAt: { 'first-word': 1 },
      lastEarnedAt: 1,
      lastSeenAlbumAt: 0,
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      discoActive: true, // stale — must be wiped
      discoMuted: false,
    });
    const state = parseStoredState(blob);
    expect(state.discoActive).toBe(false);
    expect(state.unlocked).toContain('first-word'); // progress retained
  });

  it('rejects unknown sticker ids during migration (defensive)', async () => {
    const { parseStoredState } = await loadStore();
    const v1 = JSON.stringify({
      version: 1,
      unlocked: ['first-word', 'made-up-sticker'],
      unlockedAt: { 'first-word': 1, 'made-up-sticker': 2 },
      lastEarnedAt: 2,
      lastSeenAlbumAt: 1,
      visitedRoutes: [],
    });
    const state = parseStoredState(v1);
    expect(state.unlocked).toContain('first-word');
    expect(state.unlocked).not.toContain('made-up-sticker');
  });

  it('migrates a v3 blob to v4, initializing new sound + banner fields to defaults', async () => {
    // v3 did not have `soundsMuted` or `superuserRevealedAt`. Users coming
    // from a pre-v4 install MUST land on defaults: soundsMuted=false (audio
    // on by default) and superuserRevealedAt=0 (so if they ALREADY earned
    // the superuser sticker before v4 shipped, the banner will play its
    // fanfare on first post-upgrade load — which is the intended UX).
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const v3 = JSON.stringify({
      version: 3,
      unlocked: ['first-word', 'superuser'],
      unlockedAt: { 'first-word': 1000, superuser: 2000 },
      lastEarnedAt: 2000,
      lastSeenAlbumAt: 1500,
      visitedRoutes: ['/'],
      terminalCommands: ['help'],
      openedProjects: [],
      discoMuted: true,
    });
    const state = parseStoredState(v3);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.version).toBe(4);
    expect(state.unlocked).toContain('superuser');
    expect(state.discoMuted).toBe(true); // preserved
    // New v4 defaults.
    expect(state.soundsMuted).toBe(false);
    expect(state.superuserRevealedAt).toBe(0);
    // Earned timestamp preserved — banner reveal trigger fires because
    // unlockedAt.superuser (2000) > superuserRevealedAt (0).
    expect(state.unlockedAt['superuser']).toBe(2000);
  });

  it('preserves soundsMuted and superuserRevealedAt when already v4', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const v4 = JSON.stringify({
      version: 4,
      unlocked: ['superuser'],
      unlockedAt: { superuser: 5000 },
      lastEarnedAt: 5000,
      lastSeenAlbumAt: 4000,
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      discoMuted: false,
      soundsMuted: true,
      superuserRevealedAt: 5000,
    });
    const state = parseStoredState(v4);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.soundsMuted).toBe(true);
    expect(state.superuserRevealedAt).toBe(5000);
  });
});

describe('unlockSticker superuser auto-award', () => {
  beforeEach(async () => {
    memoryStorage.clear();
    const mod = await loadStore();
    mod.__resetStoreForTest();
  });

  it('does NOT award superuser before every regular sticker is earned', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const { unlockSticker, isSuperuserEarnedSync } = await loadStore();
    // Unlock everything EXCEPT the last one.
    for (let i = 0; i < STICKER_ROSTER.length - 1; i++) {
      unlockSticker(STICKER_ROSTER[i].id);
    }
    expect(isSuperuserEarnedSync()).toBe(false);
  });

  it('awards superuser atomically when the last regular sticker is unlocked', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const { unlockSticker, isSuperuserEarnedSync } = await loadStore();
    for (const sticker of STICKER_ROSTER) {
      unlockSticker(sticker.id);
    }
    expect(isSuperuserEarnedSync()).toBe(true);
  });

  it('is idempotent — unlocking an already-unlocked sticker is a no-op', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const { unlockSticker, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    unlockSticker('first-word');
    unlockSticker('first-word');
    // Store still only has one entry.
    const raw = memoryStorage.getItem('dhruv-stickers');
    const parsed = raw ? JSON.parse(raw) : null;
    const firstWordMatches = (parsed?.unlocked as string[]).filter((id) => id === 'first-word');
    expect(firstWordMatches.length).toBe(1);
    // Complete the rest; superuser should still award once.
    for (const sticker of STICKER_ROSTER) {
      unlockSticker(sticker.id);
    }
    const final = JSON.parse(memoryStorage.getItem('dhruv-stickers') as string);
    const superuserMatches = (final.unlocked as string[]).filter((id) => id === 'superuser');
    expect(superuserMatches.length).toBe(1);
  });

  it('tracks distinct terminal commands', async () => {
    const { recordTerminalCommandImperative, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    expect(recordTerminalCommandImperative('help')).toBe(1);
    // Idempotent on duplicate.
    expect(recordTerminalCommandImperative('help')).toBe(1);
    expect(recordTerminalCommandImperative('About')).toBe(2); // normalized
    expect(recordTerminalCommandImperative('joke')).toBe(3);
    expect(recordTerminalCommandImperative('ls')).toBe(4);
    expect(recordTerminalCommandImperative('clear')).toBe(5);
  });

  it('tracks distinct opened projects', async () => {
    const { recordOpenedProjectImperative, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    expect(recordOpenedProjectImperative('cropio')).toBe(1);
    expect(recordOpenedProjectImperative('cropio')).toBe(1);
    expect(recordOpenedProjectImperative('atomvault')).toBe(2);
  });

  it('disco active flag toggles in-memory but is NEVER persisted', async () => {
    // v3 contract: discoActive is session-only. The runtime flag flips, but
    // localStorage never stores it — every reload starts with disco off.
    const { setDiscoActiveImperative, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    setDiscoActiveImperative(true);
    const raw = memoryStorage.getItem('dhruv-stickers');
    // Storage should be empty or, if a previous mutation wrote a blob, the
    // blob must not contain a discoActive key at all.
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.discoActive).toBeUndefined();
    }
  });

  it('any write (e.g. mute pref) strips discoActive from the serialized blob', async () => {
    // Defense-in-depth: even when the in-memory state has discoActive=true,
    // writeToStorage must not serialize it. This guards against a future
    // regression where someone reintroduces direct persistence.
    const { setDiscoActiveImperative, setDiscoMutedImperative, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    setDiscoActiveImperative(true);
    setDiscoMutedImperative(true); // forces a write
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.discoActive).toBeUndefined();
    expect(parsed.discoMuted).toBe(true);
  });

  it('reload-simulation: discoActive never leaks back into state after parseStoredState', async () => {
    // End-to-end: flip disco on, unlock superuser, write, then simulate a
    // reload by reparsing the blob. Superuser MUST persist, discoActive MUST
    // reset to false.
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      setDiscoActiveImperative,
      unlockSticker,
      parseStoredState,
      __resetStoreForTest,
    } = await loadStore();
    __resetStoreForTest();
    // Earn superuser by unlocking everything.
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    setDiscoActiveImperative(true);
    // Simulate reload by reparsing the persisted blob.
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    const rehydrated = parseStoredState(raw);
    expect(rehydrated.unlocked).toContain('superuser');
    expect(rehydrated.discoActive).toBe(false);
  });

  it('disco muted flag toggles and persists across reload', async () => {
    const { setDiscoMutedImperative, __resetStoreForTest, parseStoredState } = await loadStore();
    __resetStoreForTest();
    // Default is unmuted — storage is empty until the first mutation.
    // Flip to true to force a write, then verify persistence.
    setDiscoMutedImperative(true);
    const raw = memoryStorage.getItem('dhruv-stickers');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).discoMuted).toBe(true);
    // Re-parse the persisted blob — simulating a reload.
    const reloaded = parseStoredState(raw);
    expect(reloaded.discoMuted).toBe(true);
    // Flip back to false — must persist as false rather than be wiped.
    setDiscoMutedImperative(false);
    expect(JSON.parse(memoryStorage.getItem('dhruv-stickers') as string).discoMuted).toBe(false);
  });

  it('resetStickerProgressImperative wipes everything', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const { unlockSticker, resetStickerProgressImperative, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    for (const sticker of STICKER_ROSTER) {
      unlockSticker(sticker.id);
    }
    resetStickerProgressImperative();
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    expect(JSON.parse(raw).unlocked).toEqual([]);
  });

  // ─── v4 additions ────────────────────────────────────────────────

  it('soundsMuted toggles and persists across reload', async () => {
    const { setSoundsMutedImperative, __resetStoreForTest, parseStoredState } = await loadStore();
    __resetStoreForTest();
    setSoundsMutedImperative(true);
    const raw = memoryStorage.getItem('dhruv-stickers');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).soundsMuted).toBe(true);
    const reloaded = parseStoredState(raw);
    expect(reloaded.soundsMuted).toBe(true);
    // Toggle back.
    setSoundsMutedImperative(false);
    expect(JSON.parse(memoryStorage.getItem('dhruv-stickers') as string).soundsMuted).toBe(false);
  });

  it('superuserRevealedAt advances only forward (monotonic)', async () => {
    const { setSuperuserRevealedAtImperative, __resetStoreForTest, getSuperuserRevealedAtSync } = await loadStore();
    __resetStoreForTest();
    expect(getSuperuserRevealedAtSync()).toBe(0);
    setSuperuserRevealedAtImperative(1000);
    expect(getSuperuserRevealedAtSync()).toBe(1000);
    // An older timestamp must not overwrite a newer one — the banner can
    // only fire forward in time.
    setSuperuserRevealedAtImperative(500);
    expect(getSuperuserRevealedAtSync()).toBe(1000);
    // A newer timestamp is accepted.
    setSuperuserRevealedAtImperative(2500);
    expect(getSuperuserRevealedAtSync()).toBe(2500);
  });

  it('superuserRevealedAt persists and rehydrates on reload', async () => {
    const { setSuperuserRevealedAtImperative, parseStoredState, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    setSuperuserRevealedAtImperative(9999);
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    const reloaded = parseStoredState(raw);
    expect(reloaded.superuserRevealedAt).toBe(9999);
  });
});

describe('sudo gating gate', () => {
  beforeEach(async () => {
    memoryStorage.clear();
    const mod = await loadStore();
    mod.__resetStoreForTest();
  });

  it('isSuperuserEarnedSync is false before any stickers', async () => {
    const { isSuperuserEarnedSync, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    expect(isSuperuserEarnedSync()).toBe(false);
  });

  it('is true once every regular sticker is earned', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const { unlockSticker, isSuperuserEarnedSync, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    expect(isSuperuserEarnedSync()).toBe(true);
  });

  it('remains true across a reset that was then re-earned (state reflects current)', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      unlockSticker,
      isSuperuserEarnedSync,
      resetStickerProgressImperative,
      __resetStoreForTest,
    } = await loadStore();
    __resetStoreForTest();
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    expect(isSuperuserEarnedSync()).toBe(true);
    resetStickerProgressImperative();
    expect(isSuperuserEarnedSync()).toBe(false);
  });
});
