"use client";

/**
 * AdminConsole — the /admin page's client body.
 *
 * LAYOUT
 *   Matrix-inspired dark card with a subtle digital-rain border treatment
 *   (see `.admin-console__frame::before` in globals.css). Four toggles,
 *   arranged top-to-bottom:
 *     1. Paper grain
 *     2. Tape effects
 *     3. Sketch outlines
 *     4. Enable experimental commands  ← emphasized
 *
 *   The last toggle has a pulsing emerald outer glow and a subtitle
 *   ("All experiments require patience.") which is a subtle nudge at the
 *   20-second wait that gates the `sudo matrix` reveal. Flipping it on
 *   mutates the admin-prefs store, which the terminal's sudo-help output
 *   reads synchronously at next render.
 *
 * LOGOUT
 *   Clears the httpOnly cookie (server) + sessionStorage mirror (client)
 *   and routes the user back to /. After logout, refreshing /admin hits
 *   the `notFound()` branch.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, FileText, PenTool, Sparkles, LogOut, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminPrefsApi, type AdminPrefs } from '@/hooks/useAdminPrefs';
import { logoutAdmin } from '@/lib/adminAuthClient';
import { MATRIX_PUZZLE_KEYS } from '@/lib/matrixPuzzle';

type ToggleKey = keyof Omit<AdminPrefs, 'version'>;

interface ToggleDef {
  key: ToggleKey;
  label: string;
  subtitle: string;
  Icon: typeof Cpu;
  /** Emphasize the final experimental toggle with the pulse + stronger border. */
  emphasized?: boolean;
}

const TOGGLES: readonly ToggleDef[] = [
  {
    key: 'paperGrain',
    label: 'Paper grain',
    subtitle: 'Add the sketchbook paper texture behind every page.',
    Icon: FileText,
  },
  {
    key: 'tapeEffects',
    label: 'Tape effects',
    subtitle: 'Decorative taped edges on notes, stickers, and cards.',
    Icon: Sparkles,
  },
  {
    key: 'sketchOutlines',
    label: 'Sketch outlines',
    subtitle: 'Dashed, hand-drawn borders on sticker cards.',
    Icon: PenTool,
  },
  {
    key: 'experimentalCommands',
    label: 'Enable experimental commands',
    subtitle: 'All experiments require patience.',
    Icon: Cpu,
    emphasized: true,
  },
];

export default function AdminConsole(): React.ReactElement {
  const router = useRouter();
  const { prefs, setPref } = useAdminPrefsApi();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Re-establish the sessionStorage mirror of the admin token on mount.
  // The server-side page gate already validated the httpOnly cookie; this
  // ensures the terminal's puzzle-stage detector (which reads
  // sessionStorage) knows the user is currently authed, even if they
  // cleared sessionStorage or opened /admin directly in a new tab.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!window.sessionStorage.getItem(MATRIX_PUZZLE_KEYS.adminAuthToken)) {
        // The actual token is httpOnly — we can't read it. Store a
        // sentinel so the detector reports "authed" without exposing
        // anything sensitive.
        window.sessionStorage.setItem(MATRIX_PUZZLE_KEYS.adminAuthToken, 'cookie-verified');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onToggle = useCallback(
    (key: ToggleKey) => {
      setPref(key, !prefs[key]);
    },
    [prefs, setPref],
  );

  const onLogout = useCallback(async () => {
    setIsLoggingOut(true);
    await logoutAdmin();
    // Replace so the back button doesn't land back on /admin (which now
    // 404s). Small sleep so the user briefly sees the "logging out…"
    // state, not a jarring instant redirect.
    window.setTimeout(() => {
      router.replace('/');
    }, 180);
  }, [router]);

  return (
    <main
      className="min-h-[100dvh] flex items-center justify-center px-4 py-10 bg-black text-emerald-100"
      role="main"
    >
      <div className="w-full max-w-xl">
        <header className="mb-6 text-center">
          <p className="admin-console__title text-[10px] md:text-xs text-emerald-400/80 font-code">
            root@sketchbook · /admin
          </p>
          <h1 className="mt-2 font-hand text-3xl md:text-5xl font-bold text-emerald-200 leading-none">
            Admin Console
          </h1>
          <p className="mt-2 text-emerald-300/60 font-code text-[11px] md:text-xs tracking-[0.15em] uppercase">
            signed in — session ~8 hours
          </p>
        </header>

        <section
          aria-label="Site preferences"
          className="admin-console__frame relative rounded-lg border border-emerald-500/30 bg-[#03120c]/90 p-4 md:p-6"
        >
          <div className="relative z-10 flex flex-col gap-3">
            {TOGGLES.map((toggle) => {
              const value = prefs[toggle.key];
              return (
                <ToggleRow
                  key={toggle.key}
                  def={toggle}
                  value={value}
                  onToggle={onToggle}
                />
              );
            })}
          </div>
        </section>

        <footer className="mt-6 flex flex-col-reverse md:flex-row md:justify-between gap-3 items-stretch">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/15 transition-colors font-code text-xs tracking-[0.2em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            <Home size={14} aria-hidden />
            back home
          </button>

          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className={cn(
              'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded font-code text-xs tracking-[0.2em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300',
              isLoggingOut
                ? 'bg-emerald-500/20 text-emerald-300 cursor-wait'
                : 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/50 hover:bg-emerald-500/25',
            )}
            aria-label="Sign out of the admin console"
          >
            <LogOut size={14} aria-hidden />
            {isLoggingOut ? 'signing out…' : 'sign out'}
          </button>
        </footer>

        <p className="mt-6 text-center text-emerald-300/40 font-code text-[10px] md:text-[11px] leading-relaxed">
          Preferences save to your browser. They change how the portfolio{' '}
          <em>looks</em> — not who Dhruv is.
        </p>
      </div>
    </main>
  );
}

interface ToggleRowProps {
  def: ToggleDef;
  value: boolean;
  onToggle: (key: ToggleKey) => void;
}

function ToggleRow({ def, value, onToggle }: ToggleRowProps): React.ReactElement {
  const { key, label, subtitle, Icon, emphasized } = def;
  return (
    <label
      className={cn(
        'relative flex items-start gap-3 rounded-md border px-4 py-3 cursor-pointer select-none transition-colors',
        emphasized
          ? 'border-emerald-400/70 bg-emerald-500/10 admin-toggle--experimental'
          : 'border-emerald-500/20 bg-[#021008]/80 hover:bg-emerald-500/5',
      )}
    >
      <Icon size={18} className="shrink-0 mt-0.5 text-emerald-300" aria-hidden />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-code text-sm md:text-base leading-snug',
            emphasized ? 'text-emerald-100 font-bold' : 'text-emerald-200',
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            'font-code text-[11px] md:text-xs leading-snug mt-1',
            emphasized ? 'italic text-emerald-300/85' : 'text-emerald-300/55',
          )}
        >
          {subtitle}
        </p>
      </div>
      <input
        type="checkbox"
        className="sr-only"
        checked={value}
        onChange={() => onToggle(key)}
        aria-label={label}
      />
      <span
        aria-hidden
        className={cn(
          'relative inline-flex w-11 h-6 rounded-full border transition-colors shrink-0 mt-0.5',
          value
            ? 'bg-emerald-400/70 border-emerald-200'
            : 'bg-emerald-900/60 border-emerald-600/50',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 inline-block w-4 h-4 rounded-full bg-[#041a10] shadow-md transition-transform',
            value ? 'translate-x-6' : 'translate-x-0.5',
          )}
        />
      </span>
    </label>
  );
}
