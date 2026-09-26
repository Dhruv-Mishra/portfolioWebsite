/**
 * Sticker roster data, ids, and predicates (no JSX). SVG art lives in
 * `@/lib/stickers`, which re-exports this module.
 *
 * Roster:
 *   11 regular stickers reward genuine site exploration (no grindy counters
 *   or time-of-day gimmicks). Every roster entry is reachable on touch
 *   devices. The hidden `superuser` sticker is not exposed on the album
 *   until it is earned — awarded automatically the moment the user owns
 *   every regular sticker.
 */
import { STICKER_TOKENS, type StickerFamily } from '@/lib/designTokens';

// ─── Roster ─────────────────────────────────────────────────────────────
export const STICKER_ROSTER = [
  { id: 'first-word', label: 'The First Word', description: 'Typed your first terminal command.', hint: 'the terminal is lonely — give it any command.', family: 'sunshine' },
  { id: 'theme-flipper', label: 'Lights On, Lights Off', description: 'Flipped between day and night.', hint: 'toggle the theme — look for a sun or moon.', family: 'lavender' },
  { id: 'note-sender', label: 'Pen Pal', description: 'Sent a note via feedback.', hint: 'send some real feedback — the floating icon.', family: 'mint' },
  { id: 'page-turner', label: 'The Whole Tour', description: 'Visited every page on the site.', hint: 'visit every page on the site — all of them.', family: 'denim' },
  { id: 'full-chat', label: 'Serious Chat', description: 'Had a real chat on the chat page.', hint: 'open the full chat page.', family: 'mint' },
  { id: 'signed-guestbook', label: 'Left a Mark', description: 'Pinned a note to the guestbook.', hint: 'sign the guestbook — leave a note on the wall.', family: 'mint' },
  { id: 'project-explorer', label: 'Case Files', description: 'Opened a project note.', hint: 'tap any project card to peek inside.', family: 'coral' },
  { id: 'chat-conductor', label: 'Chat Conductor', description: 'Let chat-me steer the ship.', hint: 'ask the chat to actually *do* something.', family: 'mint' },
  { id: 'repo-hunter', label: 'Repo Hunter', description: 'Followed a project back to its source.', hint: 'source code lives a click away from each card.', family: 'denim' },
  { id: 'social-butterfly', label: 'Social Butterfly', description: 'Tapped one of the social links.', hint: 'the links along the edge go somewhere ~', family: 'rose' },
  { id: 'phoned-a-friend', label: 'Phoned a Friend', description: 'Called the website voice agent.', hint: 'talk with Dhruv by voice — give the voice agent a ring.', family: 'mint' },
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
