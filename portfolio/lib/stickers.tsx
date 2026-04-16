/**
 * Sticker system — the 12 achievement stickers, their metadata, and SVG renderer.
 *
 * Usage:
 *   import { STICKER_ROSTER, StickerSvg, type StickerId } from '@/lib/stickers';
 *   stickerBus.emit('first-word'); // unlock a sticker
 *   <StickerSvg id="first-word" size={60} />
 *
 * Scope notes:
 *   - 3 stickers ship with fully-illustrated SVGs (`first-word`, `theme-flipper`,
 *     `page-turner`). The remaining 9 render a family-colored placeholder —
 *     rounded rectangle with the sticker's first initial. Art can be filled in
 *     later by editing the switch in <StickerSvg>.
 */
import { memo } from 'react';
import { STICKER_FAMILIES, STICKER_TOKENS, type StickerFamily } from '@/lib/designTokens';

// ─── Roster ─────────────────────────────────────────────────────────────
export const STICKER_ROSTER = [
  { id: 'first-word',       label: 'The First Word',        description: 'Typed your first terminal command.',         hint: "there's a terminal somewhere...",    family: 'sunshine' },
  { id: 'help-wanted',      label: 'Help Wanted',           description: 'You asked for help — points for humility.',   hint: 'when in doubt...',                   family: 'sunshine' },
  { id: 'stand-up-comic',   label: 'Stand-Up',              description: 'Pulled a joke from the wire.',                hint: 'laughter is the best... terminal',   family: 'rose' },
  { id: 'theme-flipper',    label: 'Lights On, Lights Off', description: 'Flipped between day and night.',              hint: 'day and night...',                   family: 'lavender' },
  { id: 'note-sender',      label: 'Pen Pal',               description: 'Sent a note via feedback.',                   hint: 'sometimes you just want to write.',  family: 'mint' },
  { id: 'page-turner',      label: 'The Whole Tour',        description: 'Visited every page on the site.',             hint: 'every corner, every page...',        family: 'denim' },
  { id: 'note-passer',      label: 'Paper Trail',           description: 'Popped the mini chat open.',                  hint: 'a quick word on the way out...',     family: 'mint' },
  { id: 'long-read',        label: 'The Long Read',         description: 'Spent time with the resume.',                 hint: 'due diligence rewards patience...',  family: 'denim' },
  { id: 'full-chat',        label: 'Serious Chat',          description: 'Had a real chat on the chat page.',           hint: 'some conversations need more space.',family: 'mint' },
  { id: 'konami',           label: 'The Code',              description: '↑ ↑ ↓ ↓ ← → ← → B A',                         hint: 'old-school cheat code...',           family: 'lavender' },
  { id: 'night-owl',        label: 'Night Owl',             description: 'Stopped by after the moon rose.',             hint: 'when the stars come out...',         family: 'lavender' },
  { id: 'signed-guestbook', label: 'Left a Mark',           description: 'Pinned a note to the guestbook.',             hint: 'leave your mark...',                  family: 'mint' },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  hint: string;
  family: StickerFamily;
}>;

export type StickerId = typeof STICKER_ROSTER[number]['id'];
export type StickerEntry = typeof STICKER_ROSTER[number];

const STICKER_LOOKUP: Record<StickerId, StickerEntry> = STICKER_ROSTER.reduce(
  (acc, sticker) => {
    acc[sticker.id] = sticker;
    return acc;
  },
  {} as Record<StickerId, StickerEntry>,
);

export function getSticker(id: StickerId): StickerEntry {
  return STICKER_LOOKUP[id];
}

export const STICKER_TOTAL = STICKER_ROSTER.length;

// ─── Deterministic hashing helpers (for stable per-sticker rotation / stagger) ───
export function hashStickerId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Hash-seeded rotation between STICKER_TOKENS.rotation.min and .max */
export function rotationForId(id: string): number {
  const { min, max } = STICKER_TOKENS.rotation;
  const range = max - min;
  const h = hashStickerId(id);
  return min + (h % (range * 100)) / 100;
}

// ─── Illustrated SVG components ─────────────────────────────────────────
interface IllustratedSvgProps {
  size: number;
}

/**
 * First Word — a tiny terminal window doodle on sunshine yellow.
 * The ">_" prompt suggests the first command typed.
 */
const FirstWordSvg = memo(function FirstWordSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.sunshine;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      <rect x="14" y="20" width="32" height="22" rx="2" ry="2" fill="#2d2a2e" stroke={family.ink} strokeWidth="1.6" />
      <circle cx="17.5" cy="23.5" r="1.2" fill="#ff6b6b" />
      <circle cx="21.5" cy="23.5" r="1.2" fill="#ffd166" />
      <circle cx="25.5" cy="23.5" r="1.2" fill="#8ce99a" />
      <path d="M18 32 L23 35 L18 38" fill="none" stroke="#8ce99a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="26" y1="38" x2="36" y2="38" stroke="#8ce99a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
});

/**
 * Theme Flipper — a half-sun / half-moon split on lavender.
 * Represents switching between light and dark modes.
 */
const ThemeFlipperSvg = memo(function ThemeFlipperSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.lavender;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Sun half (left) */}
      <path d="M30 16 A14 14 0 0 0 30 44 Z" fill="#fde68a" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="17" y1="30" x2="12" y2="30" stroke={family.ink} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="19.5" y1="20.5" x2="16" y2="17" stroke={family.ink} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="19.5" y1="39.5" x2="16" y2="43" stroke={family.ink} strokeWidth="1.6" strokeLinecap="round" />
      {/* Moon half (right) */}
      <path d="M30 16 A14 14 0 0 1 30 44 A10 10 0 0 0 30 16 Z" fill="#581c87" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="35" cy="22" r="1.2" fill="#fde68a" />
      <circle cx="38" cy="30" r="1" fill="#fde68a" />
      <circle cx="35" cy="38" r="1.2" fill="#fde68a" />
    </svg>
  );
});

/**
 * Page Turner — a stack of pages being turned, on denim blue.
 * Signals completion of the full site tour.
 */
const PageTurnerSvg = memo(function PageTurnerSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.denim;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Back page */}
      <rect x="18" y="18" width="20" height="26" rx="1" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="22" y1="24" x2="34" y2="24" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <line x1="22" y1="28" x2="32" y2="28" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <line x1="22" y1="32" x2="30" y2="32" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      {/* Turning page */}
      <path d="M38 18 Q46 28 42 44 L38 44 Z" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M38 18 Q46 28 42 44" fill="none" stroke={family.ink} strokeWidth="1.6" strokeLinecap="round" />
      {/* Motion lines */}
      <path d="M44 22 L48 20" stroke={family.ink} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <path d="M46 28 L50 27" stroke={family.ink} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
});

/**
 * Strip a leading "the" from a label (case-insensitive) before picking the
 * placeholder initial, so stickers like "The Code" and "The Long Read" don't
 * all collapse to a single "T" glyph.
 */
function pickInitial(label: string): string {
  const stripped = label.replace(/^the\s+/i, '').trim();
  return (stripped.charAt(0) || label.charAt(0) || '?').toUpperCase();
}

// ─── Placeholder (used for the 9 stickers without custom art) ───────────
const PlaceholderSvg = memo(function PlaceholderSvg({
  size,
  family,
  initial,
}: {
  size: number;
  family: StickerFamily;
  initial: string;
}) {
  const palette = STICKER_FAMILIES[family];
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect
        x="4"
        y="4"
        width="52"
        height="52"
        rx="12"
        ry="12"
        fill={palette.bg}
        stroke={palette.ink}
        strokeWidth={STICKER_TOKENS.strokeWidth}
        strokeLinejoin="round"
      />
      <text
        x="30"
        y="40"
        textAnchor="middle"
        fontFamily="var(--font-hand), cursive"
        fontSize="30"
        fontWeight="700"
        fill={palette.ink}
      >
        {initial}
      </text>
    </svg>
  );
});

// ─── Public Sticker component — switches on id, renders illustrated or placeholder ───
interface StickerSvgProps {
  id: StickerId;
  size?: number;
  className?: string;
}

const DROP_SHADOW_STYLE = { filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.12))' } as const;

export const StickerSvg = memo(function StickerSvg({ id, size = STICKER_TOKENS.size.card, className }: StickerSvgProps) {
  let inner: React.ReactNode;
  switch (id) {
    case 'first-word':
      inner = <FirstWordSvg size={size} />;
      break;
    case 'theme-flipper':
      inner = <ThemeFlipperSvg size={size} />;
      break;
    case 'page-turner':
      inner = <PageTurnerSvg size={size} />;
      break;
    default: {
      const entry = getSticker(id);
      const initial = pickInitial(entry.label);
      inner = <PlaceholderSvg size={size} family={entry.family} initial={initial} />;
      break;
    }
  }
  return (
    <span
      className={className}
      style={DROP_SHADOW_STYLE}
      aria-hidden="true"
    >
      {inner}
    </span>
  );
});

/**
 * Small glyph — three overlapping circles used by StickerGlanceBadge.
 * Independent of roster; pure decoration.
 */
export const StickerStackGlyph = memo(function StickerStackGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="9" cy="10" r="6.5" fill={STICKER_FAMILIES.denim.bg} stroke={STICKER_FAMILIES.denim.ink} strokeWidth="1.5" />
      <circle cx="15" cy="13" r="6.5" fill={STICKER_FAMILIES.sunshine.bg} stroke={STICKER_FAMILIES.sunshine.ink} strokeWidth="1.5" />
      <circle cx="12" cy="17" r="5.5" fill={STICKER_FAMILIES.rose.bg} stroke={STICKER_FAMILIES.rose.ink} strokeWidth="1.5" />
    </svg>
  );
});
