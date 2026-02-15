/**
 * Central breakpoint for mobile detection.
 * Matches Tailwind's 'md' default (768px).
 */
export const MOBILE_BREAKPOINT = 768;

/** Portfolio version — single source of truth */
export const APP_VERSION = 'v0.0.4';

/**
 * Realistic torn-edge tape strip clipPath polygon.
 * Used across ~10 components — extracted here to avoid duplication
 * and prevent re-creation of inline style objects on each render.
 */
export const TAPE_CLIP_PATH = 'polygon(5% 0%, 95% 0%, 100% 5%, 98% 10%, 100% 15%, 98% 20%, 100% 25%, 98% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 98% 60%, 100% 65%, 98% 70%, 100% 75%, 98% 80%, 100% 85%, 98% 90%, 100% 95%, 95% 100%, 5% 100%, 0% 95%, 2% 90%, 0% 85%, 2% 80%, 0% 75%, 2% 70%, 0% 65%, 2% 60%, 0% 55%, 2% 50%, 0% 45%, 2% 40%, 0% 35%, 2% 30%, 0% 25%, 2% 20%, 0% 15%, 2% 10%, 0% 5%)';

/** Shared style objects for tape strips — module-level to avoid re-creation per render */
export const TAPE_STYLE = {
  backgroundColor: 'var(--tape-color, rgba(210, 180, 140, 0.55))',
  clipPath: TAPE_CLIP_PATH,
} as const;

/** Tape style with default brownish color for decorative tape on pages */
export const TAPE_STYLE_DECOR = {
  backgroundColor: 'var(--tape-color, rgba(194, 163, 120, 0.6))',
  clipPath: TAPE_CLIP_PATH,
} as const;
