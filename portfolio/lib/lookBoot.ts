// Pre-paint boot script pieces for app/layout.tsx only; kept apart so client preference code doesn't bundle them.
import { LOOK_ATTRS, LOOK_KEYS, LOOK_OPTIONS, type LookPrefs } from '@/lib/lookPrefs';

/** Inlined into the pre-paint boot script: `o` is the parsed stored prefs, `e` is <html>. */
export const LOOK_BOOT_SNIPPET = `const L=${JSON.stringify(Object.fromEntries(LOOK_KEYS.map((key) => [key, [LOOK_ATTRS[key], LOOK_OPTIONS[key]]])))};for(const k in L){const[a,v]=L[k];e.dataset[a]=v.includes(o[k])?o[k]:v[0]}`;

/** The textures each page surface paints at first sight (app/look.css), by theme. */
export const FIRST_PAINT_TEXTURES = {
  light: { canvas: ['canvas-weave'], paper: ['paper-grain'], graph: [] },
  dark: { green: ['slate-grain', 'chalk-smudge-2'], black: ['slate-grain', 'chalk-smudge-2'], slate: [] },
} as const satisfies { light: Record<LookPrefs['surface'], readonly string[]>; dark: Record<LookPrefs['chalkboard'], readonly string[]> };

/**
 * Every first visit opens on the default dark board, so its textures are preloaded from the HTML itself, where the
 * preload scanner starts them alongside the CSS; anyone who later switches surface already has them cached.
 * Deliberate: a returning visitor on another surface may fetch these once on a cold cache, which keeps the default
 * board's LCP from waiting for the boot script (inline scripts run only after the stylesheets load).
 */
export const DEFAULT_SURFACE_TEXTURES: readonly string[] = FIRST_PAINT_TEXTURES.dark[LOOK_OPTIONS.chalkboard[0]];

/**
 * Inlined after the boot script has set `data-surface`, `data-chalkboard` and `data-pref-paper` on `e`: starts the
 * chosen surface's textures alongside the CSS instead of after it, so the board is not repainted once they land.
 * Only the chosen surface in the current theme (next-themes' `theme`, dark by default) is fetched, and the defaults
 * the HTML already preloads are skipped.
 */
export const TEXTURE_PRELOAD_SNIPPET = `if(e.dataset.prefPaper==='on'){const T=${JSON.stringify(FIRST_PAINT_TEXTURES)},S=${JSON.stringify(DEFAULT_SURFACE_TEXTURES)},t=localStorage.getItem('theme'),d=t==='light'?0:t==='system'?matchMedia('(prefers-color-scheme: dark)').matches:1;for(const n of (d?T.dark[e.dataset.chalkboard]:T.light[e.dataset.surface])||[]){if(S.includes(n))continue;const l=document.createElement('link');l.rel='preload';l.as='image';l.fetchPriority='high';l.href='/resources/textures/'+n+'.webp';document.head.append(l)}}`;
