"use client";

import { useSyncExternalStore } from 'react';
import {
  GUESTBOOK_PENDING_CHANGED_EVENT,
  GUESTBOOK_PENDING_STORAGE_KEY,
  getPendingGuestbookEntries,
  type PendingGuestbookEntry,
} from '@/lib/guestbookPending';

const EMPTY_ENTRIES: PendingGuestbookEntry[] = [];
const subscribers = new Set<() => void>();
let cachedStorageValue: string | null | undefined;
let cachedEntries = EMPTY_ENTRIES;

function notify() {
  cachedStorageValue = undefined;
  for (const onChange of subscribers) onChange();
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === GUESTBOOK_PENDING_STORAGE_KEY) notify();
}

function subscribe(onChange: () => void) {
  if (subscribers.size === 0) {
    window.addEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, notify);
    window.addEventListener('storage', onStorage);
  }
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0) {
      window.removeEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, notify);
      window.removeEventListener('storage', onStorage);
    }
  };
}

function getSnapshot() {
  try {
    const value = window.localStorage.getItem(GUESTBOOK_PENDING_STORAGE_KEY);
    if (value !== cachedStorageValue) {
      cachedStorageValue = value;
      cachedEntries = getPendingGuestbookEntries();
    }
    return cachedEntries;
  } catch {
    return EMPTY_ENTRIES;
  }
}

const getServerSnapshot = () => EMPTY_ENTRIES;

export function usePendingGuestbookEntries() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
