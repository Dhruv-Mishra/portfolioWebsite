"use client";

import { useEffect } from 'react';
import { stickerBus } from '@/lib/stickerBus';
import { STICKER_TIMING } from '@/lib/designTokens';

/**
 * Mounts on the resume page and fires `long-read` once the reader has
 * lingered past STICKER_TIMING.resumeReadThresholdMs. Kept separate so
 * `app/resume/page.tsx` can remain a server component.
 */
export default function ResumeStickerEmit(): null {
  useEffect(() => {
    const id = window.setTimeout(() => {
      stickerBus.emit('long-read');
    }, STICKER_TIMING.resumeReadThresholdMs);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
