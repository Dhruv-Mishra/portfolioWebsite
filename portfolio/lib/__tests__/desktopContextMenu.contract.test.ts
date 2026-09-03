import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Z_INDEX } from '@/lib/designTokens';

const readSource = (relativePath: string) => fs.readFileSync(
  path.join(process.cwd(), relativePath),
  'utf8',
);

const eagerSource = readSource('components/EagerEnhancements.tsx');
const menuSource = readSource('components/DesktopContextMenu.tsx');
const cursorSource = readSource('components/SketchbookCursor.tsx');

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

  it('keeps the custom cursor visible and batches high-frequency pointer input', () => {
    expect(Z_INDEX.cursor).toBeGreaterThan(Z_INDEX.contextMenu);
    expect(Z_INDEX.contextMenu).toBeGreaterThan(10001);
    expect(menuSource).toContain('zIndex: Z_INDEX.contextMenu');
    expect(menuSource).not.toContain('z-[10000]');
    expect(cursorSource).toContain("window.addEventListener('mousemove', queueCursorMove, { passive: true })");
    expect(cursorSource).toContain('const MAX_TRAIL_DPR = 1;');
    expect(cursorSource).toContain('applyPointerMove(now)');
    expect(cursorSource.indexOf('applyPointerMove(now)')).toBeGreaterThan(
      cursorSource.indexOf('const renderTrail = () =>'),
    );
    expect(cursorSource.indexOf('checkHover(pointerTarget)')).toBeGreaterThan(
      cursorSource.indexOf('const applyPointerMove'),
    );
    expect(cursorSource.indexOf('checkHover(pointerTarget)')).toBeLessThan(
      cursorSource.indexOf('const queueCursorMove'),
    );
  });

  it('runs a self-stopping rAF cursor without Framer, using performance.now', () => {
    expect(cursorSource).not.toMatch(/from\s+['"]framer-motion['"]/);
    expect(cursorSource).toContain('useEffectiveReducedMotion()');
    expect(cursorSource).toContain('if (!canUseCustomCursor || reducedMotion) return;');
    expect(cursorSource).toContain('let lastMoveTime = performance.now()');
    expect(cursorSource).toContain('applyPointerMove(now)');
    expect(cursorSource.indexOf('applyPointerMove(now)')).toBeGreaterThan(
      cursorSource.indexOf('const renderTrail = () =>'),
    );
    expect(cursorSource).toContain('now - lastMoveTime > TIMING_TOKENS.cursorIdleThreshold');
    expect(cursorSource).toContain('if (rafId === 0)');
    expect(cursorSource).toContain('wakeLoop()');
    expect(cursorSource).toMatch(/applyCursorStyle\(\);\s*wakeLoop\(\)/);
    const queueStart = cursorSource.indexOf('const queueCursorMove');
    const queueStyle = cursorSource.indexOf('applyCursorStyle()', queueStart);
    const queueWake = cursorSource.indexOf('wakeLoop()', queueStart);
    expect(queueStyle).toBeGreaterThan(queueStart);
    expect(queueStyle).toBeLessThan(queueWake);
  });
});