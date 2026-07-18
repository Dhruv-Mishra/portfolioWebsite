import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('command palette chat action contract', () => {
  it('keeps the palette action in the registry and dispatches its existing event before delayed navigation', () => {
    const actions = read('lib/actions.ts');
    const chat = read('components/StickyNoteChat.tsx');
    const paletteDispatch = chat.indexOf("window.dispatchEvent(new CustomEvent('open-command-palette'))");
    const navigationDelay = chat.indexOf('setTimeout(() =>', chat.indexOf('// Page navigation'));

    expect(actions).toContain("label: 'Open command palette'");
    expect(actions).toContain('commandPaletteAction: true');
    expect(paletteDispatch).toBeGreaterThan(-1);
    expect(paletteDispatch).toBeLessThan(navigationDelay);
  });

  it('mounts the lightweight provider on all viewports while retaining desktop-only shortcut surfaces', () => {
    const enhancements = read('components/EagerEnhancements.tsx');

    expect(enhancements).toContain("import CommandPaletteProvider from '@/components/CommandPaletteProvider'");
    expect(enhancements).not.toContain("import('@/components/CommandPaletteProvider')");
    expect(enhancements).toContain('<CommandPaletteProvider />');
    expect(enhancements).not.toContain('{isDesktop ? <CommandPaletteProvider /> : null}');
    expect(enhancements).toContain('{isDesktop ? <ShortcutsOverlayProvider /> : null}');
    expect(enhancements).toContain('{isDesktop ? <ShortcutsHint /> : null}');
  });
});