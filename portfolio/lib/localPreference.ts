"use client";

import { useSyncExternalStore } from 'react';

/**
 * One localStorage-backed value with same-tab and cross-tab change notifications.
 * `parse(null)` is the default, used on the server and when storage is unavailable.
 * `serialize` returning null removes the key.
 */
export class LocalPreference<T> {
  readonly changeEvent: string;

  constructor(
    readonly storageKey: string,
    private readonly parse: (raw: string | null) => T,
    private readonly serialize: (value: T) => string | null = String,
  ) {
    this.changeEvent = `${storageKey}:change`;
  }

  readonly get = (): T => {
    if (typeof window === 'undefined') return this.parse(null);
    try {
      return this.parse(window.localStorage.getItem(this.storageKey));
    } catch {
      return this.parse(null);
    }
  };

  readonly getDefault = (): T => this.parse(null);

  readonly set = (value: T): void => {
    if (typeof window === 'undefined') return;
    try {
      const raw = this.serialize(value);
      if (raw === null) window.localStorage.removeItem(this.storageKey);
      else window.localStorage.setItem(this.storageKey, raw);
    } catch {
      // Storage can be blocked; still notify so the running page updates.
    }
    window.dispatchEvent(new Event(this.changeEvent));
  };

  readonly subscribe = (onChange: () => void): (() => void) => {
    window.addEventListener(this.changeEvent, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(this.changeEvent, onChange);
      window.removeEventListener('storage', onChange);
    };
  };
}

export function usePreference<T>(preference: LocalPreference<T>): T {
  return useSyncExternalStore(preference.subscribe, preference.get, preference.getDefault);
}
