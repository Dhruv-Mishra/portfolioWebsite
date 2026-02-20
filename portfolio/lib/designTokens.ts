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

/**
 * CSS custom property tokens for each size scale.
 * These get applied as inline CSS variables on <html>.
 * Using CSS custom properties enables zero-JS runtime switching.
 */
export const SIZE_TOKENS: Record<SizeScale, Record<string, string>> = {
  small: {
    // ── Typography ──
    '--t-hero': '3rem',
    '--t-hero-md': '4.5rem',
    '--t-hero-lg': '4.5rem',
    '--t-h1': '1.5rem',
    '--t-h1-md': '1.875rem',
    '--t-h2': '1.25rem',
    '--t-h2-md': '1.5rem',
    '--t-body': '0.8125rem',
    '--t-body-md': '0.875rem',
    '--t-small': '0.6875rem',
    '--t-label': '0.625rem',
    '--t-nav': '0.75rem',
    '--t-nav-md': '0.875rem',

    // ── Spacing ──
    '--s-page-px': '0.5rem',
    '--s-page-px-md': '1.5rem',
    '--s-page-py': '1rem',
    '--s-section-gap': '1.5rem',
    '--s-card-p': '1rem',
    '--s-card-p-md': '1.5rem',
    '--s-element-gap': '0.75rem',
    '--s-tight-gap': '0.25rem',
    '--s-content-gap': '0.375rem',
    '--s-msg-gap': '0.875rem',
    '--s-msg-gap-md': '1rem',

    // ── Component Sizes ──
    '--c-terminal-h': '40vh',
    '--c-terminal-h-md': '300px',
    '--c-terminal-min-h': '200px',
    '--c-terminal-max-w': '36rem',
    '--c-nav-tab-py': '0.5rem',
    '--c-nav-tab-py-md': '0.625rem',
    '--c-nav-tab-px': '0.375rem',
    '--c-nav-tab-px-md': '0.625rem',
    '--c-nav-tab-pt': '2.25rem',
    '--c-nav-tab-pt-md': '2.75rem',
    '--c-spiral-w': '2.5rem',
    '--c-spiral-w-md': '3rem',
    '--c-ring-size': '1.75rem',
    '--c-hole-size': '0.625rem',
    '--c-chat-w': 'calc(100vw - 2rem)',
    '--c-chat-w-md': '340px',
    '--c-chat-h': '60vh',
    '--c-chat-h-md': '420px',
    '--c-chat-max-w': '340px',
    '--c-fab-size': '2.5rem',
    '--c-fab-size-md': '2.75rem',
    '--c-icon-sm': '14px',
    '--c-icon-md': '18px',
    '--c-icon-lg': '22px',
    '--c-icon-xl': '24px',
    '--c-btn-px': '0.5rem',
    '--c-btn-py': '0.375rem',
    '--c-btn-px-lg': '1rem',
    '--c-btn-py-lg': '0.5rem',
    '--c-card-min-h': '350px',
    '--c-card-min-h-md': '380px',
    '--c-note-max-w': '80%',
    '--c-note-max-w-md': '65%',
    '--c-tape-w': '3.5rem',
    '--c-tape-w-md': '5rem',
    '--c-tape-h': '1rem',
    '--c-tape-h-md': '1.25rem',
    '--c-corner-fold': '20px',
    '--c-corner-fold-md': '40px',
    '--c-photo-size': '5rem',
    '--c-photo-size-md': '10rem',
    '--c-feedback-w': '420px',
    '--c-social-icon': '20px',
    '--c-social-icon-md': '22px',
    '--c-cursor-size': '1.75rem',
    '--c-cursor-size-md': '2.25rem',
    '--c-scrollbar-w': '4px',
    '--c-pill-w': '4px',
    '--c-modal-top': '10vh',
    '--c-modal-top-md': '14vh',
    '--c-thumb-size': '24px',

    // ── Borders ──
    '--b-width': '1.5px',
    '--b-width-thick': '2px',
    '--b-radius-sm': '0.25rem',
    '--b-radius-md': '0.5rem',
    '--b-radius-lg': '0.75rem',
    '--b-radius-pill': '9999px',

    // ── Z-Index Scale ──
    '--z-base': '0',
    '--z-doodles': '0',
    '--z-grid': '0',
    '--z-noise': '1',
    '--z-content': '10',
    '--z-crease': '20',
    '--z-tape': '20',
    '--z-nav': '50',
    '--z-spiral': '30',
    '--z-social': '40',
    '--z-fab': '50',
    '--z-theme-toggle': '50',
    '--z-modal-backdrop': '60',
    '--z-modal': '61',
    '--z-cursor': '9999',
    '--z-skip-link': '100',

    // ── Layout ──
    '--l-max-w-content': '42rem',
    '--l-max-w-terminal': '48rem',
    '--l-max-w-card': '72rem',
    '--l-max-w-modal': '500px',
    '--l-grid-cell': '40',
  },

  medium: {
    // ── Typography ──
    '--t-hero': '3.75rem',
    '--t-hero-md': '6rem',
    '--t-hero-lg': '8rem',
    '--t-h1': '2.25rem',
    '--t-h1-md': '3rem',
    '--t-h2': '1.5rem',
    '--t-h2-md': '1.875rem',
    '--t-body': '0.875rem',
    '--t-body-md': '1rem',
    '--t-small': '0.75rem',
    '--t-label': '0.625rem',
    '--t-nav': '0.875rem',
    '--t-nav-md': '1.25rem',

    // ── Spacing ──
    '--s-page-px': '1rem',
    '--s-page-px-md': '2rem',
    '--s-page-py': '1.25rem',
    '--s-section-gap': '2rem',
    '--s-card-p': '1.5rem',
    '--s-card-p-md': '2rem',
    '--s-element-gap': '1rem',
    '--s-tight-gap': '0.5rem',
    '--s-content-gap': '0.5rem',
    '--s-msg-gap': '1.5rem',
    '--s-msg-gap-md': '1.75rem',

    // ── Component Sizes ──
    '--c-terminal-h': '50vh',
    '--c-terminal-h-md': '400px',
    '--c-terminal-min-h': '300px',
    '--c-terminal-max-w': '48rem',
    '--c-nav-tab-py': '0.75rem',
    '--c-nav-tab-py-md': '1rem',
    '--c-nav-tab-px': '0.75rem',
    '--c-nav-tab-px-md': '1.25rem',
    '--c-nav-tab-pt': '3rem',
    '--c-nav-tab-pt-md': '4rem',
    '--c-spiral-w': '3rem',
    '--c-spiral-w-md': '4rem',
    '--c-ring-size': '2rem',
    '--c-hole-size': '0.75rem',
    '--c-chat-w': 'calc(100vw - 2rem)',
    '--c-chat-w-md': '380px',
    '--c-chat-h': '70vh',
    '--c-chat-h-md': '480px',
    '--c-chat-max-w': '380px',
    '--c-fab-size': '3rem',
    '--c-fab-size-md': '3.5rem',
    '--c-icon-sm': '14px',
    '--c-icon-md': '18px',
    '--c-icon-lg': '22px',
    '--c-icon-xl': '24px',
    '--c-btn-px': '0.75rem',
    '--c-btn-py': '0.5rem',
    '--c-btn-px-lg': '1.5rem',
    '--c-btn-py-lg': '0.75rem',
    '--c-card-min-h': 'auto',
    '--c-card-min-h-md': '450px',
    '--c-note-max-w': '85%',
    '--c-note-max-w-md': '70%',
    '--c-tape-w': '4rem',
    '--c-tape-w-md': '6rem',
    '--c-tape-h': '1.25rem',
    '--c-tape-h-md': '1.5rem',
    '--c-corner-fold': '30px',
    '--c-corner-fold-md': '60px',
    '--c-photo-size': '6rem',
    '--c-photo-size-md': '12rem',
    '--c-feedback-w': '500px',
    '--c-social-icon': '24px',
    '--c-social-icon-md': '28px',
    '--c-cursor-size': '2rem',
    '--c-cursor-size-md': '2.5rem',
    '--c-scrollbar-w': '5px',
    '--c-pill-w': '5px',
    '--c-modal-top': '8vh',
    '--c-modal-top-md': '12vh',
    '--c-thumb-size': '24px',

    // ── Borders ──
    '--b-width': '2px',
    '--b-width-thick': '3px',
    '--b-radius-sm': '0.25rem',
    '--b-radius-md': '0.5rem',
    '--b-radius-lg': '1rem',
    '--b-radius-pill': '9999px',

    // ── Z-Index Scale ──
    '--z-base': '0',
    '--z-doodles': '0',
    '--z-grid': '0',
    '--z-noise': '1',
    '--z-content': '10',
    '--z-crease': '20',
    '--z-tape': '20',
    '--z-nav': '50',
    '--z-spiral': '30',
    '--z-social': '40',
    '--z-fab': '50',
    '--z-theme-toggle': '50',
    '--z-modal-backdrop': '60',
    '--z-modal': '61',
    '--z-cursor': '9999',
    '--z-skip-link': '100',

    // ── Layout ──
    '--l-max-w-content': '42rem',
    '--l-max-w-terminal': '48rem',
    '--l-max-w-card': '72rem',
    '--l-max-w-modal': '500px',
    '--l-grid-cell': '40',
  },

  large: {
    // ── Typography ──
    '--t-hero': '4.5rem',
    '--t-hero-md': '8rem',
    '--t-hero-lg': '10rem',
    '--t-h1': '3rem',
    '--t-h1-md': '3.75rem',
    '--t-h2': '1.875rem',
    '--t-h2-md': '2.25rem',
    '--t-body': '1rem',
    '--t-body-md': '1.125rem',
    '--t-small': '0.875rem',
    '--t-label': '0.75rem',
    '--t-nav': '1rem',
    '--t-nav-md': '1.5rem',

    // ── Spacing ──
    '--s-page-px': '1.5rem',
    '--s-page-px-md': '3rem',
    '--s-page-py': '2rem',
    '--s-section-gap': '3rem',
    '--s-card-p': '2rem',
    '--s-card-p-md': '3rem',
    '--s-element-gap': '1.5rem',
    '--s-tight-gap': '0.75rem',
    '--s-content-gap': '0.75rem',
    '--s-msg-gap': '2rem',
    '--s-msg-gap-md': '2.5rem',

    // ── Component Sizes ──
    '--c-terminal-h': '55vh',
    '--c-terminal-h-md': '500px',
    '--c-terminal-min-h': '350px',
    '--c-terminal-max-w': '56rem',
    '--c-nav-tab-py': '1rem',
    '--c-nav-tab-py-md': '1.25rem',
    '--c-nav-tab-px': '1rem',
    '--c-nav-tab-px-md': '1.75rem',
    '--c-nav-tab-pt': '4rem',
    '--c-nav-tab-pt-md': '5rem',
    '--c-spiral-w': '3.5rem',
    '--c-spiral-w-md': '5rem',
    '--c-ring-size': '2.5rem',
    '--c-hole-size': '1rem',
    '--c-chat-w': 'calc(100vw - 2rem)',
    '--c-chat-w-md': '440px',
    '--c-chat-h': '75vh',
    '--c-chat-h-md': '560px',
    '--c-chat-max-w': '440px',
    '--c-fab-size': '3.5rem',
    '--c-fab-size-md': '4rem',
    '--c-icon-sm': '16px',
    '--c-icon-md': '20px',
    '--c-icon-lg': '26px',
    '--c-icon-xl': '28px',
    '--c-btn-px': '1rem',
    '--c-btn-py': '0.625rem',
    '--c-btn-px-lg': '2rem',
    '--c-btn-py-lg': '1rem',
    '--c-card-min-h': 'auto',
    '--c-card-min-h-md': '550px',
    '--c-note-max-w': '90%',
    '--c-note-max-w-md': '75%',
    '--c-tape-w': '5rem',
    '--c-tape-w-md': '8rem',
    '--c-tape-h': '1.5rem',
    '--c-tape-h-md': '2rem',
    '--c-corner-fold': '40px',
    '--c-corner-fold-md': '80px',
    '--c-photo-size': '8rem',
    '--c-photo-size-md': '16rem',
    '--c-feedback-w': '580px',
    '--c-social-icon': '28px',
    '--c-social-icon-md': '32px',
    '--c-cursor-size': '2.5rem',
    '--c-cursor-size-md': '3rem',
    '--c-scrollbar-w': '6px',
    '--c-pill-w': '6px',
    '--c-modal-top': '6vh',
    '--c-modal-top-md': '10vh',
    '--c-thumb-size': '28px',

    // ── Borders ──
    '--b-width': '2.5px',
    '--b-width-thick': '4px',
    '--b-radius-sm': '0.375rem',
    '--b-radius-md': '0.75rem',
    '--b-radius-lg': '1.25rem',
    '--b-radius-pill': '9999px',

    // ── Z-Index Scale ──
    '--z-base': '0',
    '--z-doodles': '0',
    '--z-grid': '0',
    '--z-noise': '1',
    '--z-content': '10',
    '--z-crease': '20',
    '--z-tape': '20',
    '--z-nav': '50',
    '--z-spiral': '30',
    '--z-social': '40',
    '--z-fab': '50',
    '--z-theme-toggle': '50',
    '--z-modal-backdrop': '60',
    '--z-modal': '61',
    '--z-cursor': '9999',
    '--z-skip-link': '100',

    // ── Layout ──
    '--l-max-w-content': '48rem',
    '--l-max-w-terminal': '56rem',
    '--l-max-w-card': '80rem',
    '--l-max-w-modal': '580px',
    '--l-grid-cell': '40',
  },
} as const;


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
  fillerTier1: 2_000,
  fillerTier2: 8_000,
  fillerTier3: 14_000,
  fillerTier4: 20_000,
  jokeApiTimeout: 5000,
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
  maxDeg: 1.5,
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
