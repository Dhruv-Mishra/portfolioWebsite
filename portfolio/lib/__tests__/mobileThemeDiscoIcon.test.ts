/**
 * Source-level guard for Bug 2c — the mobile theme button in
 * `components/SocialSidebar.tsx` must render a disco-ball icon (matching
 * the desktop `ThemeToggle`) when `discoActive === true`. Before the fix
 * the mobile variant only branched on `isDark` and always rendered the
 * sun/moon, regardless of disco state.
 *
 * The fix makes the button subscribe to `useDiscoActive()` and pick the
 * disco-ball SVG when the flag is on. We also verify the aria-label swap
 * ("Exit disco mode") so screen-reader semantics match the desktop button.
 *
 * Vitest runs in a node environment; we assert against the source text to
 * guarantee the patterns are in place without standing up a full DOM.
 *
 * We locate the MobileThemeButton body by slicing the source between its
 * declaration line and the matching `});` that closes the `React.memo(…)`
 * call — using index scanning instead of a balanced-paren regex (JSX +
 * TypeScript annotations nest too many `)` chars for a single regex to be
 * reliable).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SIDEBAR_PATH = path.resolve(
  __dirname,
  '../../components/SocialSidebar.tsx',
);
const TOGGLE_PATH = path.resolve(
  __dirname,
  '../../components/ThemeToggle.tsx',
);
const SIDEBAR_SRC = fs.readFileSync(SIDEBAR_PATH, 'utf8');
const TOGGLE_SRC = fs.readFileSync(TOGGLE_PATH, 'utf8');

/**
 * Extract the MobileThemeButton body. Start at the declaration line and
 * read until the next `export default` (start of the next top-level
 * declaration). Returns the slice or an empty string if the declaration
 * isn't found.
 */
function extractMobileThemeButton(src: string): string {
  const startMarker = 'const MobileThemeButton';
  const endMarker = 'export default function SocialSidebar';
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return '';
  return src.slice(startIdx, endIdx);
}

const MOBILE_BTN = extractMobileThemeButton(SIDEBAR_SRC);

describe('MobileThemeButton — disco ball parity with desktop', () => {
  it('extracts a non-empty MobileThemeButton body', () => {
    expect(MOBILE_BTN.length).toBeGreaterThan(0);
    expect(MOBILE_BTN).toMatch(/MobileThemeButton/);
  });

  it('imports useDiscoActive from useStickers', () => {
    expect(SIDEBAR_SRC).toMatch(/useDiscoActive/);
  });

  it('calls useDiscoActive() inside the mobile theme button', () => {
    expect(MOBILE_BTN).toMatch(/useDiscoActive\(\)/);
  });

  it('swaps the aria-label to "Exit disco mode" when disco is active', () => {
    expect(MOBILE_BTN).toMatch(/Exit disco mode/);
  });

  it('renders a disco-ball SVG variant (matching desktop ThemeToggle)', () => {
    // Desktop disco ball SVG has a distinctive `M12 2v3` hanger path + the
    // `fill-fuchsia-200` class on the ball circle. Share the visual
    // language across breakpoints.
    expect(MOBILE_BTN).toMatch(/M12 2v3/);
    expect(MOBILE_BTN).toMatch(/fill-fuchsia-200/);
  });

  it('routes click through the shared runThemeToggle helper (unified handler)', () => {
    // Bug 2b: previously the mobile button had its own inline handler that
    // just flipped light/dark, leaving discoActive untouched. The shared
    // helper owns the disco-exit branch.
    expect(SIDEBAR_SRC).toMatch(/import\s+\{\s*runThemeToggle\s*\}\s+from\s+['"]@\/lib\/themeToggleAction['"]/);
    expect(MOBILE_BTN).toMatch(/runThemeToggle\(/);
  });

  it('desktop ThemeToggle also uses the shared runThemeToggle helper (single source of truth)', () => {
    // Both buttons share one code path now. If someone adds a future case
    // (e.g. a third "exit matrix" branch), they edit the helper, not two
    // identical inline handlers.
    expect(TOGGLE_SRC).toMatch(/runThemeToggle/);
    expect(TOGGLE_SRC).toMatch(/import\s+\{\s*runThemeToggle\s*\}/);
  });

  it('mobile button gates the disco-ball SVG on the discoActive ternary', () => {
    // The ternary `{discoActive ? <svg ... disco-ball />` must be present —
    // fallback to sun/moon is the existing behaviour.
    expect(MOBILE_BTN).toMatch(/discoActive\s*\?\s*\(/);
  });

  it('mobile button still renders sun/moon when disco is NOT active (regression guard)', () => {
    // The existing light/dark icon switch must remain in the fallback arm.
    expect(MOBILE_BTN).toMatch(/Sun/);
    expect(MOBILE_BTN).toMatch(/Moon/);
  });
});
