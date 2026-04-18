/**
 * Unit tests for the matrix-puzzle state machine.
 *
 * Covers every stage of the 9-stage derived-state ladder and the hint
 * lookup. Pure logic — no DOM / storage.
 */
import { describe, it, expect } from 'vitest';
import {
  MATRIX_STAGE,
  getCurrentStage,
  getHintForStage,
  type MatrixPuzzleSignals,
} from '@/lib/matrixPuzzle';

function signals(overrides: Partial<MatrixPuzzleSignals> = {}): MatrixPuzzleSignals {
  return {
    hasSuperuser: false,
    sawAdminTerminalFile: false,
    hasFileContents: false,
    adminAuthUnlocked: false,
    experimentalCommandsEnabled: false,
    ranSudoMatrix: false,
    clickedDisabledEscape: false,
    discoActive: false,
    matrixEscaped: false,
    ...overrides,
  };
}

describe('getCurrentStage', () => {
  it('no superuser → COLLECTING_STICKERS', () => {
    expect(getCurrentStage(signals())).toBe(MATRIX_STAGE.COLLECTING_STICKERS);
  });

  it('has superuser, hasn\'t seen file → HAS_SUDO', () => {
    expect(getCurrentStage(signals({ hasSuperuser: true }))).toBe(MATRIX_STAGE.HAS_SUDO);
  });

  it('saw encrypted prompt, no decrypted content → SAW_ENCRYPTED_FILE', () => {
    expect(
      getCurrentStage(signals({ hasSuperuser: true, sawAdminTerminalFile: true })),
    ).toBe(MATRIX_STAGE.SAW_ENCRYPTED_FILE);
  });

  it('decrypted file, not logged in → HAS_FILE_CONTENTS', () => {
    expect(
      getCurrentStage(
        signals({ hasSuperuser: true, sawAdminTerminalFile: true, hasFileContents: true }),
      ),
    ).toBe(MATRIX_STAGE.HAS_FILE_CONTENTS);
  });

  it('signed in, experimental off → ADMIN_UNLOCKED', () => {
    expect(
      getCurrentStage(
        signals({
          hasSuperuser: true,
          sawAdminTerminalFile: true,
          hasFileContents: true,
          adminAuthUnlocked: true,
        }),
      ),
    ).toBe(MATRIX_STAGE.ADMIN_UNLOCKED);
  });

  it('experimental on, no sudo matrix → EXPERIMENTAL_ON', () => {
    expect(
      getCurrentStage(
        signals({
          hasSuperuser: true,
          sawAdminTerminalFile: true,
          hasFileContents: true,
          adminAuthUnlocked: true,
          experimentalCommandsEnabled: true,
        }),
      ),
    ).toBe(MATRIX_STAGE.EXPERIMENTAL_ON);
  });

  it('ran sudo matrix, disco off, clicked disabled → SAW_DISABLED_ESCAPE', () => {
    expect(
      getCurrentStage(
        signals({
          hasSuperuser: true,
          sawAdminTerminalFile: true,
          hasFileContents: true,
          adminAuthUnlocked: true,
          experimentalCommandsEnabled: true,
          ranSudoMatrix: true,
          clickedDisabledEscape: true,
        }),
      ),
    ).toBe(MATRIX_STAGE.SAW_DISABLED_ESCAPE);
  });

  it('ran sudo matrix AND disco active → DISCO_WAITING', () => {
    expect(
      getCurrentStage(
        signals({
          hasSuperuser: true,
          sawAdminTerminalFile: true,
          hasFileContents: true,
          adminAuthUnlocked: true,
          experimentalCommandsEnabled: true,
          ranSudoMatrix: true,
          discoActive: true,
        }),
      ),
    ).toBe(MATRIX_STAGE.DISCO_WAITING);
  });

  it('matrixEscaped trumps everything → ESCAPED', () => {
    expect(getCurrentStage(signals({ matrixEscaped: true }))).toBe(MATRIX_STAGE.ESCAPED);
    // Even if nothing else is set.
    expect(
      getCurrentStage(signals({ matrixEscaped: true, hasSuperuser: false })),
    ).toBe(MATRIX_STAGE.ESCAPED);
  });
});

describe('getHintForStage', () => {
  it('returns a non-empty hint for every stage', () => {
    for (const stage of Object.values(MATRIX_STAGE)) {
      const hint = getHintForStage(stage);
      expect(typeof hint).toBe('string');
      expect(hint.length).toBeGreaterThan(10);
    }
  });

  it('collecting-stickers hint mentions the door metaphor', () => {
    expect(getHintForStage(MATRIX_STAGE.COLLECTING_STICKERS)).toMatch(/door/i);
  });

  it('disco-waiting hint mentions heartbeats', () => {
    expect(getHintForStage(MATRIX_STAGE.DISCO_WAITING)).toMatch(/heartbeat/i);
  });

  it('escaped hint reads as "welcome home"', () => {
    expect(getHintForStage(MATRIX_STAGE.ESCAPED)).toMatch(/welcome home/i);
  });
});
