/**
 * SuperuserBanner reveal-logic tests.
 *
 * The banner itself is a React component so we can't exercise its effect
 * tree without a DOM — but the FIRST-REVEAL detection is pure arithmetic:
 *   "fire fanfare once when `unlockedAt.superuser > superuserRevealedAt`,
 *    then write back the earned timestamp so a refresh doesn't replay."
 *
 * These tests exercise that invariant through the imperative store API,
 * which is what the banner component drives.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Minimal storage shim (same pattern as stickerStore.test.ts).
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.map.keys())[index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

const memoryStorage = new MemoryStorage();
const windowShim = { localStorage: memoryStorage };

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

async function loadStore() {
  return import('@/hooks/useStickers');
}

describe('SuperuserBanner reveal-logic (imperative store invariants)', () => {
  beforeEach(async () => {
    memoryStorage.clear();
    const mod = await loadStore();
    mod.__resetStoreForTest();
  });

  it('fresh install: earned=0, revealed=0 — no fanfare trigger condition met', async () => {
    const { getSuperuserRevealedAtSync } = await loadStore();
    expect(getSuperuserRevealedAtSync()).toBe(0);
    // A banner mounted on a fresh page would see earnedAt=undefined and
    // skip the effect entirely.
  });

  it('first unlock: earnedAt > revealedAt triggers the fanfare, sets revealedAt', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      unlockSticker,
      getSuperuserRevealedAtSync,
      setSuperuserRevealedAtImperative,
    } = await loadStore();
    // Unlock everything → auto-awards superuser at Date.now().
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const revealedBefore = getSuperuserRevealedAtSync();
    expect(revealedBefore).toBe(0); // never revealed yet

    // Simulate the banner mount: read unlockedAt.superuser and compare.
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    const parsed = JSON.parse(raw);
    const earnedAt = parsed.unlockedAt.superuser as number;
    expect(earnedAt).toBeGreaterThan(0);
    expect(earnedAt > revealedBefore).toBe(true);

    // Banner fires fanfare + writes back.
    setSuperuserRevealedAtImperative(earnedAt);
    expect(getSuperuserRevealedAtSync()).toBe(earnedAt);
  });

  it('second mount: revealed already equals earned — no re-trigger', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      unlockSticker,
      getSuperuserRevealedAtSync,
      setSuperuserRevealedAtImperative,
    } = await loadStore();
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const raw = memoryStorage.getItem('dhruv-stickers') as string;
    const parsed = JSON.parse(raw);
    const earnedAt = parsed.unlockedAt.superuser as number;

    // First mount: fire + write back.
    setSuperuserRevealedAtImperative(earnedAt);

    // Second mount: earnedAt == revealedAt — the banner's `earnedAt > lastRevealed`
    // predicate is FALSE, so fanfare does not fire.
    const revealedNow = getSuperuserRevealedAtSync();
    expect(earnedAt > revealedNow).toBe(false);
    expect(earnedAt === revealedNow).toBe(true);
  });

  it('reset then re-earn: banner fires again because the new earnedAt is fresh', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      unlockSticker,
      getSuperuserRevealedAtSync,
      setSuperuserRevealedAtImperative,
      resetStickerProgressImperative,
    } = await loadStore();

    // Earn, reveal, then reset.
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const firstRaw = JSON.parse(memoryStorage.getItem('dhruv-stickers') as string);
    const firstEarned = firstRaw.unlockedAt.superuser as number;
    setSuperuserRevealedAtImperative(firstEarned);

    resetStickerProgressImperative();
    expect(getSuperuserRevealedAtSync()).toBe(0);

    // Re-earn — new superuser unlock timestamp will be later than the old
    // (reset wiped the revealed timestamp to 0, so ANY earned timestamp
    // will exceed it and the banner WILL fire again — which is the
    // correct behaviour for a user who resets and re-earns).
    // Delay briefly so Date.now() advances — the store uses Date.now() for
    // timestamps, and on very fast CI the clock may not tick. Use a busy
    // wait rather than setTimeout so the test stays sync-friendly.
    const before = Date.now();
    while (Date.now() === before) { /* spin until clock ticks */ }
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const secondRaw = JSON.parse(memoryStorage.getItem('dhruv-stickers') as string);
    const secondEarned = secondRaw.unlockedAt.superuser as number;
    expect(secondEarned).toBeGreaterThan(0);
    expect(secondEarned > getSuperuserRevealedAtSync()).toBe(true);
  });

  it('defensive: passing an older timestamp is rejected (monotonic)', async () => {
    const { setSuperuserRevealedAtImperative, getSuperuserRevealedAtSync } = await loadStore();
    setSuperuserRevealedAtImperative(5000);
    expect(getSuperuserRevealedAtSync()).toBe(5000);
    // Older value — do not overwrite.
    setSuperuserRevealedAtImperative(1000);
    expect(getSuperuserRevealedAtSync()).toBe(5000);
    // Equal — also no-op (already at 5000).
    setSuperuserRevealedAtImperative(5000);
    expect(getSuperuserRevealedAtSync()).toBe(5000);
  });
});
