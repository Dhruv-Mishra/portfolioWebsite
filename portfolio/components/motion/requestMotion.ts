"use client";

let release: () => void = () => undefined;
const requested = new Promise<void>((resolve) => {
  release = resolve;
});

/** Starts loading framer-motion's animation features. Modules that animate with `m` call it when they load. */
export function requestMotion(): void {
  release();
}

/**
 * The `<LazyMotion>` loader. The ~29KB gzip feature bundle waits until something asks for motion, or until the page
 * has loaded and gone idle, so it never competes with first paint and hydration on pages that do not animate.
 */
export function loadMotionFeatures() {
  if (typeof window !== 'undefined') {
    const idle = () => (window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1)))(release, { timeout: 4000 });
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
  }
  return requested.then(() => import('./lazy-features')).then((mod) => mod.default);
}
