/**
 * Design tokens: the single source for look-and-feel values used from TypeScript.
 *
 * Where values live:
 *   - Theme-dependent values (light/dark/disco colors, responsive sizes) are CSS custom
 *     properties in app/globals.css, because selectors and media queries switch them at runtime.
 *   - Tailwind utilities come from the `@theme` block in globals.css (e.g. `bg-paper-yellow`).
 *   - Everything JS needs (Framer Motion configs, canvas/SVG colors, z-index layers, timings)
 *     lives here. Hex values shared with `@theme` are checked by lib/__tests__/designTokens.test.ts.
 *
 * Before adding a literal color, duration, or z-index to a component, reuse or add a token here.
 */

/** Sticky-note paper palette shared by nav tabs, feedback categories, stickers, and home notes. */
export const PAPER_PALETTE = {
  yellow: '#fff9c4',
  coral: '#ffccbc',
  coralDark: '#3e2723',
  pink: '#ff9b9b',
  rose: '#f8bbd0',
  amber: '#ffe082',
  green: '#c5e1a5',
  blue: '#b3e5fc',
  lavender: '#e9d5ff',
} as const;

/** Selectable physical sketchbook paper stocks (used by Settings swatches and context menu). */
export const PAPER_STOCK_ORDER = ['cream', 'blueprint', 'kraft', 'sage'] as const;
export type PaperStockId = (typeof PAPER_STOCK_ORDER)[number];

export const PAPER_STOCK_SWATCHES: Record<PaperStockId, {
  label: string;
  caption: string;
  lightBg: string;
  lightGrid: string;
  darkBg: string;
  darkGrid: string;
}> = {
  cream: {
    label: 'Field Cream',
    caption: 'Archival ivory',
    lightBg: '#fdfbf7',
    lightGrid: 'rgba(156, 163, 175, 0.35)',
    darkBg: '#1a1a1a',
    darkGrid: 'rgba(255, 255, 255, 0.14)',
  },
  blueprint: {
    label: 'Blueprint',
    caption: 'Cyanotype vellum',
    lightBg: '#edf5ff',
    lightGrid: 'rgba(37, 99, 235, 0.32)',
    darkBg: '#0b192c',
    darkGrid: 'rgba(125, 211, 252, 0.25)',
  },
  kraft: {
    label: 'Kraft Studio',
    caption: 'Warm tan stock',
    lightBg: '#f4ead8',
    lightGrid: 'rgba(140, 107, 67, 0.32)',
    darkBg: '#1e1813',
    darkGrid: 'rgba(243, 231, 213, 0.16)',
  },
  sage: {
    label: 'Sage Pad',
    caption: 'Engineering grid',
    lightBg: '#eef5ec',
    lightGrid: 'rgba(21, 128, 61, 0.28)',
    darkBg: '#101b15',
    darkGrid: 'rgba(110, 231, 183, 0.2)',
  },
} as const;

/** Push-pin colours on the projects sheet. Mirrors --color-pin-* in app/globals.css (parity-tested). */
export const PIN_COLORS = {
  red: '#e5534b',
  amber: '#f2b544',
  blue: '#4a8fe7',
} as const;

/** Shared motion vocabulary. CSS mirrors: --ease-paper/-paper-in/-standard and --dur-* in app/globals.css. */
export const MOTION = {
  ease: {
    paper: [0.22, 1, 0.36, 1],
    paperIn: [0.4, 0, 1, 1],
    standard: [0.4, 0, 0.2, 1],
  },
  durMs: { micro: 120, quick: 200, panel: 320, enter: 480 },
} as const;

/** Home featured-projects slideshow. Dwell/slide durations live in CSS (--carousel-dwell, --carousel-slide). */
export const FEATURED_CAROUSEL = {
  swipeMinPx: 48,
  swipeMinVelocity: 0.35,
  dragStartPx: 8,
  dragRotatePerPx: 0.02,
  visibleRatio: 0.5,
} as const;

/** Mobile dock: hides while reading down the page, returns on scroll-up or near the end. */
export const DOCK_TOKENS = {
  hideAfterPx: 160,
  scrollDeltaPx: 8,
  bottomRevealPx: 24,
} as const;

/** Matrix / escape-the-matrix palette (canvas rain, medals, toasts). */
export const MATRIX_COLORS = {
  glyph: '#10b981',
  lead: '#6ee7b7',
  void: '#020d08',
} as const;

/** Font stacks for canvas and SVG, where the next/font CSS variables cannot be used. */
export const FONT_STACKS = {
  mono: '"Fira Code", Menlo, monospace',
} as const;

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
    gentle: { stiffness: 300, damping: 30 },
    bouncy: { stiffness: 400, damping: 15 },
  },
  easing: {
    easeOut: 'easeOut' as const,
    smooth: [0.25, 0.1, 0.25, 1] as const,
    bounce: [0.34, 1.56, 0.64, 1] as const,
  },
} as const;

/** Framer presets for paper surfaces (shared Modal card, shortcuts overlay). Exits are short ease-in tweens so closing never lingers. */
const PAPER_EXIT = { duration: MOTION.durMs.quick / 1000, ease: MOTION.ease.paperIn } as const;

export const INTERACTION_TOKENS = {
  entrance: {
    fadeScaleRotate: {
      initial: { opacity: 0, scale: 0.85, y: 40, rotate: 2 },
      animate: { opacity: 1, scale: 1, y: 0, rotate: -1 },
    },
    /** Shortcuts Overlay entrance — notebook page pinning down */
    paperPin: {
      initial: { opacity: 0, scale: 0.92, y: -30, rotate: 2 },
      animate: { opacity: 1, scale: 1, y: 0, rotate: -0.8 },
    },
  },
  exit: {
    fadeScaleRotate: { opacity: 0, scale: 0.96, y: 12, rotate: 1, transition: PAPER_EXIT },
    /** Shortcuts Overlay exit — page unpin */
    paperUnpin: { opacity: 0, scale: 0.96, y: -12, rotate: 1, transition: PAPER_EXIT },
  },
} as const;

/** Shortcuts overlay and keyboard keycap tokens */
export const OVERLAY_TOKENS = {
  backdrop: { strong: 'bg-black/35 dark:bg-black/55 backdrop-blur-sm' },
  maxWidth: { shortcuts: '440px' },
  maxHeight: { shortcuts: 'min(70vh, 600px)' },
  kbdRadius: '6px 7px 5px 6px',
  kbdShadow: '1px 1px 0 0 var(--c-ink)',
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
  punctuation: 'text-gray-400',
  command: 'text-gray-100',
  output: 'text-gray-300/90',
  error: 'text-red-400',
  caret: 'caret-emerald-400',
  cursor: 'bg-emerald-400',
  placeholder: 'placeholder-gray-600',
  border: 'border-gray-700/50',
  headerBorder: 'border-gray-600/30',
  headerLabel: 'text-gray-400',
  art: 'bg-linear-to-b from-emerald-300 via-sky-300 to-violet-300',
  text: 'text-gray-200',
  scrollbarColor: 'rgba(156,163,175,0.6)',
} as const;

/** Navigation tab color profiles */
export const NAV_TAB_COLORS = {
  pink: { bg: PAPER_PALETTE.pink, text: 'text-red-900', border: 'border-red-300' },
  yellow: { bg: PAPER_PALETTE.yellow, text: 'text-yellow-900', border: 'border-yellow-300' },
  green: { bg: PAPER_PALETTE.green, text: 'text-green-900', border: 'border-green-300' },
  coral: { bg: PAPER_PALETTE.coral, text: 'text-orange-900', border: 'border-orange-300' },
} as const;

/** Feedback category color profiles */
export const FEEDBACK_COLORS = {
  bug: { bg: PAPER_PALETTE.pink, text: 'text-red-900', border: 'border-red-300' },
  idea: { bg: PAPER_PALETTE.amber, text: 'text-amber-900', border: 'border-amber-400' },
  kudos: { bg: PAPER_PALETTE.rose, text: 'text-pink-900', border: 'border-pink-300' },
  other: { bg: PAPER_PALETTE.green, text: 'text-green-900', border: 'border-green-300' },
} as const;

/** Social sidebar hover colors */
export const SOCIAL_COLORS = {
  github: 'hover:text-gray-800',
  linkedin: 'hover:text-blue-700',
  codeforces: 'hover:text-yellow-600',
  cpHistory: 'hover:text-amber-500',
  email: 'hover:text-red-600',
} as const;

/** Cursor trail rendering config */
export const CURSOR_TRAIL = {
  dark: { color: 'rgba(255,255,255,0.6)', lineWidth: 4 },
  light: { color: 'rgba(60,60,60,0.12)', lineWidth: 2 },
} as const;

/**
 * Z-Index Layer Stack — single source of truth for all global z-index values.
 *
 * Only global/fixed-position elements are tracked here. Local z-indexes
 * within a component's stacking context (e.g., z-10 between siblings inside
 * a card) use regular Tailwind classes and are NOT centralized.
 *
 * Layer hierarchy (lowest → highest):
 * ┌────────────────────────────────────────────────────────┐
 * │  cursor            10003   Custom pencil/chalk         │
 * │  contextMenu       10002   Desktop context menu        │
 * │  voice             10001   Native voice stage          │
 * │  matrixTransition  10000   Matrix escape / hint toast  │
 * │  matrixControls     9999   Matrix wake / escape buttons│
 * │  matrixSocial       9998   Mobile social in Matrix     │
 * │  matrixCanvas       9997   Matrix rain canvas          │
 * │  skipNav             200   Skip-to-content (focused)   │
 * │  modal               100   Full-screen modals (portal) │
 * │  nav                  50   Navigation, ThemeToggle     │
 * │  sidebar              40   SocialSidebar, FeedbackTab   │
 * │  binding              30   Stitched binding spine        │
 * │  crease               20   Crease / fold shadows         │
 * │  content              10   Main scrollable content       │
 * │  texture               1   Paper noise overlay           │
 * │  base                  0   Grid pattern, doodles         │
 * └────────────────────────────────────────────────────────┘
 */
export const Z_INDEX = {
  /** Background grid pattern and doodle illustrations */
  base: 0,
  /** Paper noise texture overlay */
  texture: 1,
  /** Main scrollable content area */
  content: 10,
  /** Crease shadow near the binding spine */
  crease: 20,
  /** Stitched binding sidebar spine */
  binding: 30,
  /** Social sidebar links, Feedback trigger button */
  sidebar: 40,
  /** Navigation header, Theme toggle */
  nav: 50,
  /** Full-screen modals — portaled to document.body (project detail, feedback, etc.) */
  modal: 100,
  /** Skip-to-main-content link when focused */
  skipNav: 200,
  /** Full-screen matrix rain canvas overlay */
  matrixCanvas: 9997,
  /** Mobile social bar under matrix overlay — above canvas, below matrix controls */
  matrixSocial: 9998,
  /** Matrix UI buttons (WAKE UP, ESCAPE) */
  matrixControls: 9999,
  /** Matrix escape transition and hint toast — below voice stage */
  matrixTransition: 10000,
  /** Native voice stage — above matrix, below the desktop context menu */
  voice: 10001,
  /** Desktop context menu, above full-screen effects but below the custom cursor */
  contextMenu: 10002,
  /** Custom cursor — always topmost */
  cursor: 10003,
} as const;

/** Shadow tokens */
export const SHADOW_TOKENS = {
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
  /** Small dog-ear on taped sticky notes. */
  noteFold: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.14) 50%)',
} as const;

/** Grid pattern background config */
export const GRID_PATTERN = {
  backgroundSize: '100px 100px',
  lineWidth: '1px',
} as const;

/**
 * Projects wall, cycled by tile index. Uneven list lengths keep neighbouring notes from repeating.
 * rotations/photoRotations are degrees (phones scale them by --c-project-compact); tapePositions are % from the left.
 * foldSize is the corner fold in px shared with the error and not-found notes.
 */
export const PROJECT_TOKENS = {
  rotations: [-2, 1.5, -1, 2.25, -1.5, 1],
  photoRotations: [-2.5, 2, -1.5, 3, -1],
  tapePositions: [40, 62, 34, 55, 68, 46, 30],
  /** Vertical nudge in px on the multi-column wall so rows do not line up like a table. */
  drops: [0, 14, 4, 18, 8, 0, 12, 2],
  foldSize: 30,
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

/** Chat nav tab spring positions */
export const NAV_POSITIONS = {
  active: -5,
  hovered: -10,
  default: -25,
} as const;

/** Guestbook wall note rotation range (wider than chat notes) */
export const WALL_NOTE_ROTATION = { minDeg: -5, rangeDeg: 10 } as const;

/**
 * Guestbook note accent border — single shared class. The previous hash-indexed
 * palette cycled through yellow/blue/green/purple/orange borders paired with
 * matching --note-* CSS variables that all resolved to the same hex, so the
 * "color rotation" produced zero visible variety. Collapsed to one token.
 */
export const GUESTBOOK_NOTE_BORDER = 'border-yellow-400/30' as const;

/** Guestbook limits and pagination tokens */
export const GUESTBOOK_LIMITS = {
  minMessageLength: 5,
  maxMessageLength: 300,
  minNameLength: 2,
  maxNameLength: 40,
  notesPerPage: 40,
  entranceStaggerMs: 40,
  entranceStaggerCapMs: 480,
} as const;

/** Guestbook animation tokens */
export const GUESTBOOK_ANIMATION = {
  flyToWall: { y: -200, rotate: 8, scale: 0.85, opacity: 0, duration: 0.7 },
  toastAutoDismissMs: 3500,
} as const;

/** Sticker color families — background + ink pairs for the 6 palettes */
export const STICKER_FAMILIES = {
  sunshine: { bg: PAPER_PALETTE.yellow, ink: '#5d4037' },
  denim: { bg: PAPER_PALETTE.blue, ink: '#0c4a6e' },
  mint: { bg: PAPER_PALETTE.green, ink: '#14532d' },
  coral: { bg: PAPER_PALETTE.coral, ink: '#7c2d12' },
  rose: { bg: PAPER_PALETTE.rose, ink: '#831843' },
  lavender: { bg: PAPER_PALETTE.lavender, ink: '#581c87' },
} as const;

export type StickerFamily = keyof typeof STICKER_FAMILIES;

/** Sticker sizing + stroke tokens for SVG rendering */
export const STICKER_TOKENS = {
  size: { toast: 48, card: 60, hover: 80 },
  strokeWidth: 2.5,
  rotation: { min: -4, max: 4 },
} as const;

/** Sticker toast queue timing */
export const STICKER_TIMING = {
  toastDuration: 3000,
  toastGap: 500,
  toastMaxInQueue: 4,
} as const;

/**
 * Voice-call sound design (lib/voiceSounds.ts), synthesized with Web Audio. Gains are linear
 * amplitudes at full voiceAgent volume; `*Tau` values are exponential time constants in seconds.
 */
export const VOICE_SOUND_TOKENS = {
  /** Cues start this far ahead of the audio clock so every envelope begins from silence on time. */
  leadSec: 0.01,
  volumeTau: 0.02,
  /** Suspend the audio thread this long after the last tail has died away. */
  idleSuspendMs: 1500,
  /** Small synthetic room on the cues (not the bed), so they bloom instead of sounding like test tones. */
  room: { seconds: 1.4, decayTau: 0.28, damping: 0.35, send: 0.3 },
  chime: {
    /** Rising fifth D5 to A5 on connect; the same fifth falling on hang-up (Hz). */
    connect: [587.33, 880],
    hangup: [880, 587.33],
    noteGapSec: 0.13,
    attackSec: 0.012,
    peak: 0.07,
    /** [frequency ratio, relative gain, decay tau]: a warm fundamental with short mallet partials. */
    partials: [[1, 1, 0.4], [2, 0.2, 0.12], [4, 0.05, 0.04]],
    /** A new chime fades out one that is still ringing instead of stacking on it. */
    stealSec: 0.05,
  },
  action: { fromHz: 1320, toHz: 990, glideSec: 0.04, attackSec: 0.004, tau: 0.045, peak: 0.04, minIntervalMs: 400 },
  ambient: {
    level: 0.075,
    highpassHz: 90,
    lowpassHz: 450,
    loopSec: 3,
    /** Speed of a second reader of the same loop; an irrational ratio never lines up, so nothing audibly repeats. */
    driftRate: 0.7937,
    breathHz: 0.06,
    breathDepth: 0.3,
    delaySec: 0.35,
    fadeInTau: 0.5,
    fadeOutSec: 0.8,
    /** Level multiplier while the agent speaks; the release waits out short gaps between sentences. */
    duckRatio: 0.3,
    duckAttackTau: 0.05,
    duckReleaseTau: 0.3,
    duckHoldMs: 400,
  },
} as const;

export const VOICE_ORB_TOKENS = {
  attackMs: 60,
  releaseMs: 220,
  /** Longest frame step the level smoother integrates, so a backgrounded tab cannot jump on return. */
  maxStepMs: 64,
  epsilon: 0.002,
  levelScale: 0.14,
  flareOpacity: 0.6,
  /** Ring spin multipliers; changed via playbackRate so rings speed up without jumping. */
  ringRate: { thinking: 3, acting: 4 },
} as const;

export const VOICE_VEIL_TOKENS = {
  introMs: 360,
  dockMs: 480,
  morphMs: 520,
  morphEasing: 'cubic-bezier(0.22,1,0.36,1)',
  introExitMs: 320,
  dockExitMs: 460,
  teardownMarginMs: 160,
} as const;

