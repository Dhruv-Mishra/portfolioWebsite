import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('normal theme entry points', () => {
  it('routes the global shortcut and command registry through runThemeToggle', () => {
    const shortcuts = read('components/ShortcutsOverlayProvider.tsx');
    const registry = read('lib/commandRegistry.ts');

    expect(shortcuts).toMatch(/runThemeToggle\(\{[\s\S]*?discoActive/);
    expect(shortcuts).not.toMatch(/const next = resolvedTheme/);
    expect(registry).toMatch(/run:\s*\(ctx\)\s*=>\s*runThemeToggle/);
    expect(registry).toContain('discoActive: ctx.discoActive');
    expect(registry).not.toMatch(/ctx\.setTheme\(next\)/);
  });

  it('routes chat light, dark, and toggle actions through shared helpers', () => {
    const chat = read('components/StickyNoteChat.tsx');

    expect(chat).toMatch(/action\.themeAction === 'toggle'[\s\S]*?runThemeToggle\(/);
    expect(chat).toMatch(/else \{[\s\S]*?runThemeSelection\(/);
    expect(chat).not.toMatch(/setTheme\(resolvedTheme ===/);
    expect(chat).not.toMatch(/setTheme\(action\.themeAction\)/);
    expect(chat).toContain("action.themeAction === 'disco'");
    expect(chat).toContain("action.themeAction === 'disco-off'");
  });
});