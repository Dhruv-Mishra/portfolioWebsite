/**
 * Sticker event bus — a lightweight typed pub/sub built on top of
 * CustomEvent('sticker:earn'). Anyone can emit, listeners subscribe
 * through the React hook `useStickers`.
 *
 * We use window.dispatchEvent so external code (Agent C's GuestbookForm)
 * can fire the same event shape without needing to import the bus:
 *   window.dispatchEvent(new CustomEvent('sticker:earn', { detail: { id: 'signed-guestbook' } }))
 */
import type { StickerId } from '@/lib/stickers';

export type StickerBusEvent = { type: 'earn'; id: StickerId };

const EVENT_NAME = 'sticker:earn';

type EarnDetail = { id: StickerId };

let listenerCount = 0;
let pendingEarns: StickerId[] = [];

function isSsr(): boolean {
  return typeof window === 'undefined';
}

export const stickerBus = {
  /** Dispatch a sticker-earn event. Safe to call during SSR (no-op). */
  emit(id: StickerId): void {
    if (isSsr()) return;
    try {
      if (listenerCount === 0) {
        pendingEarns = [...pendingEarns.slice(-24), id];
      }
      window.dispatchEvent(new CustomEvent<EarnDetail>(EVENT_NAME, { detail: { id } }));
    } catch {
      /* ignore — CustomEvent unsupported or detached window */
    }
  },

  /**
   * Subscribe to earn events. Returns an unsubscribe function.
   * Guards against malformed events (no detail, non-string id).
   */
  on(fn: (event: StickerBusEvent) => void): () => void {
    if (isSsr()) return () => undefined;
    const handler = (raw: Event): void => {
      const detail = (raw as CustomEvent<EarnDetail>).detail;
      if (!detail || typeof detail.id !== 'string') return;
      fn({ type: 'earn', id: detail.id as StickerId });
    };
    listenerCount += 1;
    window.addEventListener(EVENT_NAME, handler);
    if (pendingEarns.length > 0) {
      const queued = pendingEarns;
      pendingEarns = [];
      for (const id of queued) {
        fn({ type: 'earn', id });
      }
    }
    return () => {
      listenerCount = Math.max(0, listenerCount - 1);
      window.removeEventListener(EVENT_NAME, handler);
    };
  },
};
