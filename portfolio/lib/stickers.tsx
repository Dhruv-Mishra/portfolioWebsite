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
  { id: 'first-word',       label: 'The First Word',        description: 'Typed your first terminal command.',         hint: 'the terminal is lonely — give it any command.',  family: 'sunshine' },
  { id: 'help-wanted',      label: 'Help Wanted',           description: 'You asked for help — points for humility.',   hint: 'stuck? the terminal has a command for that.',    family: 'sunshine' },
  { id: 'stand-up-comic',   label: 'Stand-Up',              description: 'Pulled a joke from the wire.',                hint: 'ask the terminal to tell you a joke.',           family: 'rose' },
  { id: 'theme-flipper',    label: 'Lights On, Lights Off', description: 'Flipped between day and night.',              hint: 'toggle the theme — look for a sun or moon.',     family: 'lavender' },
  { id: 'note-sender',      label: 'Pen Pal',               description: 'Sent a note via feedback.',                   hint: 'send some real feedback — the floating icon.',   family: 'mint' },
  { id: 'page-turner',      label: 'The Whole Tour',        description: 'Visited every page on the site.',             hint: 'visit every page on the site — all of them.',    family: 'denim' },
  { id: 'note-passer',      label: 'Paper Trail',           description: 'Popped the mini chat open.',                  hint: 'open the little floating chat bubble.',          family: 'mint' },
  { id: 'long-read',        label: 'The Long Read',         description: 'Spent time with the resume.',                 hint: 'sit with the resume page for a minute.',         family: 'denim' },
  { id: 'full-chat',        label: 'Serious Chat',          description: 'Had a real chat on the chat page.',           hint: 'open the full chat page (not the mini one).',    family: 'mint' },
  { id: 'konami',           label: 'The Code',              description: '↑ ↑ ↓ ↓ ← → ← → B A',                         hint: 'an old-school arcade sequence...',               family: 'lavender' },
  { id: 'night-owl',        label: 'Night Owl',             description: 'Stopped by after the moon rose.',             hint: 'show up after the clock strikes midnight.',      family: 'lavender' },
  { id: 'signed-guestbook', label: 'Left a Mark',           description: 'Pinned a note to the guestbook.',             hint: 'sign the guestbook — leave a note on the wall.', family: 'mint' },
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
 * Page Turner — a globe with a plane orbiting around it, on denim blue.
 * Represents touring every page on the site.
 */
const PageTurnerSvg = memo(function PageTurnerSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.denim;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Globe */}
      <circle cx="26" cy="32" r="12" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" />
      {/* Meridian + equator */}
      <line x1="26" y1="20" x2="26" y2="44" stroke={family.ink} strokeWidth="1.1" opacity="0.45" />
      <ellipse cx="26" cy="32" rx="12" ry="4.5" fill="none" stroke={family.ink} strokeWidth="1.1" opacity="0.45" />
      <ellipse cx="26" cy="32" rx="5.5" ry="12" fill="none" stroke={family.ink} strokeWidth="1.1" opacity="0.45" />
      {/* Continent blobs */}
      <path d="M20 27 Q23 24 27 26 Q28 30 24 32 Q20 31 20 27" fill={family.ink} opacity="0.55" />
      <path d="M29 36 Q32 35 34 38 Q33 40 30 39 Z" fill={family.ink} opacity="0.55" />
      {/* Plane flying in upper-right */}
      <path d="M41 16 L48 13 L46 18 L50 18 L46 22 L40 22 Z" fill={family.ink} strokeLinejoin="round" />
      {/* Curved orbit trail */}
      <path d="M40 20 Q50 22 48 32" fill="none" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 2" opacity="0.55" />
    </svg>
  );
});

/**
 * Help Wanted — speech bubble with a bold question mark on sunshine yellow.
 */
const HelpWantedSvg = memo(function HelpWantedSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.sunshine;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Speech bubble */}
      <path d="M14 22 Q14 16 20 16 L40 16 Q46 16 46 22 L46 34 Q46 40 40 40 L28 40 L22 45 L23 40 L20 40 Q14 40 14 34 Z" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* ? curve */}
      <path d="M25 24 Q25 20 30 20 Q35 20 35 24 Q35 27 31 29 L31 33" fill="none" stroke={family.ink} strokeWidth="2.2" strokeLinecap="round" />
      {/* ? dot */}
      <circle cx="31" cy="37" r="1.6" fill={family.ink} />
    </svg>
  );
});

/**
 * Stand-Up Comic — a microphone on its stand with sound waves, on rose.
 */
const StandUpComicSvg = memo(function StandUpComicSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.rose;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Mic head */}
      <rect x="24" y="14" width="12" height="20" rx="6" ry="6" fill={family.ink} strokeLinejoin="round" />
      {/* Mic grille lines */}
      <line x1="26" y1="20" x2="34" y2="20" stroke={family.bg} strokeWidth="0.9" opacity="0.8" />
      <line x1="26" y1="24" x2="34" y2="24" stroke={family.bg} strokeWidth="0.9" opacity="0.8" />
      <line x1="26" y1="28" x2="34" y2="28" stroke={family.bg} strokeWidth="0.9" opacity="0.8" />
      {/* Cradle */}
      <path d="M20 30 Q20 40 30 40 Q40 40 40 30" fill="none" stroke={family.ink} strokeWidth="1.8" strokeLinecap="round" />
      {/* Stand */}
      <line x1="30" y1="40" x2="30" y2="46" stroke={family.ink} strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="46" x2="36" y2="46" stroke={family.ink} strokeWidth="2" strokeLinecap="round" />
      {/* Sound waves */}
      <path d="M15 22 Q12 26 15 30" fill="none" stroke={family.ink} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <path d="M45 22 Q48 26 45 30" fill="none" stroke={family.ink} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
});

/**
 * Note Sender — a paper airplane in flight, on mint green.
 */
const NoteSenderSvg = memo(function NoteSenderSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.mint;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Airplane body (flattened triangle with fold) */}
      <path d="M13 30 L48 14 L40 44 L30 34 Z" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Inner fold line */}
      <path d="M13 30 L30 34 L48 14" fill="none" stroke={family.ink} strokeWidth="1.3" strokeLinecap="round" opacity="0.75" />
      {/* Trail dashes */}
      <path d="M12 36 Q18 37 24 37" fill="none" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.5 2.5" opacity="0.55" />
      <path d="M14 42 Q20 42 26 42" fill="none" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.5 2.5" opacity="0.4" />
    </svg>
  );
});

/**
 * Note Passer — a folded sticky note with a pencil laid across, on mint.
 */
const NotePasserSvg = memo(function NotePasserSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.mint;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Sticky note */}
      <rect x="14" y="20" width="26" height="26" rx="1" fill="#fff9c4" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Folded corner */}
      <path d="M34 40 L40 40 L40 46 Z" fill="#e7d77a" stroke={family.ink} strokeWidth="1.2" strokeLinejoin="round" />
      {/* Ruled lines */}
      <line x1="18" y1="28" x2="34" y2="28" stroke={family.ink} strokeWidth="1" opacity="0.4" />
      <line x1="18" y1="33" x2="32" y2="33" stroke={family.ink} strokeWidth="1" opacity="0.4" />
      <line x1="18" y1="38" x2="30" y2="38" stroke={family.ink} strokeWidth="1" opacity="0.4" />
      {/* Pencil laid diagonally */}
      <line x1="36" y1="14" x2="48" y2="26" stroke="#f59e0b" strokeWidth="3.6" strokeLinecap="round" />
      <line x1="35" y1="13" x2="38" y2="16" stroke={family.ink} strokeWidth="3" strokeLinecap="round" />
      <line x1="47" y1="25" x2="49" y2="27" stroke="#fb7185" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
});

/**
 * Long Read — reading glasses laid across an open page, on denim blue.
 */
const LongReadSvg = memo(function LongReadSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.denim;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Page */}
      <rect x="14" y="14" width="32" height="32" rx="1" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Text lines (top half) */}
      <line x1="18" y1="20" x2="42" y2="20" stroke={family.ink} strokeWidth="1.1" opacity="0.35" />
      <line x1="18" y1="24" x2="40" y2="24" stroke={family.ink} strokeWidth="1.1" opacity="0.35" />
      <line x1="18" y1="28" x2="42" y2="28" stroke={family.ink} strokeWidth="1.1" opacity="0.35" />
      {/* Reading glasses over lower text */}
      <circle cx="22" cy="38" r="5.5" fill="none" stroke={family.ink} strokeWidth="2" />
      <circle cx="38" cy="38" r="5.5" fill="none" stroke={family.ink} strokeWidth="2" />
      <line x1="27.5" y1="38" x2="32.5" y2="38" stroke={family.ink} strokeWidth="2" strokeLinecap="round" />
      <line x1="16.5" y1="38" x2="14" y2="38" stroke={family.ink} strokeWidth="2" strokeLinecap="round" />
      <line x1="43.5" y1="38" x2="46" y2="38" stroke={family.ink} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
});

/**
 * Full Chat — two overlapping speech bubbles mid-conversation, on mint.
 */
const FullChatSvg = memo(function FullChatSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.mint;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Back bubble */}
      <path d="M12 18 Q12 14 16 14 L34 14 Q38 14 38 18 L38 26 Q38 30 34 30 L22 30 L17 34 L18 30 Q12 30 12 26 Z" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Front bubble (bigger, right) */}
      <path d="M24 32 Q24 28 28 28 L46 28 Q50 28 50 32 L50 40 Q50 44 46 44 L40 44 L44 48 L37 44 Q24 44 24 40 Z" fill={family.ink} strokeLinejoin="round" />
      {/* Typing dots in front bubble */}
      <circle cx="32" cy="36" r="1.6" fill={family.bg} />
      <circle cx="37" cy="36" r="1.6" fill={family.bg} />
      <circle cx="42" cy="36" r="1.6" fill={family.bg} />
    </svg>
  );
});

/**
 * Konami — a retro gamepad with D-pad and two face buttons, on lavender.
 */
const KonamiSvg = memo(function KonamiSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.lavender;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Controller body */}
      <rect x="10" y="22" width="40" height="18" rx="4" fill={family.ink} strokeLinejoin="round" />
      {/* Side grips */}
      <circle cx="13" cy="40" r="4" fill={family.ink} />
      <circle cx="47" cy="40" r="4" fill={family.ink} />
      {/* D-pad cross (left) */}
      <rect x="15" y="29" width="10" height="4" rx="0.5" fill={family.bg} />
      <rect x="18" y="26" width="4" height="10" rx="0.5" fill={family.bg} />
      {/* A button (yellow) */}
      <circle cx="39" cy="28" r="2.8" fill="#fde047" stroke={family.bg} strokeWidth="0.8" />
      {/* B button (pink) */}
      <circle cx="44" cy="33" r="2.8" fill="#fb7185" stroke={family.bg} strokeWidth="0.8" />
      {/* Select / Start bars */}
      <line x1="27" y1="37" x2="30" y2="37" stroke={family.bg} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="32" y1="37" x2="35" y2="37" stroke={family.bg} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
});

/**
 * Night Owl — an owl with a crescent moon, on lavender.
 */
const NightOwlSvg = memo(function NightOwlSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.lavender;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Crescent moon */}
      <path d="M44 14 A5 5 0 1 0 48 19 A3.5 3.5 0 0 1 44 14 Z" fill="#fde047" stroke={family.ink} strokeWidth="1.2" strokeLinejoin="round" />
      {/* Owl body */}
      <ellipse cx="27" cy="34" rx="12" ry="13" fill="#a78bfa" stroke={family.ink} strokeWidth="1.8" />
      {/* Ear tufts */}
      <path d="M20 23 L18 16 L24 21 Z" fill="#a78bfa" stroke={family.ink} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M34 23 L36 16 L30 21 Z" fill="#a78bfa" stroke={family.ink} strokeWidth="1.4" strokeLinejoin="round" />
      {/* Belly lighter patch */}
      <ellipse cx="27" cy="38" rx="6" ry="6" fill="#e9d5ff" opacity="0.7" />
      {/* Eyes */}
      <circle cx="22" cy="30" r="3.4" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.2" />
      <circle cx="32" cy="30" r="3.4" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.2" />
      <circle cx="22" cy="30" r="1.4" fill={family.ink} />
      <circle cx="32" cy="30" r="1.4" fill={family.ink} />
      {/* Beak */}
      <path d="M25 33 L29 33 L27 36 Z" fill="#fb923c" stroke={family.ink} strokeWidth="1" strokeLinejoin="round" />
      {/* Wing hint */}
      <path d="M18 36 Q17 42 22 45" fill="none" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
});

/**
 * Signed Guestbook — a quill signing a paper with a scrawled line, on mint.
 */
const SignedGuestbookSvg = memo(function SignedGuestbookSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.mint;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Paper */}
      <rect x="10" y="22" width="32" height="22" rx="1" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Signature squiggle */}
      <path d="M14 32 Q18 28 22 32 T30 34 L36 34" fill="none" stroke={family.ink} strokeWidth="2" strokeLinecap="round" />
      {/* Signature line beneath */}
      <line x1="14" y1="40" x2="38" y2="40" stroke={family.ink} strokeWidth="1" opacity="0.4" />
      {/* Quill (feather + nib) */}
      <path d="M44 12 Q52 14 50 22 Q44 26 38 26 L36 24 Q38 18 44 12 Z" fill="#e9d5ff" stroke={family.ink} strokeWidth="1.4" strokeLinejoin="round" />
      {/* Feather barbs */}
      <path d="M44 14 L41 17" stroke={family.ink} strokeWidth="0.8" opacity="0.55" />
      <path d="M46 17 L42 20" stroke={family.ink} strokeWidth="0.8" opacity="0.55" />
      <path d="M48 20 L44 23" stroke={family.ink} strokeWidth="0.8" opacity="0.55" />
      {/* Nib */}
      <line x1="36" y1="24" x2="32" y2="28" stroke={family.ink} strokeWidth="1.8" strokeLinecap="round" />
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

/**
 * Perf note: the previous implementation wrapped the SVG in a span with
 *   `filter: drop-shadow(1px 2px 0 rgba(0,0,0,0.12))`.
 * On the sticker album page each card also runs a transform animation, which
 * combined with `filter` forces a full repaint per frame. The card container
 * already carries a Tailwind `shadow-md`, so the die-cut lift is preserved
 * via box-shadow on a non-transforming ancestor — no filter cost.
 */
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
    case 'help-wanted':
      inner = <HelpWantedSvg size={size} />;
      break;
    case 'stand-up-comic':
      inner = <StandUpComicSvg size={size} />;
      break;
    case 'note-sender':
      inner = <NoteSenderSvg size={size} />;
      break;
    case 'note-passer':
      inner = <NotePasserSvg size={size} />;
      break;
    case 'long-read':
      inner = <LongReadSvg size={size} />;
      break;
    case 'full-chat':
      inner = <FullChatSvg size={size} />;
      break;
    case 'konami':
      inner = <KonamiSvg size={size} />;
      break;
    case 'night-owl':
      inner = <NightOwlSvg size={size} />;
      break;
    case 'signed-guestbook':
      inner = <SignedGuestbookSvg size={size} />;
      break;
    default: {
      // Fallback placeholder — only reached if a new sticker is added to the
      // roster without a matching case above. Keeps the build safe.
      const entry = getSticker(id);
      const initial = pickInitial(entry.label);
      inner = <PlaceholderSvg size={size} family={entry.family} initial={initial} />;
      break;
    }
  }
  return (
    <span className={className} aria-hidden="true">
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
