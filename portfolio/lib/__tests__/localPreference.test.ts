import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalPreference } from '@/lib/localPreference';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe('LocalPreference', () => {
  beforeEach(() => {
    const target = new EventTarget();
    vi.stubGlobal('window', Object.assign(target, { localStorage: createStorage() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flag = () => new LocalPreference<boolean>('flag', (raw) => raw === 'on', (on) => (on ? 'on' : null));

  it('returns the parsed default until a value is stored', () => {
    expect(flag().get()).toBe(false);
    expect(flag().getDefault()).toBe(false);
  });

  it('persists, removes on null serialization, and notifies subscribers', () => {
    const preference = flag();
    const onChange = vi.fn();
    const unsubscribe = preference.subscribe(onChange);

    preference.set(true);
    expect(window.localStorage.getItem('flag')).toBe('on');
    expect(preference.get()).toBe(true);

    preference.set(false);
    expect(window.localStorage.getItem('flag')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    preference.set(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('falls back to the default when storage throws', () => {
    const preference = flag();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(preference.get()).toBe(false);
  });
});
