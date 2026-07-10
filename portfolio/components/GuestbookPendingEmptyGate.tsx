"use client";

import { useSyncExternalStore, type ReactNode } from 'react';
import {
  GUESTBOOK_PENDING_CHANGED_EVENT,
  GUESTBOOK_PENDING_STORAGE_KEY,
  getPendingGuestbookEntries,
} from '@/lib/guestbookPending';

interface GuestbookPendingEmptyGateProps {
  children: ReactNode;
}

function subscribeToPendingEntries(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === GUESTBOOK_PENDING_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, onStoreChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, onStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
}

function getHasPendingEntries(): boolean {
  return getPendingGuestbookEntries().length > 0;
}

function getServerHasPendingEntries(): boolean {
  return false;
}

export default function GuestbookPendingEmptyGate({ children }: GuestbookPendingEmptyGateProps) {
  const hasPendingEntries = useSyncExternalStore(
    subscribeToPendingEntries,
    getHasPendingEntries,
    getServerHasPendingEntries,
  );

  if (hasPendingEntries) return null;
  return children;
}