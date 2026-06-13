"use client";

/**
 * DiscoModeController — kept for backwards compatibility. The real work now
 * lives in two split modules:
 *
 *   1. `./DiscoFlagController`  — tiny, eagerly-mounted, just syncs the
 *                                  `data-disco` attribute and dynamically
 *                                  fetches the heavy layer when needed.
 *   2. `./DiscoMediaLayer`      — the heavy tree (sparkle canvas, spotlights,
 *                                  audio engine, mute button). Lazy-loaded
 *                                  only after the user activates disco.
 *
 * This file re-exports the flag controller so any existing import path
 * continues to resolve. Prefer importing `DiscoFlagController` directly in
 * new code.
 */
export { default } from './DiscoFlagController';
