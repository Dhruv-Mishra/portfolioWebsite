/**
 * Sudo commands — the hidden command set that becomes available after the
 * Superuser sticker is earned.
 *
 * Integration contract:
 *   - Called from `lib/terminalCommands.tsx` → `sudo` handler.
 *   - The terminal normalizes "sudo <cmd> <args...>"; we receive the sub-
 *     command + its own args.
 *   - Each handler returns `{ output, action? }` — same shape as regular
 *     commands, so no special wiring is required.
 *   - Parsing is exported as `parseSudoInvocation` so the terminal can call it
 *     directly and unit tests can exercise it in isolation.
 *
 * Gating:
 *   - Before the Superuser sticker is awarded, EVERY sudo invocation returns a
 *     playful "Permission denied" message. The parser does not peek at state —
 *     the gating happens in terminalCommands.tsx which reads the store.
 *   - The parser itself is pure: same input → same output.
 */
import React from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { stickerBus } from '@/lib/stickerBus';
import {
  setDiscoActiveImperative,
  resetStickerProgressImperative,
} from '@/hooks/useStickers';

// Note: `konami` was removed as a sudo command — the emit path couldn't
// re-play the celebration for already-earned stickers (store dedupes), so it
// just echoed text. Leaving `stickerBus` imported for the cheatsheet emit.

// ─── Types ──────────────────────────────────────────────────────────────
export interface SudoCommandResult {
  output: React.ReactNode;
  action?: () => void;
}

export type SudoCommandHandler = (args: string[]) => SudoCommandResult;

export interface SudoInvocation {
  subcommand: string | null;
  args: string[];
}

export interface SudoCommandSpec {
  /** Canonical command name (the part after `sudo `). */
  name: string;
  /** One-line description used by `sudo help` and the AI chat. */
  description: string;
}

/**
 * List of hidden sudo commands, in the order `sudo help` renders them.
 * Kept as a plain array so unit tests can iterate it without importing React.
 */
export const SUDO_COMMAND_SPECS: readonly SudoCommandSpec[] = [
  { name: 'help',       description: 'Lists every hidden sudo command.' },
  { name: 'cheatsheet', description: 'Reveals the full sticker cheatsheet.' },
  { name: 'disco',      description: 'Toggles a cycling disco theme. `off` to exit.' },
  { name: 'matrix',     description: 'Short matrix-rain overlay (~8s).' },
  { name: 'rainbow',    description: 'Rainbow-underline every link on the page.' },
  { name: 'fortune',    description: 'Prints a one-line Dhruv-voice quote.' },
  { name: 'whoami',     description: 'Identifies you as root, with flourish.' },
  { name: 'reset',      description: 'Wipes all sticker progress (confirm y/N).' },
] as const;

/**
 * Parse a raw argv list (everything AFTER the bare word `sudo`).
 * Empty args means the user typed only "sudo" — we treat that as a request for
 * help (once authorized).
 */
export function parseSudoInvocation(args: readonly string[]): SudoInvocation {
  if (args.length === 0) {
    return { subcommand: null, args: [] };
  }
  const [head, ...rest] = args;
  return { subcommand: head.toLowerCase(), args: rest };
}

/** Denied response — shown whenever sudo is invoked pre-superuser. */
export const SUDO_DENIED_NODE: React.ReactNode = (
  <div>
    <span className="text-gray-500">[sudo] password for visitor:</span>{' '}
    <span className="text-red-400 font-bold">Permission denied.</span>{' '}
    <span className="text-gray-400">You haven&apos;t earned it yet :P</span>
  </div>
);

// ─── Static content used by several commands ────────────────────────────

const DHRUV_FORTUNES: readonly string[] = [
  'Fast code beats clever code; clever *and* fast wins the review.',
  'Don\'t optimize what you can\'t measure. Don\'t measure what you can\'t reproduce.',
  'The best abstraction is the one you didn\'t need.',
  'Production is always right. Your local machine is a liar.',
  'Cache invalidation is a social problem disguised as a technical one.',
  'If the tests pass and the user complains, the tests are wrong.',
  'Small PRs get merged. Large PRs get archived.',
  'Every graph eventually flattens. Ship before it does.',
  'Boring code in production is a compliment.',
  'Competitive programming teaches you the cost of being wrong quickly.',
  'The feature you ship on Friday is the bug you fix on Monday.',
  'Observability is the second API you ship to your users.',
];

function pickFortune(): string {
  const idx = Math.floor(Math.random() * DHRUV_FORTUNES.length);
  return DHRUV_FORTUNES[idx];
}

// ─── Help output ────────────────────────────────────────────────────────

function renderSudoHelp(): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-emerald-300">
        <span className="font-bold">root@sketchbook</span>:~#{' '}
        <span className="text-gray-500">hidden commands unlocked</span>
      </p>
      {SUDO_COMMAND_SPECS.map((spec) => (
        <p key={spec.name} className="pl-4">
          <span className="text-amber-300 font-bold">sudo {spec.name}</span>{' '}
          <span className="text-gray-500">— {spec.description}</span>
        </p>
      ))}
      <p className="pl-4 text-gray-500 italic mt-2">
        tip: `sudo disco off` returns to the previous theme.
      </p>
    </div>
  );
}

// ─── whoami ─────────────────────────────────────────────────────────────

function renderWhoami(): React.ReactNode {
  const now = typeof window === 'undefined'
    ? 'session-start'
    : new Date().toLocaleString(undefined, { hour12: false });
  return (
    <div>
      <pre className="text-amber-300 font-code text-xs md:text-sm leading-[1.2] whitespace-pre">{`
  ____   ___   ___ _____
 |  _ \\ / _ \\ / _ \\_   _|
 | |_) | | | | | | || |
 |  _ <| |_| | |_| || |
 |_| \\_\\\\___/ \\___/ |_|
`}</pre>
      <p className="text-emerald-400 font-bold">dhruv@sketchbook ~ # root since {now}</p>
      <p className="text-gray-500 italic text-sm mt-1">
        privileges: sudo ✓ &nbsp; disco ✓ &nbsp; matrix ✓
      </p>
    </div>
  );
}

// ─── disco ──────────────────────────────────────────────────────────────

function handleDisco(args: string[]): SudoCommandResult {
  const sub = args[0]?.toLowerCase();
  const turnOff = sub === 'off' || sub === 'stop' || sub === 'false' || sub === '0';
  if (turnOff) {
    return {
      output: (
        <div>
          <span className="text-emerald-400">✓</span>{' '}
          <span className="text-gray-400">Disco disengaged.</span>
        </div>
      ),
      action: () => {
        setDiscoActiveImperative(false);
      },
    };
  }
  return {
    output: (
      <div>
        <span className="text-fuchsia-300 font-bold">✨ disco mode: engaged</span>
        <p className="text-gray-500 italic text-sm mt-1">
          everything&apos;s cycling. type `sudo disco off` when you&apos;ve had enough.
        </p>
      </div>
    ),
    action: () => {
      // Pre-warm the heavy disco media chunk on the same user-gesture tick
      // that sets the flag. Without this, there's a visible ~100ms gap while
      // the bundle is fetched + parsed before sparkles/spotlights appear.
      // The promise is intentionally not awaited — if it fails we fall back
      // to the deferred fetch in DiscoFlagController.
      if (typeof window !== 'undefined') {
        void import('@/components/DiscoMediaLayer').catch(() => {
          /* fetch will be retried by DiscoFlagController — best-effort */
        });
      }
      setDiscoActiveImperative(true);
    },
  };
}

// ─── matrix ─────────────────────────────────────────────────────────────

function handleMatrix(): SudoCommandResult {
  return {
    output: (
      <div>
        <span className="text-emerald-400 font-bold">&gt; wake up, Neo...</span>
        <p className="text-gray-500 text-xs italic mt-1">
          Following the white rabbit for ~8 seconds.
        </p>
      </div>
    ),
    action: () => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('sudo:matrix'));
    },
  };
}

// ─── rainbow ────────────────────────────────────────────────────────────

function handleRainbow(): SudoCommandResult {
  return {
    output: (
      <div>
        <span className="text-pink-300 font-bold">🌈 rainbow mode: on</span>
        <p className="text-gray-500 text-xs italic mt-1">
          every link on this session now wears a rainbow underline.
        </p>
      </div>
    ),
    action: () => {
      if (typeof window === 'undefined') return;
      document.documentElement.dataset.sudoRainbow = 'on';
    },
  };
}

// ─── fortune ────────────────────────────────────────────────────────────

function handleFortune(): SudoCommandResult {
  const quote = pickFortune();
  return {
    output: (
      <div className="border-l-2 border-amber-400/50 pl-3 py-1 my-1">
        <p className="italic text-amber-200">&quot;{quote}&quot;</p>
        <p className="text-xs text-gray-500 mt-1">— dhruv, probably</p>
      </div>
    ),
  };
}

// ─── reset ──────────────────────────────────────────────────────────────

function handleReset(args: string[]): SudoCommandResult {
  const confirm = args[0]?.toLowerCase();
  const yes = confirm === 'yes' || confirm === 'y' || confirm === '--confirm' || confirm === '--yes';
  if (!yes) {
    return {
      output: (
        <div>
          <p className="text-red-400 font-bold">⚠  this wipes every sticker + progress.</p>
          <p className="text-gray-400 text-sm mt-1">
            run <span className="font-bold text-amber-300">sudo reset yes</span>{' '}
            to confirm. cannot be undone.
          </p>
        </div>
      ),
    };
  }
  return {
    output: (
      <div>
        <span className="text-emerald-400 font-bold">✓ progress wiped.</span>{' '}
        <span className="text-gray-400">starting fresh ~</span>
      </div>
    ),
    action: () => {
      resetStickerProgressImperative();
      if (typeof document !== 'undefined') {
        delete document.documentElement.dataset.sudoRainbow;
      }
    },
  };
}

// ─── Unknown sub-command ────────────────────────────────────────────────

function renderUnknown(sub: string): React.ReactNode {
  return (
    <div>
      <span className="text-red-400 font-bold">sudo: {sub}: command not found</span>
      <p className="text-gray-500 text-sm mt-1">
        try <span className="text-emerald-400 font-bold">sudo help</span> for the list.
      </p>
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────

interface SudoDispatchContext {
  /** Router — for any command that wants to navigate (none currently do, but keeps the API extensible). */
  router?: AppRouterInstance;
  /** Callback to inject a live cheatsheet into the output. Injected by the
   *  terminal since CheatsheetOutput pulls from the sticker store. */
  renderCheatsheet: () => React.ReactNode;
}

/**
 * Dispatch a parsed sudo invocation. Always returns a result — unknown
 * sub-commands yield a friendly error.
 */
export function dispatchSudo(
  invocation: SudoInvocation,
  ctx: SudoDispatchContext,
): SudoCommandResult {
  const { subcommand, args } = invocation;
  if (!subcommand || subcommand === 'help') {
    return { output: renderSudoHelp() };
  }
  switch (subcommand) {
    case 'cheatsheet':
      return {
        output: (
          <div>
            <span className="text-gray-500">[sudo] password for visitor:</span>{' '}
            <span className="text-emerald-400 font-bold">access granted ✓</span>
            <div className="mt-2">{ctx.renderCheatsheet()}</div>
          </div>
        ),
        action: () => {
          stickerBus.emit('cheat-codes');
        },
      };
    case 'disco':
      return handleDisco(args);
    case 'matrix':
      return handleMatrix();
    case 'rainbow':
      return handleRainbow();
    case 'fortune':
      return handleFortune();
    case 'whoami':
      return { output: renderWhoami() };
    case 'reset':
      return handleReset(args);
    default:
      return { output: renderUnknown(subcommand) };
  }
}
