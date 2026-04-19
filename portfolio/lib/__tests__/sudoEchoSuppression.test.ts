/**
 * Tests for the `suppressEcho` flag on the three sensitive inline prompts:
 *   - decrypt file password  (sudo cat adminTerminal.txt)
 *   - sudo admin username    (sudo admin → username step)
 *   - sudo admin password    (sudo admin → password step)
 *
 * CONTRACT
 * ────────
 * Every one of the three prompts MUST return `suppressEcho: true` on
 * submission (correct, wrong, and empty-input paths). The Terminal
 * component uses this flag to completely omit the `➜ ~ <echo>` header
 * line from the transcript — bullets, plaintext usernames, all hidden.
 * The `echo` string is still provided for back-compat with older tests
 * that assert on its shape, but the renderer does not display it.
 *
 * The ↑/↓ history exclusion (skipHistory) is covered separately by
 * `terminalHistoryPromptExclusion.test.ts`; these tests focus narrowly
 * on the transcript-echo suppression behavior.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  dispatchSudo,
  parseSudoInvocation,
} from '@/lib/sudoCommands';
import { ADMIN_FILE_PASSWORD, ADMIN_PASSWORD, ADMIN_USERNAME } from '@/lib/matrixPuzzle';
import { getActivePrompt, setActivePrompt } from '@/lib/terminalPrompts';

const ctx = {
  renderCheatsheet: () => null,
};

describe('sudo cat adminTerminal.txt — decrypt password suppresses echo', () => {
  beforeEach(() => {
    setActivePrompt(null);
  });

  it('correct password returns suppressEcho: true', async () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const result = await prompt.onSubmit(ADMIN_FILE_PASSWORD, { router: null });
    if (result.kind !== 'consume') throw new Error('expected consume');
    expect(result.suppressEcho).toBe(true);
  });

  it('wrong password returns suppressEcho: true', async () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const result = await prompt.onSubmit('notTheRightPassword', { router: null });
    if (result.kind !== 'consume') throw new Error('expected consume');
    expect(result.suppressEcho).toBe(true);
  });

  it('empty password (still closes) returns suppressEcho: true', async () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const result = await prompt.onSubmit('', { router: null });
    if (result.kind !== 'consume') throw new Error('expected consume');
    expect(result.suppressEcho).toBe(true);
  });
});

describe('sudo admin — username + password prompts suppress echo', () => {
  beforeEach(() => {
    setActivePrompt(null);
  });

  it('username step returns suppressEcho: true on submission', () => {
    dispatchSudo(parseSudoInvocation(['admin']), { ...ctx });
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('username prompt not installed');
    expect(prompt.id).toBe('sudo-admin-username');

    // The submission returns a `push` action that installs the password prompt.
    const result = prompt.onSubmit(ADMIN_USERNAME, { router: null });
    // `onSubmit` is sync here, but the type union allows Promise. Unwrap.
    if (result instanceof Promise) throw new Error('username submit should be sync');
    if (result.kind !== 'push') throw new Error('expected push');
    expect(result.suppressEcho).toBe(true);
    // The echo is the username, preserved for back-compat but hidden by the renderer.
    expect(result.echo).toBe(ADMIN_USERNAME);
  });

  it('password step — correct credentials return suppressEcho: true', async () => {
    // Install username prompt, submit username to chain into the password prompt.
    dispatchSudo(parseSudoInvocation(['admin']), { ...ctx });
    const usernamePrompt = getActivePrompt();
    if (!usernamePrompt) throw new Error('username prompt missing');
    const pushed = usernamePrompt.onSubmit(ADMIN_USERNAME, { router: null });
    if (pushed instanceof Promise) throw new Error('username submit should be sync');
    if (pushed.kind !== 'push') throw new Error('expected push');

    // Now the password prompt should be active.
    const passwordPrompt = getActivePrompt();
    if (!passwordPrompt) throw new Error('password prompt not installed after username push');
    expect(passwordPrompt.id).toBe('sudo-admin-password');

    const result = await passwordPrompt.onSubmit(ADMIN_PASSWORD, { router: null });
    if (result.kind !== 'consume') throw new Error('expected consume');
    expect(result.suppressEcho).toBe(true);
  });

  it('password step — WRONG credentials still return suppressEcho: true', async () => {
    dispatchSudo(parseSudoInvocation(['admin']), { ...ctx });
    const usernamePrompt = getActivePrompt();
    if (!usernamePrompt) throw new Error('username prompt missing');
    const pushed = usernamePrompt.onSubmit(ADMIN_USERNAME, { router: null });
    if (pushed instanceof Promise) throw new Error('username submit should be sync');
    if (pushed.kind !== 'push') throw new Error('expected push');

    const passwordPrompt = getActivePrompt();
    if (!passwordPrompt) throw new Error('password prompt not installed');
    const result = await passwordPrompt.onSubmit('definitelyWrongPassword', { router: null });
    if (result.kind !== 'consume') throw new Error('expected consume');
    expect(result.suppressEcho).toBe(true);
  });

  it('username empty → cancel does NOT set suppressEcho (nothing to echo)', () => {
    // Empty input on username returns `cancel` — there's no sensitive
    // submission to hide, so `suppressEcho` isn't meaningful. We only
    // assert that the prompt closes cleanly; `suppressEcho` on cancel
    // is allowed to be undefined/false.
    dispatchSudo(parseSudoInvocation(['admin']), { ...ctx });
    const usernamePrompt = getActivePrompt();
    if (!usernamePrompt) throw new Error('username prompt missing');
    const result = usernamePrompt.onSubmit('', { router: null });
    if (result instanceof Promise) throw new Error('username submit should be sync');
    expect(result.kind).toBe('cancel');
  });
});
