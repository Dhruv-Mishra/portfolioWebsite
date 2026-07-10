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
  it('migrates v2 values and defaults malformed or missing v3 fields safely', async () => {
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
      version: 4,
      paperGrain: false,
      tapeEffects: true,
      experimentalCommands: true,
      stickerToastsEnabled: true,
      hapticsEnabled: true,
      motionPreference: 'system',
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
    expect(internal.getAdminPrefsSnapshot().motionPreference).toBe('system');
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
      version: 4,
      motionPreference: 'full',
    });
    expect(dataset.motion).toBe('full');
  });
});