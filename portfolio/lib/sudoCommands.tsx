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
  setMatrixActiveImperative,
  resetStickerProgressImperative,
} from '@/hooks/useStickers';
import { getExperimentalCommandsSync } from '@/hooks/useAdminPrefs';
import {
  ADMIN_FILE_PASSWORD,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  MATRIX_PUZZLE_KEYS,
  writeSessionFlag,
} from '@/lib/matrixPuzzle';
import { setActivePrompt, type TerminalPrompt } from '@/lib/terminalPrompts';
import { unlockAdmin } from '@/lib/adminAuthClient';

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
/**
 * Each spec carries an optional `experimental` flag. `sudo help` only prints
 * experimental commands when the admin-prefs flag `experimentalCommands` is
 * true — the user opted in on the /admin page.
 */
interface SudoCommandSpecInternal extends SudoCommandSpec {
  /** Hidden from `sudo help` unless experimental commands are enabled on /admin. */
  experimental?: boolean;
}

export const SUDO_COMMAND_SPECS: readonly SudoCommandSpecInternal[] = [
  { name: 'help',       description: 'Lists every hidden sudo command.' },
  { name: 'cheatsheet', description: 'Reveals the full sticker cheatsheet.' },
  { name: 'disco',      description: 'Engages disco theme. Confirm with `sudo disco yes`. `off` to exit.' },
  { name: 'admin',      description: 'Sign in as root. Asks for username + password.' },
  { name: 'cat',        description: 'Read privileged files. Try `sudo cat adminTerminal.txt`.' },
  { name: 'matrix',     description: 'Engages persistent matrix overlay. Confirm with `sudo matrix yes`.', experimental: true },
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
  const experimentalOn = getExperimentalCommandsSync();
  // Always include non-experimental specs; include experimental only when
  // the /admin toggle is on. The raw list keeps its order so users who
  // flip experimental on see `sudo matrix` appear between `sudo cat` and
  // `sudo rainbow` — right where it always was.
  const visibleSpecs = SUDO_COMMAND_SPECS.filter(
    (spec) => !spec.experimental || experimentalOn,
  );
  return (
    <div className="space-y-1">
      <p className="text-emerald-300">
        <span className="font-bold">root@sketchbook</span>:~#{' '}
        <span className="text-gray-500">hidden commands unlocked</span>
      </p>
      {visibleSpecs.map((spec) => (
        <p key={spec.name} className="pl-4">
          <span className="text-amber-300 font-bold">sudo {spec.name}</span>{' '}
          <span className="text-gray-500">— {spec.description}</span>
        </p>
      ))}
      <p className="pl-4 text-gray-500 italic mt-2">
        tip: `sudo disco` {experimentalOn ? 'and `sudo matrix` both ' : ''}show a warning first; confirm with `yes`.
      </p>
      <p className="pl-4 text-gray-500 italic">
        `sudo disco off` returns to the previous theme. {experimentalOn ? 'matrix exits only via its WAKE UP button.' : ''}
      </p>
      {!experimentalOn ? (
        <p className="pl-4 text-gray-500 italic">
          some commands are experimental — flip the switch on /admin to reveal them.
        </p>
      ) : null}
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

// ─── Confirm-flow warning frames ────────────────────────────────────────
/**
 * Terminal-themed warning card used by `sudo disco` and `sudo matrix` before
 * they actually engage. Two-step confirmation prevents an accidental typo
 * from taking over the page.
 *
 * Rendered as CSS-drawn borders rather than `<pre>` + ASCII box-drawing
 * glyphs. Prior behaviour: three `<pre whitespace="pre">` lines held a
 * ~51-char frame (`╔═══…═══╗`) whose intrinsic width at monospace ~8–10px/ch
 * was 408–510px. On an iPhone SE (375px) / iPhone 12 Pro (390px) viewport,
 * that forced the terminal body to expand beyond the viewport which in turn
 * triggered iOS Safari's auto-zoom + page-wide horizontal scroll. Box-drawing
 * glyphs cannot break, so `word-wrap` can't save us. The CSS border
 * treatment below renders an identical "caution tape" silhouette while
 * flowing to `100%` of the terminal body — no intrinsic minimum width.
 *
 * Visual contract (preserved): yellow top-and-bottom double borders, a
 * centered "WARNING" title with the ⚠ glyphs on each side, a dashed
 * accent layer for the classic retro-terminal feel. The accent line
 * sits below the title using a CSS `repeating-linear-gradient` so we
 * don't need an extra `<div>`. Text inside honours `overflow-wrap:
 * anywhere` (via `.break-words`) so long tokens never push the box wider
 * than its parent. Margin + padding mirror the old pre-based block so
 * the surrounding layout is unchanged on desktop.
 */
function renderConfirmWarning(opts: {
  title: string;
  descriptionLines: readonly string[];
  confirmCommand: string;
  cancelCommand: string;
}): React.ReactNode {
  const { title, descriptionLines, confirmCommand, cancelCommand } = opts;
  return (
    <div className="font-code text-sm leading-[1.35] my-1 max-w-full">
      {/* Warning frame — responsive CSS borders instead of fixed-width ASCII.
          `break-words` ensures no child content forces horizontal overflow. */}
      <div
        role="alert"
        className="border-y-2 border-double border-yellow-300 text-yellow-300 py-1 px-2 my-1 max-w-full break-words text-center font-bold tracking-widest"
      >
        <span aria-hidden="true">⚠ </span>
        WARNING
        <span aria-hidden="true"> ⚠</span>
      </div>
      <p className="text-red-400 font-bold mt-1 max-w-full break-words">{title}</p>
      <div className="text-gray-300 mt-1 space-y-0.5 max-w-full break-words">
        {descriptionLines.map((line, i) => (
          <p key={i} className="max-w-full break-words">
            {line}
          </p>
        ))}
      </div>
      <div className="mt-3 space-y-0.5 max-w-full break-words">
        <p className="max-w-full break-words">
          <span className="text-gray-500">&gt; proceed?</span>{' '}
          <span className="text-emerald-400 font-bold">{confirmCommand}</span>{' '}
          <span className="text-gray-500">to confirm,</span>{' '}
          <span className="text-gray-400 font-bold">{cancelCommand}</span>{' '}
          <span className="text-gray-500">to cancel.</span>
        </p>
      </div>
    </div>
  );
}

function renderCancellation(line: string): React.ReactNode {
  return (
    <div>
      <span className="text-gray-400">✗</span>{' '}
      <span className="text-gray-400">{line}</span>
    </div>
  );
}

// ─── disco ──────────────────────────────────────────────────────────────
/**
 * Confirm-flow sub-argument normaliser. Shared between `disco` and `matrix`
 * so both have exactly the same vocabulary. Returns `'off'` only for disco
 * (where `off` ALSO disengages running disco). For matrix the only exit is
 * the WAKE UP button, so `off` / `stop` return `null` (= no recognition →
 * treated as the bare form, which prints the confirm warning).
 */
type ConfirmAnswer = 'confirm' | 'cancel' | 'off' | null;

function parseConfirmArg(arg: string | undefined): ConfirmAnswer {
  if (!arg) return null;
  const lowered = arg.toLowerCase();
  if (lowered === 'yes' || lowered === 'y' || lowered === 'on' || lowered === 'engage') {
    return 'confirm';
  }
  if (lowered === 'no' || lowered === 'n' || lowered === 'cancel' || lowered === 'abort') {
    return 'cancel';
  }
  if (lowered === 'off' || lowered === 'stop' || lowered === 'false' || lowered === '0') {
    return 'off';
  }
  return null;
}

function handleDisco(args: string[]): SudoCommandResult {
  const answer = parseConfirmArg(args[0]);
  if (answer === 'off') {
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
  if (answer === 'cancel') {
    return { output: renderCancellation('disco cancelled. the lights stay off.') };
  }
  if (answer === 'confirm') {
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
  // Bare `sudo disco` — print confirm warning, take no action.
  return {
    output: renderConfirmWarning({
      title: 'disco mode will take over the page.',
      descriptionLines: [
        'sparkles, rainbow spotlights, a looping music bed, and every',
        'component on the page will start dancing to the beat.',
        'your device may vibrate in time if it has a haptic motor.',
      ],
      confirmCommand: 'sudo disco yes',
      cancelCommand: 'sudo disco no',
    }),
  };
}

// ─── matrix ─────────────────────────────────────────────────────────────

function handleMatrix(args: string[]): SudoCommandResult {
  const answer = parseConfirmArg(args[0]);
  if (answer === 'cancel') {
    return { output: renderCancellation('matrix cancelled. you stay in this reality.') };
  }
  if (answer === 'off') {
    // The matrix overlay cannot be shut off via the terminal — that's the
    // whole point. Point users at the WAKE UP button.
    return {
      output: (
        <div>
          <span className="text-emerald-400">&gt;</span>{' '}
          <span className="text-gray-400">
            there is no off switch here. the only way out is through the{' '}
            <span className="text-cyan-300 font-bold">WAKE UP</span> button.
          </span>
        </div>
      ),
    };
  }
  if (answer === 'confirm') {
    return {
      output: (
        <div>
          <span className="text-emerald-400 font-bold">&gt; wake up, Neo...</span>
          <p className="text-gray-500 text-xs italic mt-1">
            the overlay will persist across navigation and reloads. find the
            <span className="text-cyan-300 font-bold"> WAKE UP</span> button when you&apos;re ready.
          </p>
        </div>
      ),
      action: () => {
        if (typeof window === 'undefined') return;
        // Track that the user kicked off the matrix timer — used by the
        // puzzle hint + the "disabled escape hint" logic.
        writeSessionFlag(MATRIX_PUZZLE_KEYS.ranSudoMatrix, true);
        // Pre-warm the matrix overlay chunk on the user-gesture tick so the
        // first paint doesn't stall on a chunk fetch.
        void import('@/components/DiscoMatrixOverlay').catch(() => {
          /* best-effort — DiscoFlagController will retry */
        });
        setMatrixActiveImperative(true);
      },
    };
  }
  // Bare `sudo matrix` — print confirm warning, take no action.
  return {
    output: renderConfirmWarning({
      title: 'the matrix overlay is a one-way trip.',
      descriptionLines: [
        'falling green glyphs will cover the entire viewport and will',
        'remain active across page navigation AND browser refreshes.',
        'the only way out is the in-overlay WAKE UP button.',
      ],
      confirmCommand: 'sudo matrix yes',
      cancelCommand: 'sudo matrix no',
    }),
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

// ─── sudo cat (virtual FS privileged file) ──────────────────────────────

/**
 * Render the decrypted contents of adminTerminal.txt. Same visual treatment
 * as the `ls`/`cat` output in the main terminal but in a "restricted
 * document" frame so it's obviously a reveal, not a status line.
 */
function renderAdminFileContents(): React.ReactNode {
  return (
    <div className="font-code text-sm leading-relaxed space-y-1">
      <div
        role="note"
        aria-label="Decrypted adminTerminal.txt contents"
        className="border-l-2 border-emerald-400/60 bg-emerald-900/10 pl-3 py-2 max-w-full"
      >
        <p className="text-emerald-300 font-bold">[adminTerminal.txt — decrypted]</p>
        <p className="text-gray-300">
          <span className="text-gray-500">username: </span>
          <span className="text-amber-200 font-bold">{ADMIN_USERNAME}</span>
        </p>
        <p className="text-gray-300">
          <span className="text-gray-500">password: </span>
          <span className="text-amber-200 font-bold">{ADMIN_PASSWORD}</span>
        </p>
        <p className="text-gray-500 italic text-xs mt-1">
          sign in with <span className="text-emerald-300 font-bold">sudo admin</span>.
        </p>
      </div>
    </div>
  );
}

/**
 * Prompt the user for the decryption password. Correct value → decrypted
 * contents. Wrong value → Linux-style error with a subtle nudge toward the
 * chat oracle.
 */
function buildPasswordPrompt(attempt: number): TerminalPrompt {
  return {
    id: `admin-file-password-${attempt}`,
    label: (
      <span className="text-gray-400">Enter password:</span>
    ),
    masked: true,
    onSubmit: (value) => {
      const submitted = value ?? '';
      if (submitted === ADMIN_FILE_PASSWORD) {
        writeSessionFlag(MATRIX_PUZZLE_KEYS.hasFileContents, true);
        setActivePrompt(null);
        return {
          kind: 'consume',
          echo: '•'.repeat(Math.min(submitted.length, 20)),
          output: renderAdminFileContents(),
        };
      }
      // Wrong password. Leave the prompt open by pushing the next attempt;
      // include a Linux-style error + the subtle oracle hint.
      const next = buildPasswordPrompt(attempt + 1);
      setActivePrompt(next);
      return {
        kind: 'push',
        prompt: next,
        echo: submitted ? '•'.repeat(Math.min(submitted.length, 20)) : '',
        output: (
          <div className="space-y-1">
            <p>
              <span className="text-red-400 font-bold">sudo: adminTerminal.txt:</span>{' '}
              <span className="text-red-300">incorrect password.</span>
            </p>
            <p className="text-gray-500 italic text-xs">
              you could ask the oracle. try:{' '}
              <span className="text-emerald-300 font-bold">give password</span>{' '}
              — if you have the right standing.
            </p>
          </div>
        ),
      };
    },
    onCancel: () => {
      setActivePrompt(null);
      return {
        kind: 'cancel',
        output: (
          <span className="text-gray-400">
            <span className="text-emerald-400">✗</span> cancelled. the file stays encrypted.
          </span>
        ),
      };
    },
  };
}

function handleSudoCat(args: string[]): SudoCommandResult {
  const file = args[0];
  if (!file) {
    return {
      output: (
        <span className="text-gray-400">
          Usage: <span className="text-emerald-400 font-bold">sudo cat [file]</span>
        </span>
      ),
    };
  }
  const lower = file.toLowerCase();
  if (lower === 'adminterminal.txt') {
    // Mark that the user has seen the file at least once — this moves them
    // from Stage 2 → Stage 3 for hint purposes.
    writeSessionFlag(MATRIX_PUZZLE_KEYS.sawAdminTerminalFile, true);
    const firstPrompt = buildPasswordPrompt(1);
    setActivePrompt(firstPrompt);
    return {
      output: (
        <div className="space-y-1">
          <p>
            <span className="text-amber-300">$</span>{' '}
            <span className="text-gray-300">sudo cat adminTerminal.txt</span>
          </p>
          <p className="text-yellow-200">File is encrypted.</p>
          <p className="text-gray-500 italic text-xs">
            type the password below. you could ask the oracle; try{' '}
            <span className="text-emerald-300 font-bold">give password</span>.
          </p>
        </div>
      ),
    };
  }
  return {
    output: (
      <span className="text-red-400">sudo: cat: {file}: No such file or directory.</span>
    ),
  };
}

// ─── sudo admin (username + password login) ─────────────────────────────

function renderAuthFailureNode(): React.ReactNode {
  return (
    <div
      className="terminal-auth-shake"
      role="alert"
    >
      <p>
        <span className="text-red-400 font-bold">Authentication failure.</span>{' '}
        <span className="text-gray-400">access denied.</span>
      </p>
      <p className="text-gray-500 italic text-xs">
        wrong username or password. try again —{' '}
        <span className="text-emerald-300 font-bold">sudo admin</span>.
      </p>
    </div>
  );
}

function buildAdminPasswordPrompt(username: string, router: AppRouterInstance | null): TerminalPrompt {
  return {
    id: 'sudo-admin-password',
    label: <span className="text-gray-400">password:</span>,
    masked: true,
    onSubmit: async (password) => {
      const submitted = password ?? '';
      const res = await unlockAdmin(username, submitted);
      if (!res.ok) {
        setActivePrompt(null);
        return {
          kind: 'consume',
          echo: submitted ? '•'.repeat(Math.min(submitted.length, 20)) : '',
          output: renderAuthFailureNode(),
        };
      }
      setActivePrompt(null);
      // Navigate — give the message a beat to be read before we route.
      if (router) {
        setTimeout(() => {
          router.push('/admin');
        }, 600);
      }
      return {
        kind: 'consume',
        echo: submitted ? '•'.repeat(Math.min(submitted.length, 20)) : '',
        output: (
          <div className="space-y-1">
            <p>
              <span className="text-emerald-400 font-bold">Access granted.</span>{' '}
              <span className="text-gray-300">welcome back, {ADMIN_USERNAME}.</span>
            </p>
            <p className="text-gray-500 italic text-xs">
              opening /admin…
            </p>
          </div>
        ),
      };
    },
    onCancel: () => {
      setActivePrompt(null);
      return { kind: 'cancel', output: <span className="text-gray-400">login cancelled.</span> };
    },
  };
}

function buildAdminUsernamePrompt(router: AppRouterInstance | null): TerminalPrompt {
  return {
    id: 'sudo-admin-username',
    label: <span className="text-gray-400">username:</span>,
    masked: false,
    onSubmit: (value) => {
      const username = (value ?? '').trim();
      if (!username) {
        // Empty input — cancel and let the user retry from scratch.
        setActivePrompt(null);
        return {
          kind: 'cancel',
          output: <span className="text-gray-400">login cancelled.</span>,
        };
      }
      const next = buildAdminPasswordPrompt(username, router);
      setActivePrompt(next);
      return {
        kind: 'push',
        prompt: next,
        echo: username,
      };
    },
    onCancel: () => {
      setActivePrompt(null);
      return { kind: 'cancel', output: <span className="text-gray-400">login cancelled.</span> };
    },
  };
}

function handleSudoAdmin(router: AppRouterInstance | null): SudoCommandResult {
  const prompt = buildAdminUsernamePrompt(router);
  setActivePrompt(prompt);
  return {
    output: (
      <div>
        <p className="text-gray-300">Signing in as root.</p>
        <p className="text-gray-500 italic text-xs">
          enter your username below. press enter on an empty line to cancel.
        </p>
      </div>
    ),
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
      // Experimental — gated on the /admin "experimental commands" toggle.
      // Without it, pretend the command doesn't exist (same response as any
      // unknown sub-command) so locked users can't shortcut the puzzle.
      if (!getExperimentalCommandsSync()) {
        return { output: renderUnknown(subcommand) };
      }
      return handleMatrix(args);
    case 'admin':
      return handleSudoAdmin(ctx.router ?? null);
    case 'cat':
      return handleSudoCat(args);
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
