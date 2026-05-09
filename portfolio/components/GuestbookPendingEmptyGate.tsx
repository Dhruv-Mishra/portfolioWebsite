"use client";

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  GUESTBOOK_PENDING_CHANGED_EVENT,
  GUESTBOOK_PENDING_STORAGE_KEY,
  getPendingGuestbookEntries,
} from '@/lib/guestbookPending';

interface GuestbookPendingEmptyGateProps {
  children: ReactNode;
}

export default function GuestbookPendingEmptyGate({ children }: GuestbookPendingEmptyGateProps) {
  const [hasPendingEntries, setHasPendingEntries] = useState(false);

  const refreshPendingState = useCallback(() => {
    setHasPendingEntries(getPendingGuestbookEntries().length > 0);
  }, []);

  useEffect(() => {
    refreshPendingState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === GUESTBOOK_PENDING_STORAGE_KEY) refreshPendingState();
    };

    window.addEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, refreshPendingState);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(GUESTBOOK_PENDING_CHANGED_EVENT, refreshPendingState);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshPendingState]);

  if (hasPendingEntries) return null;
  return children;
}