import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

const eagerSource = readSource('components/EagerEnhancements.tsx');
const menuSource = readSource('components/DesktopContextMenu.tsx');

describe('desktop context menu contract', () => {
  it('fetches the menu chunk only after a fine-pointer media query matches', () => {
    expect(eagerSource).toContain("window.matchMedia('(hover: hover) and (pointer: fine)')");
    expect(eagerSource).toContain("if (!finePointer.matches)");
    expect(eagerSource).toContain("import('@/components/DesktopContextMenu')");
    expect(eagerSource.indexOf('if (!finePointer.matches)')).toBeLessThan(
      eagerSource.indexOf("import('@/components/DesktopContextMenu')"),
    );
    expect(eagerSource).not.toMatch(/dynamic\(\s*\(\) => import\('@\/components\/DesktopContextMenu'\)/);
  });

  it('preserves native browser behavior for editable and browser-owned targets', () => {
    expect(menuSource).toContain("'input'");
    expect(menuSource).toContain("'[contenteditable]:not([contenteditable=\"false\"])'");
    expect(menuSource).toContain("'audio'");
    expect(menuSource).toContain("'video'");
    expect(menuSource).toContain("'img'");
    expect(menuSource).toContain("'iframe'");
    expect(menuSource).toContain("'[data-native-context-menu]'");
    expect(menuSource).toContain('selection.toString().trim().length > 0');
    expect(menuSource).toContain('if (event.shiftKey || shouldKeepNativeContextMenu(event.target)) return;');
  });

  it('provides accessible keyboard navigation, closure, and practical commands', () => {
    expect(menuSource).toContain('role="menu"');
    expect(menuSource).toContain('role="menuitem"');
    expect(menuSource).toContain("event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')");
    expect(menuSource).toContain("event.key === 'ArrowDown'");
    expect(menuSource).toContain("event.key === 'ArrowUp'");
    expect(menuSource).toContain("event.key === 'Escape'");
    expect(menuSource).toContain('closeMenu(true)');
    expect(menuSource).toContain('keyboardInvokerRef.current?.focus({ preventScroll: true })');
    for (const label of ['Open link in new tab', 'Copy link', 'Back', 'Forward', 'Reload', 'Home', 'Settings', 'Copy page link']) {
      expect(menuSource).toContain(`label: '${label}'`);
    }
  });
});