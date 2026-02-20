/**
 * Design Tokens — Centralized design system for Dhruv's Sketchbook.
 *
 * All hardcoded measurements, sizes, timings, and layout values are centralized here.
 * Values are organized by category and support three size scales: small, medium, large.
 * Theme colors remain in globals.css (CSS custom properties with .dark class).
 *
 * Usage:
 *   - CSS custom properties are applied via data-size attribute on <html>
 *   - Components import token constants for JS values (animation configs, etc.)
 *   - Style switching is handled by StyleProvider context
 */

// ============================================================================
// SIZE SCALE TOKENS (CSS Custom Properties)
// ============================================================================

/** Size scale options */
export type SizeScale = 'small' | 'medium' | 'large';

/** All available style preset keys */
export type StylePreset = `${'light' | 'dark'}-${SizeScale}`;

// SIZE_TOKENS removed — CSS custom properties are now defined in globals.css.


// ============================================================================
// JS-ONLY TOKENS (values used only in JavaScript, not CSS)
// ============================================================================

/** Animation timing tokens — used in Framer Motion and setTimeout calls */
export const ANIMATION_TOKENS = {
  duration: {
    instant: 0.1,
    fast: 0.15,
    normal: 0.2,
    moderate: 0.3,
    slow: 0.5,
    slower: 1.2,
  },
  delay: {
    none: 0,
    short: 0.07,
    stagger: 0.1,
    medium: 0.3,
    long: 0.5,
  },
  spring: {
    snappy: { stiffness: 400, damping: 25 },
    default: { stiffness: 300, damping: 20 },
    gentle: { stiffness: 300, damping: 25 },
    bouncy: { stiffness: 400, damping: 15 },
  },
  easing: {
    easeOut: 'easeOut' as const,
    smooth: [0.25, 0.1, 0.25, 1] as const,
    bounce: [0.34, 1.56, 0.64, 1] as const,
  },
} as const;

/** Interaction animation presets */
export const INTERACTION_TOKENS = {
  hover: {
    scale: { scale: 1.05, rotate: -1 },
    scaleUp: { scale: 1.1, rotate: -5 },
    scaleSubtle: { scale: 1.02, rotate: 0 },
    lift: { scale: 1.05, rotate: -2 },
    liftRotate: { scale: 1.05, rotate: 2 },
    button: { scale: 1.08 },
    buttonRotate: { scale: 1.05, rotate: -1 },
    card: { scale: 1.02, rotate: 0 },
  },
  tap: {
    press: { scale: 0.95 },
    pressDeep: { scale: 0.9 },
    pressLight: { scale: 0.92 },
  },
  entrance: {
    fadeUp: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } },
    fadeScale: { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 } },
    fadeSlide: { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 } },
    fadeScaleRotate: {
      initial: { opacity: 0, scale: 0.85, y: 40, rotate: 2 },
      animate: { opacity: 1, scale: 1, y: 0, rotate: -1 },
    },
    scaleRotate: {
      initial: { scale: 0.95, opacity: 0, rotate: 1 },
      animate: { scale: 1, opacity: 1, rotate: -1 },
    },
    popIn: {
      initial: { opacity: 0, scale: 0.8, y: 20 },
      animate: { opacity: 1, scale: 1, y: 0 },
    },
    slideRight: {
      initial: { x: 50, opacity: 0 },
      animate: { x: 0, opacity: 1 },
    },
  },
  exit: {
    fadeDown: { opacity: 0, y: -4 },
    fadeScale: { opacity: 0, scale: 0.9 },
    fadeScaleRotate: { opacity: 0, scale: 0.85, y: 40, rotate: 2 },
    popOut: { opacity: 0, scale: 0.8, y: 20 },
  },
} as const;

/** Timing tokens for setTimeout / setInterval (milliseconds) */
export const TIMING_TOKENS = {
  typeSpeed: 18,
  eraseSpeed: 8,
  ctaTypeSpeed: 40,
  ctaEraseSpeed: 25,
  placeholderTypeSpeed: 35,
  placeholderEraseSpeed: 20,
  pauseShort: 300,
  pauseMedium: 800,
  pauseLong: 2000,
  pauseExtra: 2500,
  initialDelay: 600,
  ctaInitialDelay: 1000,
  focusDelay: 300,
  navigationDelay: 500,
  refocusDelay: 100,
  draftSaveDebounce: 400,
  storageSaveDebounce: 300,
  closeResetDelay: 300,
  successAutoClose: 2000,
  trailLifeDark: 60,
  trailLifeLight: 80,
  cursorIdleThreshold: 200,
  resizeDebounce: 100,
  scrollbarFadeDelay: 1200,
} as const;

/** Layout & dimension tokens used in JS logic */
export const LAYOUT_TOKENS = {
  mobileBreakpoint: 768,
  spiralHoles: 12,
  feedbackSpiralHoles: 15,
  maxOutputLines: 100,
  maxHistory: 200,
  maxMessageLength: 1000,
  minMessageLength: 5,
  contactMaxLength: 120,
  maxUserMessageChars: 500,
  maxConversationMessages: 25,
  contextWindowSize: 10,
  suggestionsContextSize: 4,
  pillHeightRatio: 0.12,
  pillMinPx: 20,
  cursorMaxPoints: 128,
  cursorMinDist2: 25,
  cursorMaxDist2: 6400,
} as const;

/** Terminal color tokens */
export const TERMINAL_COLORS = {
  bg: '#2d2a2e',
  headerBg: '#383436',
  prompt: 'text-emerald-400',
  directory: 'text-blue-300',
  command: 'text-gray-100',
  output: 'text-gray-300/90',
  error: 'text-red-400',
  caret: 'caret-emerald-400',
  placeholder: 'placeholder-gray-600',
  border: 'border-gray-700/50',
  headerBorder: 'border-gray-600/30',
  headerLabel: 'text-gray-400/60',
  text: 'text-gray-200',
  scrollbarColor: 'rgba(156,163,175,0.6)',
} as const;

/** Navigation tab color profiles */
export const NAV_TAB_COLORS = {
  pink: { bg: '#ff9b9b', text: 'text-red-900', border: 'border-red-300' },
  yellow: { bg: '#fff9c4', text: 'text-yellow-900', border: 'border-yellow-300' },
  green: { bg: '#c5e1a5', text: 'text-green-900', border: 'border-green-300' },
  blue: { bg: '#b3e5fc', text: 'text-blue-900', border: 'border-blue-300' },
  coral: { bg: '#ffccbc', text: 'text-orange-900', border: 'border-orange-300' },
} as const;

/** Feedback category color profiles */
export const FEEDBACK_COLORS = {
  bug: { bg: '#ff9b9b', text: 'text-red-900', border: 'border-red-300' },
  idea: { bg: '#ffe082', text: 'text-amber-900', border: 'border-amber-400' },
  kudos: { bg: '#f8bbd0', text: 'text-pink-900', border: 'border-pink-300' },
  other: { bg: '#c5e1a5', text: 'text-green-900', border: 'border-green-300' },
} as const;

/** Social sidebar hover colors */
export const SOCIAL_COLORS = {
  github: 'hover:text-gray-800',
  linkedin: 'hover:text-blue-700',
  codeforces: 'hover:text-yellow-600',
  cpHistory: 'hover:text-amber-500',
  email: 'hover:text-red-600',
  phone: 'hover:text-green-600',
} as const;

/** Cursor trail rendering config */
export const CURSOR_TRAIL = {
  dark: { color: 'rgba(255,255,255,0.6)', lineWidth: 4 },
  light: { color: 'rgba(60,60,60,0.12)', lineWidth: 2 },
} as const;

/** Shadow tokens */
export const SHADOW_TOKENS = {
  card: '5px 5px 15px rgba(0,0,0,0.1)',
  cardHeavy: '5px 5px 15px rgba(0,0,0,0.2)',
  terminal: 'inset 0 0 40px rgba(0,0,0,0.5)',
  resume: '1px 1px 5px rgba(0,0,0,0.1), 10px 10px 30px rgba(0,0,0,0.15)',
  socialButton: '1px 2px 4px rgba(0,0,0,0.15)',
  spiralHole: 'inset 0 1px 2px rgba(0,0,0,0.1)',
} as const;

/** Sketch-style organic border radius values */
export const SKETCH_RADIUS = {
  terminal: '255px 15px 225px 15px / 15px 225px 15px 255px',
  hoverCircle: '50% 40% 60% 50% / 50% 60% 40% 50%',
} as const;

/** Gradient tokens for folded corners and notes */
export const GRADIENT_TOKENS = {
  foldCorner: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.06) 50%)',
  foldCornerAlt: 'linear-gradient(225deg, transparent 50%, rgba(0,0,0,0.06) 50%)',
  foldUnderside: '#f0e6a0',
} as const;

/** Grid pattern background config */
export const GRID_PATTERN = {
  backgroundSize: '100px 100px',
  lineColor: '#9ca3af',
  lineWidth: '1px',
} as const;

/** Project card layout tokens */
export const PROJECT_TOKENS = {
  rotations: [2, -3, 1.5, -2, 4, -1],
  photoRotations: [-3, 2, -2, 3, -1, 2],
  tapePositions: [40, 60, 30, 70, 50, 45],
  foldSize: 30,
  staggerCap: 0.15,
  staggerStep: 0.03,
  viewportMargin: '-50px',
} as const;

/** Social sidebar interaction tokens */
export const SOCIAL_INTERACTION = {
  hoverRotations: [3, -4, 2, -3, 4, -2],
} as const;

/** Note rotation config */
export const NOTE_ROTATION = {
  minDeg: 0.5,
  rangeDeg: 1,
  inputRotation: 0.5,
} as const;

/** Sticky note entrance offset config */
export const NOTE_ENTRANCE = {
  userY: 30,
  userRotateOffset: 5,
  aiX: 50,
  aiRotateOffset: -5,
  oldNoteOpacity: 0.7,
} as const;

/** Ellipsis typing indicator config */
export const ELLIPSIS_CONFIG = {
  animate: {
    y: [0, -7, 0, 0],
    scale: [1, 1.35, 1, 1],
    opacity: [0.35, 1, 0.35, 0.35],
  },
  duration: 1.2,
  delays: [0, 0.16, 0.32],
  dotSize: '5px',
  gap: '3px',
} as const;

/** Chat nav tab spring positions */
export const NAV_POSITIONS = {
  active: -5,
  hovered: -10,
  default: -25,
} as const;

/**
 * Applies the size scale by setting the data-size attribute on <html>.
 * CSS custom properties are defined in globals.css and switched via
 * [data-size="small"] / [data-size="large"] selectors.
 * Medium is the default (:root), so removing the attribute restores it.
 */
export function applySizeTokens(size: SizeScale): void {
  const root = document.documentElement;
  if (size === 'medium') {
    delete root.dataset.size;
  } else {
    root.dataset.size = size;
  }
}

/**
 * Removes the size scale attribute, reverting to medium defaults.
 */
export function removeSizeTokens(): void {
  delete document.documentElement.dataset.size;
}
