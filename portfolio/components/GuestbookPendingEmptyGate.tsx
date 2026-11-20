"use client";

import type { ReactNode } from 'react';
import { usePendingGuestbookEntries } from '@/components/GuestbookPendingStore';

interface GuestbookPendingEmptyGateProps {
  children: ReactNode;
}

export default function GuestbookPendingEmptyGate({ children }: GuestbookPendingEmptyGateProps) {
  const hasPendingEntries = usePendingGuestbookEntries().length > 0;

  if (hasPendingEntries) return null;
  return children;
}