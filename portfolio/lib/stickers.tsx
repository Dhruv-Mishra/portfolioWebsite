/**
 * Sticker system — the achievement stickers, their metadata, and SVG renderer.
 *
 * Usage:
 *   import { STICKER_ROSTER, StickerSvg, type StickerId } from '@/lib/stickers';
 *   stickerBus.emit('first-word'); // unlock a sticker
 *   <StickerSvg id="first-word" size={60} />
 *
 * Roster:
 *   21 regular stickers cover every major feature / surface on the site so the
 *   collection acts as a feature-discovery trail. The hidden `superuser` sticker
 *   is not exposed on the album until it is earned — awarded automatically the
 *   moment the user owns every regular sticker.
 */
import { memo } from 'react';
import { STICKER_FAMILIES, STICKER_TOKENS, type StickerFamily } from '@/lib/designTokens';

// ─── Roster ─────────────────────────────────────────────────────────────
export const STICKER_ROSTER = [
  { id: 'first-word',       label: 'The First Word',        description: 'Typed your first terminal command.',         hint: 'the terminal is lonely — give it any command.',   family: 'sunshine' },
  { id: 'help-wanted',      label: 'Help Wanted',           description: 'You asked for help — points for humility.',   hint: 'stuck? the terminal has a command for that.',     family: 'sunshine' },
  { id: 'stand-up-comic',   label: 'Stand-Up',              description: 'Pulled a joke from the wire.',                hint: 'ask the terminal to tell you a joke.',            family: 'rose' },
  { id: 'theme-flipper',    label: 'Lights On, Lights Off', description: 'Flipped between day and night.',              hint: 'toggle the theme — look for a sun or moon.',      family: 'lavender' },
  { id: 'note-sender',      label: 'Pen Pal',               description: 'Sent a note via feedback.',                   hint: 'send some real feedback — the floating icon.',    family: 'mint' },
  { id: 'page-turner',      label: 'The Whole Tour',        description: 'Visited every page on the site.',             hint: 'visit every page on the site — all of them.',     family: 'denim' },
  { id: 'note-passer',      label: 'Paper Trail',           description: 'Popped the mini chat open.',                  hint: 'open the little floating chat bubble.',           family: 'mint' },
  { id: 'long-read',        label: 'The Long Read',         description: 'Spent time with the resume.',                 hint: 'sit with the resume page for a minute.',          family: 'denim' },
  { id: 'full-chat',        label: 'Serious Chat',          description: 'Had a real chat on the chat page.',           hint: 'open the full chat page (not the mini one).',     family: 'mint' },
  { id: 'konami',           label: 'The Code',              description: '↑ ↑ ↓ ↓ ← → ← → B A',                         hint: 'an old-school arcade sequence...',                family: 'lavender' },
  { id: 'night-owl',        label: 'Night Owl',             description: 'Stopped by after the moon rose.',             hint: 'show up after the clock strikes midnight.',       family: 'lavender' },
  { id: 'signed-guestbook', label: 'Left a Mark',           description: 'Pinned a note to the guestbook.',             hint: 'sign the guestbook — leave a note on the wall.',  family: 'mint' },
  { id: 'project-explorer', label: 'Case Files',            description: 'Opened every project note.',                  hint: 'every project has more to say — tap them all.',   family: 'coral' },
  { id: 'cheat-codes',      label: 'Cheat Codes',           description: 'Peeked at the sticker cheatsheet.',           hint: 'the terminal has a privileged cheatsheet ~',      family: 'sunshine' },
  { id: 'drawer-dweller',   label: 'Drawer Dweller',        description: 'Wandered into the sticker drawer.',           hint: 'there is a whole room for these stickers ~',      family: 'rose' },
  { id: 'chat-conductor',   label: 'Chat Conductor',        description: 'Let chat-me steer the ship.',                 hint: 'ask the chat to actually *do* something.',        family: 'mint' },
  { id: 'terminal-addict',  label: 'Terminal Addict',       description: 'Ran five different terminal commands.',       hint: 'five different commands in one visit ~',          family: 'sunshine' },
  { id: 'repo-hunter',      label: 'Repo Hunter',           description: 'Followed a project back to its source.',      hint: 'source code lives a click away from each card.',  family: 'denim' },
  { id: 'social-butterfly', label: 'Social Butterfly',      description: 'Tapped one of the social links.',             hint: 'the links along the edge go somewhere ~',         family: 'rose' },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  hint: string;
  family: StickerFamily;
}>;

/**
 * Hidden "Superuser" sticker — not part of STICKER_ROSTER so the album doesn't
 * reveal it. Earned automatically once every sticker in STICKER_ROSTER is
 * unlocked. Once earned, a matching tile is appended to the album grid and
 * `sudo` commands become available in the terminal.
 */
export const SUPERUSER_STICKER = {
  id: 'superuser',
  label: 'Superuser',
  description: 'Earned root. Every sticker collected.',
  hint: '???',
  family: 'sunshine',
} as const satisfies {
  id: 'superuser';
  label: string;
  description: string;
  hint: string;
  family: StickerFamily;
};

export type SuperuserId = typeof SUPERUSER_STICKER.id;
export type RegularStickerId = typeof STICKER_ROSTER[number]['id'];
export type StickerId = RegularStickerId | SuperuserId;
export type StickerEntry = typeof STICKER_ROSTER[number] | typeof SUPERUSER_STICKER;

const STICKER_LOOKUP: Record<StickerId, StickerEntry> = {
  ...STICKER_ROSTER.reduce(
    (acc, sticker) => {
      acc[sticker.id] = sticker;
      return acc;
    },
    {} as Record<RegularStickerId, typeof STICKER_ROSTER[number]>,
  ),
  [SUPERUSER_STICKER.id]: SUPERUSER_STICKER,
};

export function getSticker(id: StickerId): StickerEntry {
  return STICKER_LOOKUP[id];
}

/** Count visible to the album — hidden superuser excluded. */
export const STICKER_TOTAL = STICKER_ROSTER.length;

/** Set of every regular (non-superuser) sticker id, used by predicates. */
export const REGULAR_STICKER_IDS: ReadonlySet<RegularStickerId> = new Set(
  STICKER_ROSTER.map((s) => s.id),
);

/**
 * Predicate — returns true when the given unlocked list covers every regular
 * sticker. Used by the store to detect the moment the superuser sticker should
 * be auto-awarded.
 */
export function hasEarnedAllRegularStickers(unlocked: readonly StickerId[]): boolean {
  if (unlocked.length < STICKER_ROSTER.length) return false;
  const seen = new Set<string>();
  for (const id of unlocked) {
    if (REGULAR_STICKER_IDS.has(id as RegularStickerId)) seen.add(id);
  }
  return seen.size >= STICKER_ROSTER.length;
}

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
 * Project Explorer — a stack of overlapping manila case files with a paperclip,
 * on coral. Represents opening every project note.
 */
const ProjectExplorerSvg = memo(function ProjectExplorerSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.coral;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Back folder */}
      <rect x="12" y="22" width="32" height="22" rx="1.5" fill="#fbbf24" stroke={family.ink} strokeWidth="1.6" strokeLinejoin="round" transform="rotate(-4 28 33)" />
      {/* Middle folder */}
      <rect x="14" y="20" width="32" height="22" rx="1.5" fill="#fde68a" stroke={family.ink} strokeWidth="1.6" strokeLinejoin="round" transform="rotate(2 30 31)" />
      {/* Front folder with tab */}
      <path d="M18 18 L30 18 L33 21 L46 21 L46 42 L18 42 Z" fill="#fef3c7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* File label strip */}
      <rect x="22" y="26" width="18" height="3.2" fill={family.ink} opacity="0.25" />
      <line x1="22" y1="32" x2="40" y2="32" stroke={family.ink} strokeWidth="0.9" opacity="0.35" />
      <line x1="22" y1="35" x2="36" y2="35" stroke={family.ink} strokeWidth="0.9" opacity="0.35" />
      {/* Paperclip */}
      <path d="M38 14 Q42 14 42 18 L42 28 Q42 32 38 32 Q34 32 34 28 L34 20" fill="none" stroke={family.ink} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
});

/**
 * Cheat Codes — an arcade-style "IDKFA" cheat scrap of paper with underline,
 * on sunshine. Represents accessing the privileged cheatsheet.
 */
const CheatCodesSvg = memo(function CheatCodesSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.sunshine;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Paper scrap with slight skew */}
      <g transform="rotate(-3 30 30)">
        <rect x="12" y="18" width="36" height="24" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
        {/* Torn-edge zigzag top */}
        <path d="M12 18 L16 16 L20 18 L24 16 L28 18 L32 16 L36 18 L40 16 L44 18 L48 18" fill="none" stroke={family.ink} strokeWidth="1.4" strokeLinejoin="round" />
        {/* Cheat code letters */}
        <text x="30" y="31" textAnchor="middle" fontFamily="var(--font-code), monospace" fontSize="7" fontWeight="700" fill={family.ink}>IDKFA</text>
        {/* Wavy underline */}
        <path d="M16 36 Q19 34 22 36 T28 36 T34 36 T40 36 T44 36" fill="none" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </svg>
  );
});

/**
 * Drawer Dweller — an open drawer with stickers peeking out, on rose.
 */
const DrawerDwellerSvg = memo(function DrawerDwellerSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.rose;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Drawer front */}
      <rect x="12" y="28" width="36" height="18" rx="1.5" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Drawer handle */}
      <rect x="26" y="34" width="8" height="2.5" rx="1.25" fill={family.ink} />
      {/* Stickers peeking above (3 small circles) */}
      <circle cx="20" cy="24" r="5" fill="#fde68a" stroke={family.ink} strokeWidth="1.4" />
      <circle cx="30" cy="22" r="5.5" fill="#bfdbfe" stroke={family.ink} strokeWidth="1.4" />
      <circle cx="40" cy="24" r="5" fill="#bbf7d0" stroke={family.ink} strokeWidth="1.4" />
      {/* Tiny icons on the peeking stickers */}
      <path d="M18 23 L22 23 M20 21 L20 25" stroke={family.ink} strokeWidth="1" strokeLinecap="round" />
      <circle cx="30" cy="22" r="1.5" fill={family.ink} />
      <path d="M38 25 L42 23" stroke={family.ink} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
});

/**
 * Chat Conductor — a baton crossed with a chat speech bubble, on mint.
 */
const ChatConductorSvg = memo(function ChatConductorSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.mint;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Speech bubble */}
      <path d="M12 18 Q12 14 16 14 L36 14 Q40 14 40 18 L40 30 Q40 34 36 34 L24 34 L18 40 L20 34 Q12 34 12 30 Z" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Action dots */}
      <circle cx="20" cy="24" r="1.6" fill={family.ink} />
      <circle cx="26" cy="24" r="1.6" fill={family.ink} />
      <circle cx="32" cy="24" r="1.6" fill={family.ink} />
      {/* Conductor baton crossing bubble */}
      <line x1="36" y1="38" x2="50" y2="22" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
      <circle cx="36" cy="38" r="2.6" fill={family.ink} />
      {/* Motion arc */}
      <path d="M44 30 Q46 35 41 40" fill="none" stroke={family.ink} strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 2" opacity="0.6" />
    </svg>
  );
});

/**
 * Terminal Addict — a terminal window stacked over an energy icon, on sunshine.
 */
const TerminalAddictSvg = memo(function TerminalAddictSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.sunshine;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Terminal window */}
      <rect x="10" y="14" width="40" height="26" rx="2" fill="#2d2a2e" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Traffic lights */}
      <circle cx="14" cy="18" r="1.1" fill="#ff6b6b" />
      <circle cx="17.5" cy="18" r="1.1" fill="#ffd166" />
      <circle cx="21" cy="18" r="1.1" fill="#8ce99a" />
      {/* Five prompt lines indicating repetition */}
      <text x="14" y="27" fontFamily="var(--font-code), monospace" fontSize="4" fill="#8ce99a">&gt; cmd</text>
      <text x="14" y="31" fontFamily="var(--font-code), monospace" fontSize="4" fill="#8ce99a">&gt; cmd</text>
      <text x="14" y="35" fontFamily="var(--font-code), monospace" fontSize="4" fill="#8ce99a">&gt; cmd</text>
      <text x="14" y="39" fontFamily="var(--font-code), monospace" fontSize="4" fill="#8ce99a">&gt; cmd</text>
      {/* Lightning bolt indicating addiction / speed */}
      <path d="M36 44 L40 38 L38 38 L41 32 L36 42 L38 42 Z" fill="#fbbf24" stroke={family.ink} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
});

/**
 * Repo Hunter — a magnifying glass over the octocat-esque cat-face bracket
 * pattern, representing GitHub exploration, on denim.
 */
const RepoHunterSvg = memo(function RepoHunterSvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.denim;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Code brackets */}
      <text x="14" y="34" fontFamily="var(--font-code), monospace" fontSize="14" fontWeight="700" fill={family.ink} opacity="0.5">{'<'}</text>
      <text x="40" y="34" fontFamily="var(--font-code), monospace" fontSize="14" fontWeight="700" fill={family.ink} opacity="0.5">{'>'}</text>
      {/* Branch dot + line */}
      <circle cx="22" cy="42" r="2.4" fill={family.ink} />
      <circle cx="38" cy="42" r="2.4" fill={family.ink} />
      <line x1="22" y1="42" x2="38" y2="42" stroke={family.ink} strokeWidth="1.4" />
      {/* Magnifying glass over the brackets */}
      <circle cx="30" cy="26" r="8" fill="#fdfbf7" fillOpacity="0.85" stroke={family.ink} strokeWidth="1.8" />
      <line x1="36" y1="32" x2="42" y2="38" stroke={family.ink} strokeWidth="2.4" strokeLinecap="round" />
      {/* Tiny "git" symbol inside lens */}
      <circle cx="27" cy="26" r="1.5" fill={family.ink} />
      <circle cx="33" cy="26" r="1.5" fill={family.ink} />
      <line x1="28.5" y1="26" x2="31.5" y2="26" stroke={family.ink} strokeWidth="1.2" />
    </svg>
  );
});

/**
 * Social Butterfly — a butterfly whose wings are styled as two overlapping
 * speech / link bubbles, on rose.
 */
const SocialButterflySvg = memo(function SocialButterflySvg({ size }: IllustratedSvgProps) {
  const family = STICKER_FAMILIES.rose;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill={family.bg} stroke={family.ink} strokeWidth={STICKER_TOKENS.strokeWidth} strokeLinejoin="round" />
      {/* Body */}
      <line x1="30" y1="18" x2="30" y2="44" stroke={family.ink} strokeWidth="2" strokeLinecap="round" />
      {/* Antennae */}
      <path d="M30 18 Q27 14 24 14" fill="none" stroke={family.ink} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M30 18 Q33 14 36 14" fill="none" stroke={family.ink} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="24" cy="14" r="1.2" fill={family.ink} />
      <circle cx="36" cy="14" r="1.2" fill={family.ink} />
      {/* Left wings */}
      <path d="M30 24 Q14 20 12 30 Q14 38 30 34 Z" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Right wings */}
      <path d="M30 24 Q46 20 48 30 Q46 38 30 34 Z" fill="#fdfbf7" stroke={family.ink} strokeWidth="1.8" strokeLinejoin="round" />
      {/* Wing icons — tiny link chain + heart */}
      <path d="M18 28 L21 28 M18 30 L20 30" stroke={family.ink} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M38 28 Q39 26 40.5 27 Q42 26 43 28 Q43 30 40.5 32 Q38 30 38 28 Z" fill={family.ink} opacity="0.7" />
    </svg>
  );
});

/**
 * Superuser — a metallic gold award medal with a crown and the word "ROOT".
 * This is the hidden sticker earned by collecting all regular stickers. Rendered
 * with a premium gold gradient + soft shine highlight; the card ancestor adds
 * a shimmer via CSS.
 */
const SuperuserSvg = memo(function SuperuserSvg({ size }: IllustratedSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="superuserGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="25%" stopColor="#fbbf24" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="85%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="superuserShine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fffbeb" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fffbeb" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="superuserCore" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="60%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
      </defs>
      {/* Outer medal border */}
      <circle cx="30" cy="30" r="27" fill="url(#superuserGold)" stroke="#78350f" strokeWidth={STICKER_TOKENS.strokeWidth} />
      {/* Inner recessed ring */}
      <circle cx="30" cy="30" r="22" fill="url(#superuserCore)" stroke="#92400e" strokeWidth="1.2" />
      {/* Ray pattern — 8 inner rays */}
      <g stroke="#78350f" strokeWidth="0.8" strokeLinecap="round" opacity="0.4">
        <line x1="30" y1="12" x2="30" y2="16" />
        <line x1="30" y1="44" x2="30" y2="48" />
        <line x1="12" y1="30" x2="16" y2="30" />
        <line x1="44" y1="30" x2="48" y2="30" />
        <line x1="17.3" y1="17.3" x2="20.1" y2="20.1" />
        <line x1="39.9" y1="39.9" x2="42.7" y2="42.7" />
        <line x1="17.3" y1="42.7" x2="20.1" y2="39.9" />
        <line x1="39.9" y1="20.1" x2="42.7" y2="17.3" />
      </g>
      {/* Crown above "ROOT" */}
      <path d="M22 22 L24 18 L27 22 L30 17 L33 22 L36 18 L38 22 L38 25 L22 25 Z" fill="#fef3c7" stroke="#78350f" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="24" cy="18" r="0.9" fill="#dc2626" />
      <circle cx="30" cy="17" r="1" fill="#dc2626" />
      <circle cx="36" cy="18" r="0.9" fill="#dc2626" />
      {/* ROOT text */}
      <text x="30" y="38" textAnchor="middle" fontFamily="var(--font-code), monospace" fontSize="8" fontWeight="700" fill="#451a03" letterSpacing="0.5">ROOT</text>
      {/* Specular highlight on upper-left */}
      <ellipse cx="20" cy="18" rx="6" ry="3" fill="url(#superuserShine)" opacity="0.65" transform="rotate(-30 20 18)" />
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

// ─── Placeholder (fallback only) ────────────────────────────────────────
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

// ─── Public Sticker component — switches on id, renders illustrated art ───
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
    case 'project-explorer':
      inner = <ProjectExplorerSvg size={size} />;
      break;
    case 'cheat-codes':
      inner = <CheatCodesSvg size={size} />;
      break;
    case 'drawer-dweller':
      inner = <DrawerDwellerSvg size={size} />;
      break;
    case 'chat-conductor':
      inner = <ChatConductorSvg size={size} />;
      break;
    case 'terminal-addict':
      inner = <TerminalAddictSvg size={size} />;
      break;
    case 'repo-hunter':
      inner = <RepoHunterSvg size={size} />;
      break;
    case 'social-butterfly':
      inner = <SocialButterflySvg size={size} />;
      break;
    case 'superuser':
      inner = <SuperuserSvg size={size} />;
      break;
    default: {
      // Fallback placeholder — only reached if a new sticker is added without
      // a matching case above. Keeps the build safe.
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
