/**
 * matrixToastBus — tiny event bus for the matrix-escape achievement toast.
 *
 * We don't piggyback on the stickerBus because stickers are guarded by
 * sticker IDs and the "escape" achievement isn't a sticker (it has its
 * own banner on /stickers). Kept as an explicit fire path for future
 * flows (debug helpers, manual re-trigger) — the home-mount auto-fire
 * lives directly inside EscapeToastListener to avoid a dynamic-chunk
 * race between the listener and an emitter.
 */

type Listener = () => void;

let listeners: Listener[] = [];
// Buffers a single pending emit when no listener is subscribed yet. The
// first subscriber drains it. Fixes the race where EscapeAchievementToast
// (bundled directly into app/page.tsx) emits before the dynamic
// EscapeToastListener chunk finishes loading.
let pendingEmit = false;

export const matrixToastBus = {
  on(listener: Listener): () => void {
    listeners.push(listener);
    if (pendingEmit) {
      pendingEmit = false;
      listener();
    }
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  emitEscape(): void {
    if (listeners.length === 0) {
      pendingEmit = true;
      return;
    }
    for (const l of listeners) l();
  },
} as const;
