/**
 * Unit tests for `lib/themeToggleAction.ts` — shared theme toggle plus
 * `runDiscoMode` enter/exit. Disco exit must not touch `setTheme`.
 */
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/hooks/useStickers', () => ({
  setDiscoActiveImperative: vi.fn(),
  unlockSticker: vi.fn(),
}));
vi.mock('@/lib/soundManager', () => ({
  soundManager: { play: vi.fn() },
}));
vi.mock('@/components/DiscoMediaLayer', () => ({
  default: () => null,
}));

import { runDiscoMode, runThemeSelection, runThemeToggle } from '@/lib/themeToggleAction';
import { setDiscoActiveImperative, unlockSticker } from '@/hooks/useStickers';
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
    // Unlock sticker + sound manager must NOT fire for the disco-exit path —
    // exiting disco should be silent; the audio teardown happens inside the
    // DiscoMediaLayer unmount.
    expect(unlockSticker).not.toHaveBeenCalled();
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
    expect(unlockSticker).toHaveBeenCalledWith('theme-flipper');
    expect(soundManager.play).toHaveBeenCalledWith('theme-dark');
  });

  it('when discoActive=false and isDark=true, flips to light + plays theme-light sfx + emits theme-flipper', () => {
    const setTheme = vi.fn();
    runThemeToggle({ discoActive: false, isDark: true, setTheme });
    expect(setDiscoActiveImperative).not.toHaveBeenCalled();
    expect(setTheme).toHaveBeenCalledWith('light');
    expect(unlockSticker).toHaveBeenCalledWith('theme-flipper');
    expect(soundManager.play).toHaveBeenCalledWith('theme-light');
  });

  it('calls setTheme exactly once per invocation (no double-fire)', () => {
    const setTheme = vi.fn();
    runThemeToggle({ discoActive: false, isDark: false, setTheme });
    expect(setTheme).toHaveBeenCalledTimes(1);
  });
});

describe('runThemeSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits disco through the shared store mechanism before applying a selection', () => {
    const setTheme = vi.fn();
    runThemeSelection({ discoActive: true, theme: 'system', setTheme });

    expect(setDiscoActiveImperative).toHaveBeenCalledWith(false);
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('reapplies the selected value so choosing the current theme still exits disco', () => {
    const setTheme = vi.fn();
    runThemeSelection({ discoActive: true, theme: 'dark', setTheme });

    expect(setDiscoActiveImperative).toHaveBeenCalledWith(false);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('applies light or dark without touching disco when it is inactive', () => {
    const setTheme = vi.fn();
    runThemeSelection({ discoActive: false, theme: 'dark', setTheme });

    expect(setDiscoActiveImperative).not.toHaveBeenCalled();
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('runDiscoMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delegates enter/exit to the store flag and prewarms only when activating in the browser', () => {
    runDiscoMode(true);
    expect(setDiscoActiveImperative).toHaveBeenCalledTimes(1);
    expect(setDiscoActiveImperative).toHaveBeenCalledWith(true);

    vi.clearAllMocks();
    vi.stubGlobal('window', {});
    runDiscoMode(true);
    expect(setDiscoActiveImperative).toHaveBeenCalledTimes(1);
    expect(setDiscoActiveImperative).toHaveBeenCalledWith(true);

    vi.clearAllMocks();
    runDiscoMode(false);
    expect(setDiscoActiveImperative).toHaveBeenCalledTimes(1);
    expect(setDiscoActiveImperative).toHaveBeenCalledWith(false);
  });
});
