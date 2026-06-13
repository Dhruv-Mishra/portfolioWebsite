"use client";

import { useVisitedPagesTracker } from '@/hooks/useVisitedPagesTracker';

/**
 * Headless wrapper — mounts the visited-pages tracker hook and renders nothing.
 * Mounted once by EagerEnhancements so the hook survives page flips.
 */
export default function VisitedPagesTrackerMount(): null {
  useVisitedPagesTracker();
  return null;
}
