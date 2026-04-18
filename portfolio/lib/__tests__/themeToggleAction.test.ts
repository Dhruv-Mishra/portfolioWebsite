/**
 * Unit tests for `lib/themeToggleAction.ts` — the shared handler behind the
 * desktop `ThemeToggle` and the mobile `MobileThemeButton` in
 * `SocialSidebar`. Covers Bug 2b (mobile theme toggle must exit disco, not
 * leave remnants) by verifying that when `discoActive === true` the handler
 * calls `setDiscoActiveImperative(false)` and does NOT touch `setTheme`.
 *
 * Side effects — `setDiscoActiveImperative`, `stickerBus.emit`,
 * `soundManager.play` — are all imported from the source modules at test
 * time, so we mock them via `vi.mock` to assert call counts and argv
 * without needing a DOM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the downstream side-effect modules before importing the unit under
// test. Vitest hoists `vi.mock` calls to the top of the file, so the mocks
// take effect before `themeToggleAction` is imported.
vi.mock('@/hooks/useStickers', () => ({
  setDiscoActiveImperative: vi.fn(),
}));
vi.mock('@/lib/stickerBus', () => ({
  stickerBus: { emit: vi.fn() },
}));
vi.mock('@/lib/soundManager', () => ({
  soundManager: { play: vi.fn() },
}));

import { runThemeToggle } from '@/lib/themeToggleAction';
import { setDiscoActiveImperative } from '@/hooks/useStickers';
import { stickerBus } from '@/lib/stickerBus';
import { soundManager } from '@/lib/soundManager';

describe('runThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('when discoActive=true, calls setDiscoActiveImperative(false) and does NOT call setTheme', () => {
    const setTheme = vi.fn();
    runThemeToggle({ discoActive: true, isDark: false, setTheme });
    expect(setDiscoActiveImperative).toHaveBeenCalledTimes(1);
    expect(setDiscoActiveImperative).toHaveBeenCalledWith(false);
    expect(setTheme).not.toHaveBeenCalled();
    // Sticker bus + sound manager must NOT fire for the disco-exit path —
    // exiting disco should be silent; the audio teardown happens inside the
    // DiscoMediaLayer unmount.
    expect(stickerBus.emit).not.toHaveBeenCalled();
    expect(soundManager.play).not.toHaveBeenCalled();
  });

  it('when discoActive=true and isDark=true, STILL exits disco without cycling theme', () => {
    // Guards against a regression where a future refactor reads `isDark`
    // before checking `discoActive` — the disco branch must win regardless.
    const setTheme = vi.fn();
    runThemeToggle({ discoActive: true, isDark: true, setTheme });
    expect(setDiscoActiveImperative).toHaveBeenCalledWith(false);
    expect(setTheme).not.toHaveBeenCalled();
  });

  it('when discoActive=false and isDark=false, flips to dark + plays theme-dark sfx + emits theme-flipper', () => {
    const setTheme = vi.fn();
    runThemeToggle({ discoActive: false, isDark: false, setTheme });
    expect(setDiscoActiveImperative).not.toHaveBeenCalled();
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(stickerBus.emit).toHaveBeenCalledWith('theme-flipper');
    expect(soundManager.play).toHaveBeenCalledWith('theme-dark');
  });

  it('when discoActive=false and isDark=true, flips to light + plays theme-light sfx + emits theme-flipper', () => {
    const setTheme = vi.fn();
    runThemeToggle({ discoActive: false, isDark: true, setTheme });
    expect(setDiscoActiveImperative).not.toHaveBeenCalled();
    expect(setTheme).toHaveBeenCalledWith('light');
    expect(stickerBus.emit).toHaveBeenCalledWith('theme-flipper');
    expect(soundManager.play).toHaveBeenCalledWith('theme-light');
  });

  it('calls setTheme exactly once per invocation (no double-fire)', () => {
    const setTheme = vi.fn();
    runThemeToggle({ discoActive: false, isDark: false, setTheme });
    expect(setTheme).toHaveBeenCalledTimes(1);
  });
});
