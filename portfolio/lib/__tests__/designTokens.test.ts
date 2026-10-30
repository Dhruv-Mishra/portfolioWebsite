import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PAPER_PALETTE } from '@/lib/designTokens';

// Tailwind utilities (bg-note-*) and TS consumers (SVG, inline gradients) must render the same paper.
describe('design token parity', () => {
  it('keeps @theme note colors equal to PAPER_PALETTE', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
    const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    const noteColors = Object.fromEntries(
      [...theme.matchAll(/--color-note-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, hex]) => [name, hex.toLowerCase()]),
    );

    expect(noteColors).toEqual({
      yellow: PAPER_PALETTE.yellow,
      coral: PAPER_PALETTE.coral,
      'coral-dark': PAPER_PALETTE.coralDark,
    });
  });
});
