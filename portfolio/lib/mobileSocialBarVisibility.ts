export const MOBILE_SOCIAL_BAR_IDLE_MS = 4_000;
export const MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX = 8;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export type MobileSocialBarVisibilityControllerOptions = {
  initialScrollTop: number;
  onVisibilityChange: (isVisible: boolean) => void;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  setIdleTimeout: (callback: () => void, delay: number) => TimeoutHandle;
  clearIdleTimeout: (handle: TimeoutHandle) => void;
  idleMs?: number;
  revealThresholdPx?: number;
};

export type MobileSocialBarVisibilityController = {
  handleScroll: (getScrollTop: () => number) => void;
  reveal: () => void;
  setFocusWithin: (hasFocusWithin: boolean) => void;
  dispose: () => void;
};

export function createMobileSocialBarVisibilityController({
  initialScrollTop,
  onVisibilityChange,
  requestFrame,
  cancelFrame,
  setIdleTimeout,
  clearIdleTimeout,
  idleMs = MOBILE_SOCIAL_BAR_IDLE_MS,
  revealThresholdPx = MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX,
}: MobileSocialBarVisibilityControllerOptions): MobileSocialBarVisibilityController {
  let lastScrollTop = initialScrollTop;
  let downwardDistance = 0;
  let idleTimeout: TimeoutHandle | null = null;
  let frame: number | null = null;
  let focusWithin = false;
  let disposed = false;

  const scheduleIdleHide = () => {
    if (idleTimeout !== null) clearIdleTimeout(idleTimeout);
    idleTimeout = null;
    if (focusWithin || disposed) return;
    idleTimeout = setIdleTimeout(() => {
      idleTimeout = null;
      if (!disposed) onVisibilityChange(false);
    }, idleMs);
  };

  const reveal = () => {
    if (disposed) return;
    onVisibilityChange(true);
    scheduleIdleHide();
  };

  onVisibilityChange(true);
  scheduleIdleHide();

  return {
    handleScroll(getScrollTop) {
      if (disposed || frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        if (disposed) return;

        const scrollTop = Math.max(0, getScrollTop());
        const delta = scrollTop - lastScrollTop;
        lastScrollTop = scrollTop;

        if (delta !== 0) scheduleIdleHide();

        if (delta > 0) {
          downwardDistance += delta;
          if (downwardDistance >= revealThresholdPx) {
            downwardDistance = 0;
            reveal();
          }
        } else if (delta < 0) {
          downwardDistance = 0;
        }
      });
    },
    reveal,
    setFocusWithin(hasFocusWithin) {
      if (disposed || focusWithin === hasFocusWithin) return;
      focusWithin = hasFocusWithin;
      if (focusWithin) {
        reveal();
      } else {
        scheduleIdleHide();
      }
    },
    dispose() {
      disposed = true;
      if (idleTimeout !== null) clearIdleTimeout(idleTimeout);
      if (frame !== null) cancelFrame(frame);
      idleTimeout = null;
      frame = null;
    },
  };
}