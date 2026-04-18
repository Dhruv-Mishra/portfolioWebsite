/**
 * Matrix Puzzle — the multi-stage "Escape the Matrix" experience.
 *
 * ARCHITECTURE
 * ────────────
 * The puzzle has 9 discrete stages (see STAGE numbering below). The user's
 * current stage is derived at read time from a handful of persisted signals
 * so we never have a "true" state that can drift out of sync with the
 * underlying data. This is important because the user can:
 *   - reload mid-flow (sessionStorage survives, non-transient flags in
 *     localStorage also survive)
 *   - clear sessionStorage and still have a sensible progress reading
 *   - re-run `sudo matrix` multiple times
 *
 * SIGNALS
 * ───────
 * Persistent (localStorage via existing sticker store):
 *   - `superuser` sticker earned → user has sudo (Stage 1 → Stage 2)
 *   - `matrixEscaped` → user has already completed the entire chain
 *     (terminal puzzle) — once true, remains forever.
 *
 * Persistent (localStorage on a dedicated admin-prefs store):
 *   - `experimentalCommandsEnabled` → user toggled the final switch on /admin
 *     (Stage 5 → Stage 6). Controlled by `useAdminPrefs`.
 *
 * Transient (sessionStorage — cleared on tab close):
 *   - `sawAdminTerminalFile` → user did `sudo cat adminTerminal.txt` at
 *     least once (Stage 2 tick).
 *   - `hasFileContents` → user successfully decrypted adminTerminal.txt
 *     with the correct password (Stage 3 → Stage 4).
 *   - `adminAuthUnlocked` → user successfully ran `sudo admin` + correct
 *     credentials AND redirected to /admin (Stage 4 → Stage 5). Survives
 *     reloads because the auth token lives in sessionStorage and is
 *     validated on /admin mount.
 *   - `ranSudoMatrix` → user kicked off the 20-second timer at least once
 *     (used for the "disabled escape button" state) — Stage 6.
 *   - `clickedDisabledEscape` → user clicked the grayed escape button
 *     before disco mode was active (hint nudge).
 *
 * RETURNED STAGE
 * ──────────────
 * `getCurrentStage(signals)` returns the HIGHEST stage the signals prove.
 * Hints are picked off this number.
 */

// ─── Stage enum ────────────────────────────────────────────────────────────
export const MATRIX_STAGE = {
  /** Stage 1: no sudo yet — still collecting stickers */
  COLLECTING_STICKERS: 1,
  /** Stage 2: has sudo, hasn't done `sudo cat adminTerminal.txt` */
  HAS_SUDO: 2,
  /** Stage 3: saw adminTerminal.txt encrypted prompt, hasn't decrypted it */
  SAW_ENCRYPTED_FILE: 3,
  /** Stage 4: has file contents (dhruv@root + theMatrixHasYou) — needs `sudo admin` */
  HAS_FILE_CONTENTS: 4,
  /** Stage 5: on /admin or has visited /admin — hasn't flipped experimental */
  ADMIN_UNLOCKED: 5,
  /** Stage 6: experimental commands ON — hasn't run sudo matrix yet */
  EXPERIMENTAL_ON: 6,
  /** Stage 7: ran sudo matrix, clicked disabled escape — disco mode needed */
  SAW_DISABLED_ESCAPE: 7,
  /** Stage 8: disco mode on + waiting out 20s — escape button will enable */
  DISCO_WAITING: 8,
  /** Stage 9: escaped — flag set forever */
  ESCAPED: 9,
} as const;

export type MatrixStage = (typeof MATRIX_STAGE)[keyof typeof MATRIX_STAGE];

// ─── Signal shape ──────────────────────────────────────────────────────────

/**
 * All the inputs used to derive the current stage. Kept plain + serializable
 * so tests can construct them inline.
 */
export interface MatrixPuzzleSignals {
  /** localStorage: superuser sticker earned */
  hasSuperuser: boolean;
  /** sessionStorage: user ran `sudo cat adminTerminal.txt` at least once */
  sawAdminTerminalFile: boolean;
  /** sessionStorage: user successfully decrypted adminTerminal.txt */
  hasFileContents: boolean;
  /** sessionStorage (signed token): user is signed in on /admin */
  adminAuthUnlocked: boolean;
  /** localStorage admin prefs: experimental commands toggle is ON */
  experimentalCommandsEnabled: boolean;
  /** sessionStorage: user ran `sudo matrix yes` at least once */
  ranSudoMatrix: boolean;
  /** sessionStorage: user clicked the disabled escape button at least once */
  clickedDisabledEscape: boolean;
  /** localStorage: disco mode currently active (runtime flag in sticker store) */
  discoActive: boolean;
  /** localStorage: `matrixEscaped` flag — true forever after first escape */
  matrixEscaped: boolean;
}

/**
 * Derive the current puzzle stage from the signals. Always returns a
 * concrete stage — even a user who has done nothing yet is at
 * `COLLECTING_STICKERS`. The mapping below is a straightforward priority
 * ladder; tests cover all 9 stages.
 */
export function getCurrentStage(signals: MatrixPuzzleSignals): MatrixStage {
  if (signals.matrixEscaped) return MATRIX_STAGE.ESCAPED;
  if (!signals.hasSuperuser) return MATRIX_STAGE.COLLECTING_STICKERS;

  // Below this point: has sudo.
  if (!signals.sawAdminTerminalFile) return MATRIX_STAGE.HAS_SUDO;
  if (!signals.hasFileContents) return MATRIX_STAGE.SAW_ENCRYPTED_FILE;
  if (!signals.adminAuthUnlocked) return MATRIX_STAGE.HAS_FILE_CONTENTS;
  if (!signals.experimentalCommandsEnabled) return MATRIX_STAGE.ADMIN_UNLOCKED;

  // Below this point: experimental is on.
  if (!signals.ranSudoMatrix) return MATRIX_STAGE.EXPERIMENTAL_ON;

  // User has ran `sudo matrix` at least once.
  if (signals.discoActive && signals.ranSudoMatrix) return MATRIX_STAGE.DISCO_WAITING;
  if (signals.clickedDisabledEscape) return MATRIX_STAGE.SAW_DISABLED_ESCAPE;
  return MATRIX_STAGE.EXPERIMENTAL_ON;
}

// ─── Hint copy ─────────────────────────────────────────────────────────────

/**
 * Indirect hints — nudges, not instructions. One per stage.
 */
const STAGE_HINTS: Readonly<Record<MatrixStage, string>> = {
  [MATRIX_STAGE.COLLECTING_STICKERS]:
    'The wall of stickers hides a door. Gather every fragment.',
  [MATRIX_STAGE.HAS_SUDO]:
    "Look where root keeps secrets. `ls` might surprise you.",
  [MATRIX_STAGE.SAW_ENCRYPTED_FILE]:
    'An oracle knows, but only answers to those who earned the right word.',
  [MATRIX_STAGE.HAS_FILE_CONTENTS]:
    'Identities open doors. Use what the file gave you.',
  [MATRIX_STAGE.ADMIN_UNLOCKED]:
    'Patience is experimental. Flip the last switch.',
  [MATRIX_STAGE.EXPERIMENTAL_ON]:
    'The matrix is a command away.',
  [MATRIX_STAGE.SAW_DISABLED_ESCAPE]:
    'Reality bends to rhythm. Dance before you wake.',
  [MATRIX_STAGE.DISCO_WAITING]:
    'Stay. The truth needs twenty heartbeats.',
  [MATRIX_STAGE.ESCAPED]:
    'You are free. Welcome home.',
};

/**
 * Return the hint for a given stage. Pure so the terminal hint command
 * can call it deterministically at read time.
 */
export function getHintForStage(stage: MatrixStage): string {
  return STAGE_HINTS[stage];
}

// ─── Progress keys (sessionStorage) ────────────────────────────────────────

/**
 * All sessionStorage keys used by the puzzle. Centralized so the terminal,
 * chat interceptor, and admin page all agree on names.
 */
export const MATRIX_PUZZLE_KEYS = {
  sawAdminTerminalFile: 'dhruv-matrix:saw-admin-file',
  hasFileContents: 'dhruv-matrix:has-file-contents',
  ranSudoMatrix: 'dhruv-matrix:ran-sudo-matrix',
  clickedDisabledEscape: 'dhruv-matrix:clicked-disabled-escape',
  adminAuthToken: 'dhruv-matrix:admin-auth-token',
  homeToastShown: 'dhruv-matrix:home-toast-shown',
} as const;

/**
 * Safe sessionStorage read — handles SSR and storage-disabled environments.
 */
export function readSessionFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeSessionFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(key, '1');
    else window.sessionStorage.removeItem(key);
  } catch {
    /* quota / disabled — silently ignore */
  }
}

// ─── Passwords & credentials (client-visible — intentional) ────────────────

/**
 * The password required to decrypt `adminTerminal.txt`. Client-visible by
 * design: the whole point is that the chat LLM-me reveals it to "root".
 * There is no actual encryption; this is puzzle content.
 */
export const ADMIN_FILE_PASSWORD = 'followTheWhiteRabbit';

/**
 * Credentials required by `sudo admin`. Client-visible by design — the
 * user obtains them by decrypting `adminTerminal.txt`. The HMAC-signed
 * auth token (issued on correct entry) is what actually gates /admin,
 * not these strings.
 */
export const ADMIN_USERNAME = 'dhruv@root';
export const ADMIN_PASSWORD = 'theMatrixHasYou';
