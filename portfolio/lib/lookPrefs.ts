/**
 * Look-and-feel choices. Each one is stored with the site prefs and mirrored to `<html data-*>` (by the pre-paint
 * boot script and AdminPrefsController), so CSS switches surfaces, materials and decorations without a re-render
 * or a flash. The first option of each list is the default.
 */
export const LOOK_OPTIONS = {
  /** Light-theme page: primed painting canvas, real drawing paper, or flat graph paper. */
  surface: ['canvas', 'paper', 'graph'],
  /** Dark-theme page: green school chalkboard, black slate chalkboard, or the flat dark sheet. */
  chalkboard: ['green', 'black', 'slate'],
  /** Notes and cards: textured paper, kraft cardboard, or flat sticky notes that follow the theme. */
  noteMaterial: ['paper', 'cardboard', 'sticky'],
  /** Project cards: kraft cardboard, or whatever the notes are made of. */
  cardMaterial: ['cardboard', 'notes'],
  tornEdges: ['on', 'off'],
  /** About page: notes pinned on a board, or laid straight on the page. */
  aboutLayout: ['board', 'sheet'],
  pinboard: ['cork', 'burlap'],
  /** Experience photos: clipped to a wire mesh, or pegged to a twine line. */
  timeline: ['mesh', 'wire'],
  /** Opening a note: unpin (or peel, or unclip) and fly, fly straight away, or a plain fade. */
  noteFlight: ['pin', 'zoom', 'fade'],
  decorations: ['lots', 'some', 'none'],
  aging: ['light', 'worn', 'none'],
} as const;

export type LookKey = keyof typeof LOOK_OPTIONS;
export type LookPrefs = { -readonly [K in LookKey]: (typeof LOOK_OPTIONS)[K][number] };

/** `dataset` keys on <html>; CSS reads them as `html[data-<attr>="value"]`. */
export const LOOK_ATTRS: Record<LookKey, string> = {
  surface: 'surface',
  chalkboard: 'chalkboard',
  noteMaterial: 'notes',
  cardMaterial: 'cards',
  tornEdges: 'torn',
  aboutLayout: 'about',
  pinboard: 'pinboard',
  timeline: 'timeline',
  noteFlight: 'flight',
  decorations: 'decor',
  aging: 'aging',
};

export const LOOK_KEYS = Object.keys(LOOK_OPTIONS) as LookKey[];

export function isLookKey(key: string): key is LookKey {
  return Object.hasOwn(LOOK_OPTIONS, key);
}

export function isLookValue<K extends LookKey>(key: K, value: unknown): value is LookPrefs[K] {
  return (LOOK_OPTIONS[key] as readonly unknown[]).includes(value);
}

export function parseLookPrefs(record: Record<string, unknown>): LookPrefs {
  const look = {} as Record<LookKey, string>;
  for (const key of LOOK_KEYS) {
    const value = record[key];
    look[key] = isLookValue(key, value) ? value : LOOK_OPTIONS[key][0];
  }
  return look as LookPrefs;
}

export function applyLookToDataset(dataset: DOMStringMap, look: LookPrefs): void {
  for (const key of LOOK_KEYS) dataset[LOOK_ATTRS[key]] = look[key];
}

/** Inlined into the pre-paint boot script: `o` is the parsed stored prefs, `e` is <html>. */
export const LOOK_BOOT_SNIPPET = `const L=${JSON.stringify(Object.fromEntries(LOOK_KEYS.map((key) => [key, [LOOK_ATTRS[key], LOOK_OPTIONS[key]]])))};for(const k in L){const[a,v]=L[k];e.dataset[a]=v.includes(o[k])?o[k]:v[0]}`;
