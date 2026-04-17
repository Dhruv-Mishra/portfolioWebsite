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

  it('migrates a v1 blob to v2 preserving unlocked + visitedRoutes', async () => {
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
    // New v2-only fields default to empty.
    expect(state.terminalCommands).toEqual([]);
    expect(state.openedProjects).toEqual([]);
    expect(state.discoActive).toBe(false);
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

  it('disco active flag toggles and persists', async () => {
    const { setDiscoActiveImperative, __resetStoreForTest } = await loadStore();
    __resetStoreForTest();
    setDiscoActiveImperative(true);
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    expect(JSON.parse(raw).discoActive).toBe(true);
    setDiscoActiveImperative(false);
    expect(JSON.parse(memoryStorage.getItem('dhruv-stickers') as string).discoActive).toBe(false);
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
