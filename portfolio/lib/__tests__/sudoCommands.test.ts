/**
 * Unit tests for the sudo command parser + dispatcher.
 * Covers:
 *   - Empty invocation → help
 *   - Unknown subcommand → friendly error
 *   - Known subcommands all produce a result with output
 *   - Destructive reset requires explicit `yes`
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import {
  parseSudoInvocation,
  dispatchSudo,
  SUDO_COMMAND_SPECS,
} from '@/lib/sudoCommands';

describe('parseSudoInvocation', () => {
  it('empty args → null subcommand', () => {
    const result = parseSudoInvocation([]);
    expect(result.subcommand).toBeNull();
    expect(result.args).toEqual([]);
  });

  it('normalizes subcommand to lowercase', () => {
    expect(parseSudoInvocation(['Help']).subcommand).toBe('help');
    expect(parseSudoInvocation(['DISCO']).subcommand).toBe('disco');
  });

  it('preserves arg order and casing after subcommand', () => {
    const result = parseSudoInvocation(['DISCO', 'OFF']);
    expect(result.subcommand).toBe('disco');
    expect(result.args).toEqual(['OFF']);
  });
});

describe('dispatchSudo', () => {
  const ctx = {
    renderCheatsheet: () => React.createElement('span', null, 'CHEATSHEET-PLACEHOLDER'),
  };

  it('empty subcommand returns help output', () => {
    const result = dispatchSudo(parseSudoInvocation([]), ctx);
    expect(result.output).toBeTruthy();
  });

  it('help returns output', () => {
    const result = dispatchSudo(parseSudoInvocation(['help']), ctx);
    expect(result.output).toBeTruthy();
  });

  it('unknown subcommand returns a not-found output', () => {
    const result = dispatchSudo(parseSudoInvocation(['doesnotexist']), ctx);
    expect(result.output).toBeTruthy();
  });

  it('every spec subcommand dispatches to a result with output', () => {
    for (const spec of SUDO_COMMAND_SPECS) {
      const result = dispatchSudo(parseSudoInvocation([spec.name]), ctx);
      expect(result.output, `${spec.name} must return output`).toBeTruthy();
    }
  });

  it('disco without args shows a warning but does NOT expose an action', () => {
    // v-confirm flow: `sudo disco` alone should only warn. Action arms on
    // `sudo disco yes`.
    const result = dispatchSudo(parseSudoInvocation(['disco']), ctx);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('disco yes arms the activation action', () => {
    const result = dispatchSudo(parseSudoInvocation(['disco', 'yes']), ctx);
    expect(typeof result.action).toBe('function');
  });

  it('disco no cancels without arming an action', () => {
    const result = dispatchSudo(parseSudoInvocation(['disco', 'no']), ctx);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('disco off returns an action callback (unchanged)', () => {
    const result = dispatchSudo(parseSudoInvocation(['disco', 'off']), ctx);
    expect(typeof result.action).toBe('function');
  });

  it('reset without confirmation does NOT expose an action (warning only)', () => {
    const result = dispatchSudo(parseSudoInvocation(['reset']), ctx);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('reset with explicit yes returns an action callback', () => {
    for (const confirm of ['yes', 'y', '--confirm', '--yes', 'YES']) {
      const result = dispatchSudo(parseSudoInvocation(['reset', confirm]), ctx);
      expect(typeof result.action, `reset ${confirm} should arm action`).toBe('function');
    }
  });

  it('matrix without args shows a warning but does NOT expose an action', () => {
    // v-confirm flow: `sudo matrix` alone should only warn.
    const result = dispatchSudo(parseSudoInvocation(['matrix']), ctx);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('matrix yes arms the activation action', () => {
    const result = dispatchSudo(parseSudoInvocation(['matrix', 'yes']), ctx);
    expect(typeof result.action).toBe('function');
  });

  it('matrix no cancels without arming an action', () => {
    const result = dispatchSudo(parseSudoInvocation(['matrix', 'no']), ctx);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('matrix off points user at the WAKE UP button (no action)', () => {
    // There is no terminal off switch for the matrix overlay by design.
    const result = dispatchSudo(parseSudoInvocation(['matrix', 'off']), ctx);
    expect(result.action).toBeUndefined();
    expect(result.output).toBeTruthy();
  });

  it('rainbow action returns a runnable action with output', () => {
    // `rainbow` writes to document.documentElement.dataset at call time. In
    // this pure-node vitest config there is no document, but the handler
    // guards on `typeof document === 'undefined'`, so invoking the action is
    // a safe no-op. We just assert the shape of the result here; the DOM
    // effect is covered by the browser-level e2e check.
    const result = dispatchSudo(parseSudoInvocation(['rainbow']), ctx);
    expect(typeof result.action).toBe('function');
    expect(result.output).toBeTruthy();
    // Invoking the action must not throw.
    expect(() => result.action?.()).not.toThrow();
  });

  it('cheatsheet subcommand renders the provided renderCheatsheet into output', () => {
    const renderCheatsheet = vi.fn(() => React.createElement('span', null, 'X'));
    const result = dispatchSudo(parseSudoInvocation(['cheatsheet']), {
      renderCheatsheet,
    });
    expect(result.output).toBeTruthy();
    expect(renderCheatsheet).toHaveBeenCalledTimes(1);
  });
});
