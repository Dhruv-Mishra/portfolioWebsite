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
  it.each([null, '{', '{}', '{"pageFlipEnabled":"true"}'])(
    'keeps page flips off without an explicit valid opt-in: %s',
    async (raw) => {
      if (raw !== null) storage.setItem(STORAGE_KEY, raw);
      const site = await import('@/hooks/useSitePrefs');

      expect(site.getSitePrefsSnapshot().pageFlipEnabled).toBe(false);
    },
  );

  it('persists page flip opt-in and opt-out across reloads', async () => {
    let site = await import('@/hooks/useSitePrefs');
    expect(site.setSitePref('pageFlipEnabled', true)).toBe(true);
    vi.resetModules();
    site = await import('@/hooks/useSitePrefs');
    expect(site.getSitePrefsSnapshot().pageFlipEnabled).toBe(true);

    expect(site.setSitePref('pageFlipEnabled', false)).toBe(true);
    vi.resetModules();
    site = await import('@/hooks/useSitePrefs');
    expect(site.getSitePrefsSnapshot().pageFlipEnabled).toBe(false);
  });

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
      newValue: JSON.stringify({
        motionPreference: 'reduced',
        hapticsEnabled: false,
      }),
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
      reducedMotion: '',
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
    expect(dataset).not.toHaveProperty('reducedMotion');
  });

  it('validates, cycles, and applies physical paper stock preferences cleanly', async () => {
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { dataset } },
    });
    const site = await import('@/hooks/useSitePrefs');
    const internal = await import('@/hooks/useAdminPrefs');

    expect(site.getSitePrefsSnapshot().paperStock).toBe('cream');
    internal.applyPrefsToDocument(internal.getAdminPrefsSnapshot());
    expect(dataset).not.toHaveProperty('paperStock');

    expect(site.setSitePref('paperStock', 'blueprint')).toBe(true);
    internal.applyPrefsToDocument(internal.getAdminPrefsSnapshot());
    expect(dataset.paperStock).toBe('blueprint');

    expect(site.cyclePaperStock()).toBe('kraft');
    expect(site.cyclePaperStock()).toBe('sage');
    expect(site.cyclePaperStock()).toBe('cream');
    internal.applyPrefsToDocument(internal.getAdminPrefsSnapshot());
    expect(dataset).not.toHaveProperty('paperStock');

    expect((site.setSitePref as (key: string, value: unknown) => boolean)('paperStock', 'neon')).toBe(false);
    expect(site.getSitePrefsSnapshot().paperStock).toBe('cream');
  });

  it('defaults to the handwritten reading font and applies only a valid clean opt-in', async () => {
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { dataset } },
    });
    storage.setItem(STORAGE_KEY, JSON.stringify({ readingFont: 'serif' }));
    const site = await import('@/hooks/useSitePrefs');
    const internal = await import('@/hooks/useAdminPrefs');

    expect(site.getSitePrefsSnapshot().readingFont).toBe('hand');
    expect((site.setSitePref as (key: string, value: unknown) => boolean)('readingFont', 'serif')).toBe(false);

    expect(site.setSitePref('readingFont', 'clean')).toBe(true);
    internal.applyPrefsToDocument(internal.getAdminPrefsSnapshot());
    expect(dataset.readingFont).toBe('clean');

    site.setSitePref('readingFont', 'hand');
    internal.applyPrefsToDocument(internal.getAdminPrefsSnapshot());
    expect(dataset).not.toHaveProperty('readingFont');
  });
});

describe('look preferences', () => {
  const stored = { surface: 'paper', chalkboard: 'neon', noteMaterial: 'cardboard', aging: 42 };
  const resolved = { surface: 'paper', chalkboard: 'green', noteMaterial: 'cardboard', cardMaterial: 'cardboard', aging: 'light', aboutLayout: 'board', timeline: 'mesh', decorations: 'lots' };

  it('falls back to the first option for missing or invalid stored values', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const site = await import('@/hooks/useSitePrefs');

    expect(site.getSitePrefsSnapshot()).toMatchObject(resolved);
  });

  it('persists only valid choices and mirrors them onto <html>', async () => {
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { dataset } },
    });
    const site = await import('@/hooks/useSitePrefs');
    const internal = await import('@/hooks/useAdminPrefs');

    expect(site.setSitePref('chalkboard', 'green')).toBe(true);
    expect((site.setSitePref as (key: string, value: unknown) => boolean)('decorations', 'everywhere')).toBe(false);
    internal.applyPrefsToDocument(internal.getAdminPrefsSnapshot());

    expect(JSON.parse(storage.getItem(STORAGE_KEY) as string)).toMatchObject({ chalkboard: 'green', decorations: 'lots' });
    expect(dataset).toMatchObject({ surface: 'canvas', chalkboard: 'green', decor: 'lots', notes: 'paper', about: 'board', timeline: 'mesh' });
  });

  it('resolves the same attributes in the pre-paint boot snippet as in the store', async () => {
    const { LOOK_BOOT_SNIPPET } = await import('@/lib/lookPrefs');
    const e = { dataset: {} as Record<string, string> };
    new Function('e', 'o', LOOK_BOOT_SNIPPET)(e, stored);

    expect(e.dataset).toMatchObject({ surface: 'paper', chalkboard: 'green', notes: 'cardboard', cards: 'cardboard', aging: 'light', about: 'board', timeline: 'mesh', decor: 'lots' });
  });

  it.each([
    ['the default board, which the HTML already preloads', null, { prefPaper: 'on', chalkboard: 'green', surface: 'canvas' }, []],
    ['a light canvas', 'light', { prefPaper: 'on', chalkboard: 'green', surface: 'canvas' }, ['canvas-weave']],
    ['light drawing paper', 'light', { prefPaper: 'on', chalkboard: 'green', surface: 'paper' }, ['paper-grain']],
    ['the flat slate', 'dark', { prefPaper: 'on', chalkboard: 'slate', surface: 'canvas' }, []],
    ['paper grain off', 'light', { chalkboard: 'green', surface: 'canvas' }, []],
  ])('preloads only the textures the visible surface paints: %s', async (_case, theme, dataset, textures) => {
    const { TEXTURE_PRELOAD_SNIPPET } = await import('@/lib/lookPrefs');
    const links: Array<Record<string, string>> = [];
    const doc = { createElement: () => ({}), head: { append: (link: Record<string, string>) => links.push(link) } };
    const local = { getItem: (key: string) => (key === 'theme' ? theme : null) };
    new Function('e', 'document', 'localStorage', 'matchMedia', TEXTURE_PRELOAD_SNIPPET)({ dataset }, doc, local, () => ({ matches: true }));

    expect(links.map((link) => link.href)).toEqual(textures.map((name) => `/resources/textures/${name}.webp`));
    expect(links.every((link) => link.rel === 'preload' && link.as === 'image')).toBe(true);
  });

  it('resets customization in one write and leaves the other settings alone', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...stored, paperStock: 'kraft', tapeEffects: false, pageFlipEnabled: true, stickerToastsEnabled: true, readingFont: 'clean',
    }));
    const site = await import('@/hooks/useSitePrefs');

    expect(site.resetCustomization()).toBe(true);

    expect(site.getSitePrefsSnapshot()).toMatchObject({
      surface: 'canvas', noteMaterial: 'paper', paperStock: 'cream', tapeEffects: true, pageFlipEnabled: false,
      stickerToastsEnabled: true, readingFont: 'clean',
    });
    expect(JSON.parse(storage.getItem(STORAGE_KEY) as string)).toMatchObject({ surface: 'canvas', paperStock: 'cream', readingFont: 'clean' });
  });
});