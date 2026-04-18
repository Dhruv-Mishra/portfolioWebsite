/**
 * Shared theme-toggle action — unifies the handler path used by the desktop
 * `ThemeToggle` and the mobile `MobileThemeButton` in `SocialSidebar`. Before
 * this module existed the two buttons diverged: the mobile variant didn't
 * subscribe to `discoActive` and just flipped between light/dark, so pressing
 * it while disco was on cycled light↔dark without clearing `data-disco="on"`
 * — leaving sparkles, spotlights, and the body gradient behind on iOS Safari
 * (Bug 2b) and also never rendering the disco-ball icon on mobile (Bug 2c).
 *
 * The exported `runThemeToggle` applies the exact same branching as the
 * desktop handler:
 *   - If disco is active → clear the disco flag via
 *     `setDiscoActiveImperative(false)`. Return without touching the
 *     underlying light/dark theme — `next-themes` keeps whatever the user
 *     had before disco engaged. The `data-disco="on"` attribute is cleared
 *     inside `DiscoFlagController`'s effect that subscribes to the same
 *     store flag, and that effect is idempotent whether the flip originated
 *     from terminal OR from either theme button.
 *   - Otherwise cycle light ↔ dark, fire the theme-flipper sticker emit,
 *     and play the matching audio tag (cricket / rooster).
 *
 * The helper is intentionally plain — it accepts the store setter from
 * `next-themes` and the "is currently dark" boolean so it stays trivial
 * to test without a full React tree.
 */
import { setDiscoActiveImperative } from '@/hooks/useStickers';
import { stickerBus } from '@/lib/stickerBus';
import { soundManager } from '@/lib/soundManager';

export interface ThemeToggleParams {
  /** True when disco is currently active (the button should exit disco instead of cycling themes). */
  discoActive: boolean;
  /** Whether the resolved theme currently evaluates to dark. */
  isDark: boolean;
  /** `next-themes` setTheme — we accept the `'dark' | 'light'` union so callers don't need to cast. */
  setTheme: (theme: 'dark' | 'light') => void;
}

/**
 * Run the theme-toggle side effect. Pure w.r.t. React — safe to call from
 * any event handler. See module header for the branching.
 */
export function runThemeToggle({ discoActive, isDark, setTheme }: ThemeToggleParams): void {
  if (discoActive) {
    setDiscoActiveImperative(false);
    return;
  }
  const goingDark = !isDark;
  setTheme(goingDark ? 'dark' : 'light');
  stickerBus.emit('theme-flipper');
  soundManager.play(goingDark ? 'theme-dark' : 'theme-light');
}
