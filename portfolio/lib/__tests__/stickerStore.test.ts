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
    expect(state.matrixActive).toBe(false);
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

  it('migrates a v2 blob to current, preserving progress but forcing discoActive=false and dropping discoMuted', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    // Pre-v3 clients could persist `discoActive: true`. v3+ must strip it so
    // every page load begins with disco off — while KEEPING the superuser
    // sticker (which lives in `unlocked`) so `sudo disco` still works.
    // v5 additionally drops the `discoMuted` preference — sitewide
    // `soundsMuted` now governs the disco loop.
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
      discoMuted: true, // <-- this MUST be dropped at v5
    });
    const state = parseStoredState(v2);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.unlocked).toContain('superuser');
    expect(state.discoActive).toBe(false);
    expect(state.terminalCommands).toEqual(['help', 'about']);
    expect(state.openedProjects).toEqual(['cropio']);
    // v5 contract — the `discoMuted` property no longer exists on the state
    // shape, and there is no `useDiscoMuted` / `setDiscoMutedImperative`
    // export. The sitewide `soundsMuted` default of `false` is what we get.
    expect((state as unknown as Record<string, unknown>).discoMuted).toBeUndefined();
    expect(state.soundsMuted).toBe(false);
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

  it('migrates a v3 blob to current, initializing new sound + banner fields to defaults and dropping discoMuted', async () => {
    // v3 did not have `soundsMuted` or `superuserRevealedAt`. Users coming
    // from a pre-v4 install MUST land on defaults: soundsMuted=false (audio
    // on by default) and superuserRevealedAt=0 (so if they ALREADY earned
    // the superuser sticker before v4 shipped, the banner will play its
    // fanfare on first post-upgrade load — which is the intended UX).
    // v5 additionally drops the pre-existing `discoMuted` preference; the
    // sitewide sound toggle now governs the disco loop.
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
    expect(state.version).toBe(6);
    expect(state.unlocked).toContain('superuser');
    expect((state as unknown as Record<string, unknown>).discoMuted).toBeUndefined();
    // New v4 defaults carried into v5/v6.
    expect(state.soundsMuted).toBe(false);
    expect(state.superuserRevealedAt).toBe(0);
    // v6 new field defaults to false.
    expect(state.matrixActive).toBe(false);
    // Earned timestamp preserved — banner reveal trigger fires because
    // unlockedAt.superuser (2000) > superuserRevealedAt (0).
    expect(state.unlockedAt['superuser']).toBe(2000);
  });

  it('migrates a v4 blob to v6, preserving soundsMuted/superuserRevealedAt but dropping discoMuted', async () => {
    // The v4 → v5 migration is the consolidation of two mute controls into
    // one. The user's sitewide `soundsMuted` choice is carried forward
    // verbatim; `discoMuted` is removed without touching the global mute
    // — this avoids forcibly muting someone who only wanted disco quiet but
    // also avoids forcibly unmuting them. The global preference wins.
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
      discoMuted: true, // <-- dropped at v5
      soundsMuted: true,
      superuserRevealedAt: 5000,
    });
    const state = parseStoredState(v4);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.version).toBe(6);
    expect(state.soundsMuted).toBe(true);
    expect(state.superuserRevealedAt).toBe(5000);
    // v6 new field defaults to false even when migrating from older versions.
    expect(state.matrixActive).toBe(false);
    // The legacy discoMuted key is gone.
    expect((state as unknown as Record<string, unknown>).discoMuted).toBeUndefined();
  });

  it('preserves soundsMuted and superuserRevealedAt when already v6', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const v6 = JSON.stringify({
      version: 6,
      unlocked: ['superuser'],
      unlockedAt: { superuser: 5000 },
      lastEarnedAt: 5000,
      lastSeenAlbumAt: 4000,
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      soundsMuted: true,
      superuserRevealedAt: 5000,
      matrixActive: true,
    });
    const state = parseStoredState(v6);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.soundsMuted).toBe(true);
    expect(state.superuserRevealedAt).toBe(5000);
    // v6 — matrix state persists across reloads (unlike disco).
    expect(state.matrixActive).toBe(true);
    expect((state as unknown as Record<string, unknown>).discoMuted).toBeUndefined();
  });

  it('migrates a v5 blob to v6, defaulting matrixActive to false', async () => {
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const v5 = JSON.stringify({
      version: 5,
      unlocked: ['superuser'],
      unlockedAt: { superuser: 5000 },
      lastEarnedAt: 5000,
      lastSeenAlbumAt: 4000,
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      soundsMuted: true,
      superuserRevealedAt: 5000,
    });
    const state = parseStoredState(v5);
    expect(state.version).toBe(STORAGE_VERSION);
    expect(state.version).toBe(6);
    // Existing preferences preserved.
    expect(state.soundsMuted).toBe(true);
    expect(state.superuserRevealedAt).toBe(5000);
    // v6 new field defaults.
    expect(state.matrixActive).toBe(false);
  });

  it('drops dead sticker ids (konami) on migration without losing other progress', async () => {
    // Konami was retired in v6 because its emit path had no mobile-reachable
    // trigger. Any persisted `konami` entry should be stripped from both
    // `unlocked` and `unlockedAt` during migration, while the rest of the
    // user's progress (including superuser, which was earned on the old
    // 19-sticker roster) stays intact.
    const { parseStoredState, STORAGE_VERSION } = await loadStore();
    const v4 = JSON.stringify({
      version: 4,
      unlocked: ['first-word', 'konami', 'theme-flipper', 'superuser'],
      unlockedAt: { 'first-word': 1, konami: 2, 'theme-flipper': 3, superuser: 4 },
      lastEarnedAt: 4,
      lastSeenAlbumAt: 1,
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      soundsMuted: false,
      superuserRevealedAt: 0,
    });
    const state = parseStoredState(v4);
    expect(state.version).toBe(STORAGE_VERSION);
    // Dead id dropped from both arrays.
    expect(state.unlocked).not.toContain('konami');
    expect(state.unlockedAt['konami']).toBeUndefined();
    // Other ids preserved.
    expect(state.unlocked).toContain('first-word');
    expect(state.unlocked).toContain('theme-flipper');
    expect(state.unlocked).toContain('superuser');
    expect(state.unlockedAt['first-word']).toBe(1);
    expect(state.unlockedAt['superuser']).toBe(4);
  });

  it('matrixActive persists across reload (unlike discoActive)', async () => {
    const {
      setMatrixActiveImperative,
      parseStoredState,
      getMatrixActiveSync,
      __resetStoreForTest,
    } = await loadStore();
    __resetStoreForTest();
    memoryStorage.clear();
    setMatrixActiveImperative(true);
    expect(getMatrixActiveSync()).toBe(true);
    // Round-trip the persisted blob — matrixActive should come back as true
    // even though discoActive would come back as false.
    const raw = memoryStorage.getItem('dhruv-stickers');
    expect(raw).not.toBeNull();
    const reloaded = parseStoredState(raw as string);
    expect(reloaded.matrixActive).toBe(true);
    expect(reloaded.discoActive).toBe(false);
  });

  it('setMatrixActiveImperative(false) clears the persisted flag', async () => {
    const { setMatrixActiveImperative, parseStoredState, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    memoryStorage.clear();
    setMatrixActiveImperative(true);
    setMatrixActiveImperative(false);
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    const reloaded = parseStoredState(raw);
    expect(reloaded.matrixActive).toBe(false);
  });

  it('any persisted write strips a lingering discoMuted even when other state mutates', async () => {
    // End-to-end check: write a v4 blob (with discoMuted) directly, force
    // a state mutation via the imperative API, and confirm the resulting
    // serialized blob contains neither `discoMuted` nor `discoActive`.
    const { __resetStoreForTest, setSoundsMutedImperative, STORAGE_VERSION } = await loadStore();
    __resetStoreForTest();
    memoryStorage.setItem(
      'dhruv-stickers',
      JSON.stringify({
        version: 4,
        unlocked: [],
        unlockedAt: {},
        lastEarnedAt: 0,
        lastSeenAlbumAt: 0,
        visitedRoutes: [],
        terminalCommands: [],
        openedProjects: [],
        discoMuted: true,
        soundsMuted: false,
        superuserRevealedAt: 0,
      }),
    );
    // Force a write by flipping soundsMuted (which triggers writeToStorage).
    setSoundsMutedImperative(true);
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.discoMuted).toBeUndefined();
    expect(parsed.discoActive).toBeUndefined();
    expect(parsed.version).toBe(STORAGE_VERSION);
    expect(parsed.soundsMuted).toBe(true);
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
    // Post-v5: uses `setSoundsMutedImperative` to force the write since the
    // old `setDiscoMutedImperative` was removed when the two mutes merged.
    const { setDiscoActiveImperative, setSoundsMutedImperative, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    setDiscoActiveImperative(true);
    setSoundsMutedImperative(true); // forces a write
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.discoActive).toBeUndefined();
    expect(parsed.soundsMuted).toBe(true);
    // Legacy discoMuted must never reappear in a fresh write.
    expect(parsed.discoMuted).toBeUndefined();
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

  it('post-v5: setDiscoMutedImperative and useDiscoMuted are removed exports', async () => {
    // The v4 → v5 consolidation removed both the imperative setter and the
    // reactive hook. Any legacy caller should route through
    // setSoundsMutedImperative / useSoundsMuted instead.
    const mod = (await loadStore()) as unknown as Record<string, unknown>;
    expect(mod.setDiscoMutedImperative).toBeUndefined();
    expect(mod.useDiscoMuted).toBeUndefined();
    // The sitewide ones remain.
    expect(typeof mod.setSoundsMutedImperative).toBe('function');
    expect(typeof mod.useSoundsMuted).toBe('function');
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
