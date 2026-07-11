import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMobileSocialBarVisibilityController,
  MOBILE_SOCIAL_BAR_IDLE_MS,
  MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX,
} from '@/lib/mobileSocialBarVisibility';

type Frame = { handle: number; callback: FrameRequestCallback };

function createHarness(
  initialScrollTop = 0,
  options: { initiallyRouteHidden?: boolean } = {},
) {
  const visibilityChanges: boolean[] = [];
  const frames: Frame[] = [];
  let nextFrameHandle = 1;

  const controller = createMobileSocialBarVisibilityController({
    initialScrollTop,
    ...options,
    onVisibilityChange: (isVisible) => visibilityChanges.push(isVisible),
    requestFrame: (callback) => {
      const handle = nextFrameHandle++;
      frames.push({ handle, callback });
      return handle;
    },
    cancelFrame: (handle) => {
      const index = frames.findIndex((frame) => frame.handle === handle);
      if (index >= 0) frames.splice(index, 1);
    },
    setIdleTimeout: setTimeout,
    clearIdleTimeout: clearTimeout,
  });

  return {
    controller,
    visibilityChanges,
    flushFrame() {
      const frame = frames.shift();
      frame?.callback(0);
    },
    pendingFrames: () => frames.length,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mobile social bar visibility controller', () => {
  it('hides after the idle period', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    vi.advanceTimersByTime(MOBILE_SOCIAL_BAR_IDLE_MS - 1);
    expect(harness.visibilityChanges).toEqual([true]);

    vi.advanceTimersByTime(1);
    expect(harness.visibilityChanges).toEqual([true, false]);
  });

  it('reveals after accumulated downward scrolling crosses the threshold', () => {
    vi.useFakeTimers();
    const harness = createHarness(20);
    let scrollTop = 20;

    vi.advanceTimersByTime(MOBILE_SOCIAL_BAR_IDLE_MS);
    scrollTop += MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX - 1;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([true, false]);

    scrollTop += 1;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([true, false, true]);
  });

  it('keeps a route-hidden bar hidden through restoration until user scrolling crosses the threshold', () => {
    vi.useFakeTimers();
    const harness = createHarness(20, { initiallyRouteHidden: true });
    let scrollTop = 20;

    expect(harness.visibilityChanges).toEqual([false]);

    scrollTop += MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX * 2;
    harness.controller.handleScroll(() => scrollTop, false);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([false]);

    scrollTop += MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX - 1;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([false]);

    scrollTop += 1;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([false, true]);
  });

  it('does not unlock a route-hidden bar on upward user scrolling', () => {
    vi.useFakeTimers();
    const harness = createHarness(20, { initiallyRouteHidden: true });
    let scrollTop = 20;

    scrollTop -= 10;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();

    scrollTop += MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX * 2;
    harness.controller.handleScroll(() => scrollTop, false);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([false]);

    scrollTop += MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([false, true]);
  });

  it('cancels a queued qualifying scroll when a route hide occurs', () => {
    const harness = createHarness(20);
    let scrollTop = 20;

    scrollTop += MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX;
    harness.controller.handleScroll(() => scrollTop, true);
    expect(harness.pendingFrames()).toBe(1);

    harness.controller.hideForRouteChange();
    expect(harness.pendingFrames()).toBe(0);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([true, false]);
  });

  it('does not reveal a route-hidden bar through direct interaction before user scroll reaches the threshold', () => {
    const harness = createHarness(20, { initiallyRouteHidden: true });
    let scrollTop = 20;

    harness.controller.reveal();
    harness.controller.setFocusWithin(true);
    expect(harness.visibilityChanges).toEqual([false]);

    scrollTop += MOBILE_SOCIAL_BAR_REVEAL_THRESHOLD_PX - 1;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([false]);

    scrollTop += 1;
    harness.controller.handleScroll(() => scrollTop, true);
    harness.flushFrame();
    expect(harness.visibilityChanges).toEqual([false, true]);
  });

  it('reveal resets the idle period for route and direct-interaction callers', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    vi.advanceTimersByTime(MOBILE_SOCIAL_BAR_IDLE_MS);
    expect(harness.visibilityChanges).toEqual([true, false]);

    harness.controller.reveal();
    expect(harness.visibilityChanges).toEqual([true, false, true]);

    vi.advanceTimersByTime(MOBILE_SOCIAL_BAR_IDLE_MS - 1);
    expect(harness.visibilityChanges).toEqual([true, false, true]);
    vi.advanceTimersByTime(1);
    expect(harness.visibilityChanges).toEqual([true, false, true, false]);
  });

  it('stays visible while focus is within the bar and restarts idle timing on blur', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    vi.advanceTimersByTime(MOBILE_SOCIAL_BAR_IDLE_MS - 100);
    harness.controller.setFocusWithin(true);
    vi.advanceTimersByTime(MOBILE_SOCIAL_BAR_IDLE_MS);
    expect(harness.visibilityChanges).toEqual([true, true]);

    harness.controller.setFocusWithin(false);
    vi.advanceTimersByTime(MOBILE_SOCIAL_BAR_IDLE_MS);
    expect(harness.visibilityChanges).toEqual([true, true, false]);
  });

  it('cancels pending timers and animation frames on disposal', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    harness.controller.handleScroll(() => 100, true);
    expect(harness.pendingFrames()).toBe(1);
    harness.controller.dispose();
    expect(harness.pendingFrames()).toBe(0);

    vi.runAllTimers();
    expect(harness.visibilityChanges).toEqual([true]);
  });
});