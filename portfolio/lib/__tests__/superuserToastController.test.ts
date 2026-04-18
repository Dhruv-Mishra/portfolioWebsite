/**
 * SuperuserToastController invariants.
 *
 * The controller is a React component so exercising its effect tree without
 * a DOM harness isn't feasible in this node-only vitest setup. But the CORE
 * DECISION (when to mount the toast) is a pure function of three store
 * scalars:
 *   - hasSuperuser (boolean): has the user earned the sticker
 *   - earnedAt (number):       unlockedAt.superuser from the store
 *   - revealedAt (number):     the reveal timestamp that gets written on dismiss
 *
 * Rule: mount toast iff hasSuperuser && earnedAt > 0 && earnedAt > revealedAt.
 *
 * These tests exercise the pure rule through the imperative store API
 * (which is what the controller's effects read), confirming that:
 *   1. Fresh install — no mount.
 *   2. Fresh unlock — mount (first reveal).
 *   3. Post-dismiss — no mount (revealedAt caught up).
 *   4. Reset + re-earn — mount again (revealedAt rolled back to 0).
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Minimal storage shim.
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

/**
 * Pure predicate matching the controller's `shouldShow` computation:
 *   shouldShow = hasSuperuser && earnedAt > 0 && earnedAt > revealedAt
 */
function shouldMountToast(
  hasSuperuser: boolean,
  earnedAt: number,
  revealedAt: number,
): boolean {
  return hasSuperuser && earnedAt > 0 && earnedAt > revealedAt;
}

describe('SuperuserToastController — mount predicate', () => {
  beforeEach(async () => {
    memoryStorage.clear();
    const mod = await loadStore();
    mod.__resetStoreForTest();
  });

  it('fresh install: no mount', async () => {
    const {
      isSuperuserEarnedSync,
      getSuperuserEarnedAtSync,
      getSuperuserRevealedAtSync,
    } = await loadStore();
    const hasSuperuser = isSuperuserEarnedSync();
    const earnedAt = getSuperuserEarnedAtSync();
    const revealedAt = getSuperuserRevealedAtSync();
    expect(shouldMountToast(hasSuperuser, earnedAt, revealedAt)).toBe(false);
  });

  it('fresh unlock: mount (first reveal)', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      unlockSticker,
      isSuperuserEarnedSync,
      getSuperuserEarnedAtSync,
      getSuperuserRevealedAtSync,
    } = await loadStore();
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const hasSuperuser = isSuperuserEarnedSync();
    const earnedAt = getSuperuserEarnedAtSync();
    const revealedAt = getSuperuserRevealedAtSync();
    expect(hasSuperuser).toBe(true);
    expect(earnedAt).toBeGreaterThan(0);
    expect(revealedAt).toBe(0);
    expect(shouldMountToast(hasSuperuser, earnedAt, revealedAt)).toBe(true);
  });

  it('post-dismiss: no mount', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      unlockSticker,
      setSuperuserRevealedAtImperative,
      isSuperuserEarnedSync,
      getSuperuserEarnedAtSync,
      getSuperuserRevealedAtSync,
    } = await loadStore();
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const earnedAt = getSuperuserEarnedAtSync();
    // Simulate the toast dismissal path.
    setSuperuserRevealedAtImperative(earnedAt);
    // After dismissal, the predicate is false.
    expect(
      shouldMountToast(
        isSuperuserEarnedSync(),
        getSuperuserEarnedAtSync(),
        getSuperuserRevealedAtSync(),
      ),
    ).toBe(false);
  });

  it('reset + re-earn: mount again', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const {
      unlockSticker,
      setSuperuserRevealedAtImperative,
      resetStickerProgressImperative,
      isSuperuserEarnedSync,
      getSuperuserEarnedAtSync,
      getSuperuserRevealedAtSync,
    } = await loadStore();
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const firstEarned = getSuperuserEarnedAtSync();
    setSuperuserRevealedAtImperative(firstEarned);
    resetStickerProgressImperative();

    // After reset, revealedAt is 0 again.
    expect(getSuperuserRevealedAtSync()).toBe(0);

    // Ensure the clock advances so the new earnedAt is > 0.
    const before = Date.now();
    while (Date.now() === before) { /* spin */ }

    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const hasSuperuser = isSuperuserEarnedSync();
    const earnedAt = getSuperuserEarnedAtSync();
    const revealedAt = getSuperuserRevealedAtSync();
    expect(shouldMountToast(hasSuperuser, earnedAt, revealedAt)).toBe(true);
  });

  it('getSuperuserEarnedAtSync returns 0 when superuser not earned', async () => {
    const { getSuperuserEarnedAtSync } = await loadStore();
    expect(getSuperuserEarnedAtSync()).toBe(0);
  });

  it('getSuperuserEarnedAtSync returns the timestamp when earned', async () => {
    const { STICKER_ROSTER } = await import('@/lib/stickers');
    const { unlockSticker, getSuperuserEarnedAtSync } = await loadStore();
    for (const s of STICKER_ROSTER) unlockSticker(s.id);
    const ts = getSuperuserEarnedAtSync();
    expect(ts).toBeGreaterThan(0);
  });
});
