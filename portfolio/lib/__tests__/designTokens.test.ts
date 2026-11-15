import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PAPER_PALETTE, PIN_COLORS } from '@/lib/designTokens';

// Tailwind utilities (bg-paper-*, bg-pin-*) and TS consumers (SVG, inline gradients) must render the same colors.
describe('design token parity', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const themeColors = (prefix: string) => Object.fromEntries(
    [...theme.matchAll(new RegExp(`--color-${prefix}-([\\w-]+):\\s*(#[0-9a-f]{6})`, 'gi'))].map(([, name, hex]) => [name, hex.toLowerCase()]),
  );

  it('keeps @theme paper colors equal to PAPER_PALETTE', () => {
    expect(themeColors('paper')).toEqual({
      yellow: PAPER_PALETTE.yellow,
      coral: PAPER_PALETTE.coral,
      'coral-dark': PAPER_PALETTE.coralDark,
    });
  });

  it('keeps @theme pin colors equal to PIN_COLORS', () => {
    expect(themeColors('pin')).toEqual(PIN_COLORS);
  });
});
