/**
 * Shared theme-toggle action used by desktop ThemeToggle, mobile
 * MobileThemeButton, chat, voice tools, and terminal disco.
 *
 * Disco enter/exit goes through `runDiscoMode` so chunk prewarm and the
 * store flag stay in one place. Theme cycling still happens here;
 * DiscoFlagController owns dark-on-active. Disco exit does not touch
 * the underlying light/dark theme.
 */
import { setDiscoActiveImperative, unlockSticker } from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';

export interface ThemeToggleParams {
  /** True when disco is currently active (the button should exit disco instead of cycling themes). */
  discoActive: boolean;
  /** Whether the resolved theme currently evaluates to dark. */
  isDark: boolean;
  /** `next-themes` setTheme — we accept the `'dark' | 'light'` union so callers don't need to cast. */
  setTheme: (theme: 'dark' | 'light') => void;
}

export type ThemeSelection = 'system' | 'light' | 'dark';

export interface ThemeSelectionParams {
  discoActive: boolean;
  theme: ThemeSelection;
  setTheme: (theme: ThemeSelection) => void;
}

/**
 * Shared disco enter/exit. On active in the browser, best-effort prewarm
 * DiscoMediaLayer then set the store flag. On inactive, just clear the flag.
 * DiscoFlagController still owns dark-on-active and the deferred fetch fallback.
 */
export function runDiscoMode(active: boolean): void {
  if (active && typeof window !== 'undefined') {
    void import('@/components/DiscoMediaLayer').catch(() => {
      /* DiscoFlagController retries lazily — best-effort */
    });
  }
  setDiscoActiveImperative(active);
}

export function runThemeSelection({
  discoActive,
  theme,
  setTheme,
}: ThemeSelectionParams): void {
  if (discoActive) runDiscoMode(false);
  setTheme(theme);
}

/**
 * Fetches the theme-switch samples once someone reaches for a theme control; until then they never download.
 * Idle-scheduled, so opening the first AudioContext never lands inside the tap that opened a menu.
 */
export function prepareThemeSounds(): void {
  const warm = () => {
    void soundManager.prepareSound('theme-dark');
    void soundManager.prepareSound('theme-light');
  };
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 500 });
  else warm();
}

/**
 * Run the theme-toggle side effect. Pure w.r.t. React — safe to call from
 * any event handler. See module header for the branching.
 */
export function runThemeToggle({ discoActive, isDark, setTheme }: ThemeToggleParams): void {
  if (discoActive) {
    runDiscoMode(false);
    return;
  }
  const goingDark = !isDark;
  setTheme(goingDark ? 'dark' : 'light');
  unlockSticker('theme-flipper');
  // Without a warm sample this plays the synthesized cue; the samples are ready for the next switch.
  soundManager.play(goingDark ? 'theme-dark' : 'theme-light');
  prepareThemeSounds();
}
