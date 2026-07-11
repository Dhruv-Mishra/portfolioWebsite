import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'dhruv-admin-prefs';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

let storageHandler: ((event: StorageEvent) => void) | undefined;
let storage: MemoryStorage;

beforeEach(() => {
  vi.resetModules();
  storage = new MemoryStorage();
  storageHandler = undefined;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
      addEventListener: (type: string, handler: (event: StorageEvent) => void) => {
        if (type === 'storage') storageHandler = handler;
      },
      removeEventListener: vi.fn(),
    },
  });
});

describe('site preference migration and facade', () => {
  it.each([
    ['absent storage', null],
    ['malformed storage', '{'],
    ['a missing motion preference', JSON.stringify({ version: 5 })],
    ['an invalid motion preference', JSON.stringify({ version: 5, motionPreference: 'always' })],
  ])('defaults to full motion for %s', async (_scenario, storedValue) => {
    if (storedValue !== null) storage.setItem(STORAGE_KEY, storedValue);

    const internal = await import('@/hooks/useAdminPrefs');

    expect(internal.getAdminPrefsSnapshot().motionPreference).toBe('full');
  });

  it.each(['system', 'reduced', 'full'] as const)(
    'preserves an explicit %s motion preference',
    async (motionPreference) => {
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 5, motionPreference }));

      const internal = await import('@/hooks/useAdminPrefs');

      expect(internal.getAdminPrefsSnapshot().motionPreference).toBe(motionPreference);
    },
  );

  it('migrates v2 values and defaults malformed or missing current fields safely', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      paperGrain: false,
      tapeEffects: 'false',
      experimentalCommands: true,
      stickerToastsEnabled: true,
      hapticsEnabled: 'no',
      motionPreference: 'always',
    }));

    const internal = await import('@/hooks/useAdminPrefs');
    const prefs = internal.getAdminPrefsSnapshot();

    expect(prefs).toMatchObject({
      version: 5,
      paperGrain: false,
      tapeEffects: true,
      experimentalFeatures: false,
      experimentalCommands: true,
      stickerToastsEnabled: true,
      hapticsEnabled: true,
      motionPreference: 'full',
    });
  });

  it('exposes no experimental command value or setter through the public facade', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ experimentalCommands: true }));
    const site = await import('@/hooks/useSitePrefs');

    const publicPrefs = site.getSitePrefsSnapshot();
    expect(publicPrefs).not.toHaveProperty('experimentalCommands');

    (site.setSitePref as (key: string, value: unknown) => void)(
      'experimentalCommands',
      false,
    );

    site.setSitePref('paperGrain', false);
    const persisted = JSON.parse(storage.getItem(STORAGE_KEY) as string);
    expect(persisted.paperGrain).toBe(false);
    expect(persisted.experimentalCommands).toBe(true);
  });

  it('adopts validated preference changes from another tab', async () => {
    const internal = await import('@/hooks/useAdminPrefs');
    expect(internal.getAdminPrefsSnapshot().motionPreference).toBe('full');
    expect(storageHandler).toBeTypeOf('function');

    storageHandler?.({
      key: STORAGE_KEY,
      newValue: JSON.stringify({ motionPreference: 'reduced', hapticsEnabled: false }),
    } as StorageEvent);

    expect(internal.getAdminPrefsSnapshot()).toMatchObject({
      motionPreference: 'reduced',
      hapticsEnabled: false,
    });
  });

  it('applies public visual attributes without exposing the private gate', async () => {
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { dataset } },
    });
    const internal = await import('@/hooks/useAdminPrefs');

    internal.applyPrefsToDocument({
      ...internal.getAdminPrefsSnapshot(),
      experimentalCommands: true,
      motionPreference: 'reduced',
    });

    expect(dataset).toMatchObject({
      prefPaper: 'on',
      prefTape: 'on',
      prefSketch: 'on',
      motion: 'reduced',
    });
    expect(dataset).not.toHaveProperty('prefExperimental');
  });

  it('exposes and persists the staging opt-in without exposing the private command gate', async () => {
    const site = await import('@/hooks/useSitePrefs');

    site.setSitePref('experimentalFeatures', true);

    expect(site.getSitePrefsSnapshot().experimentalFeatures).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) as string)).toMatchObject({
      version: 5,
      experimentalFeatures: true,
      experimentalCommands: false,
    });
  });

  it('keeps the opt-in state truthful when storage is unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('Storage unavailable');
        },
      },
    });
    const site = await import('@/hooks/useSitePrefs');

    expect(site.setSitePref('experimentalFeatures', true)).toBe(false);
    expect(site.getSitePrefsSnapshot().experimentalFeatures).toBe(true);
  });

  it('retries a same-value write after storage becomes available', async () => {
    let storageAvailable = false;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: (key: string, value: string) => {
          if (!storageAvailable) throw new DOMException('Storage unavailable');
          storage.setItem(key, value);
        },
      },
    });
    const site = await import('@/hooks/useSitePrefs');

    expect(site.setSitePref('experimentalFeatures', true)).toBe(false);
    storageAvailable = true;
    expect(site.setSitePref('experimentalFeatures', true)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) as string)).toMatchObject({
      experimentalFeatures: true,
    });
  });

  it('persists and applies the full-motion override', async () => {
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { dataset } },
    });
    const site = await import('@/hooks/useSitePrefs');
    const internal = await import('@/hooks/useAdminPrefs');

    site.setSitePref('motionPreference', 'full');
    internal.applyPrefsToDocument(internal.getAdminPrefsSnapshot());

    expect(JSON.parse(storage.getItem(STORAGE_KEY) as string)).toMatchObject({
      version: 5,
      motionPreference: 'full',
    });
    expect(dataset.motion).toBe('full');
  });
});