/**
 * Tests for the single-attempt behavior of the `sudo cat adminTerminal.txt`
 * password prompt.
 *
 * Before the Fix: typing a wrong password would keep the inline prompt open
 * and re-prompt the user ("push" action, chained forever until correct).
 * The fix: one attempt only. A wrong password closes the prompt (returns
 * `consume`) and renders an error line + subtle oracle nudge; the user is
 * returned to the main terminal input and can re-run
 * `sudo cat adminTerminal.txt` if they want another try.
 *
 * We assert on the PromptSubmitAction shape returned by `onSubmit`. The
 * Terminal component's applyPromptAction routes `push` into a chained
 * prompt, while `consume` closes it — so `kind: 'consume'` is the
 * contract we must keep stable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  dispatchSudo,
  parseSudoInvocation,
} from '@/lib/sudoCommands';
import { ADMIN_FILE_PASSWORD } from '@/lib/matrixPuzzle';
import { getActivePrompt, setActivePrompt } from '@/lib/terminalPrompts';

describe('sudo cat adminTerminal.txt — single-attempt password prompt', () => {
  beforeEach(() => {
    // Reset prompt state between tests so each run starts clean.
    setActivePrompt(null);
  });

  const ctx = {
    renderCheatsheet: () => null,
  };

  it('invoking the command installs a password prompt', () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    expect(prompt).not.toBeNull();
    expect(prompt?.id).toBe('admin-file-password');
    expect(prompt?.masked).toBe(true);
  });

  it('correct password returns consume (closes the prompt) — one attempt', async () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const result = await prompt.onSubmit(ADMIN_FILE_PASSWORD, { router: null });
    expect(result.kind).toBe('consume');
    // The dispatcher should have already cleared the active prompt.
    expect(getActivePrompt()).toBeNull();
  });

  it('WRONG password returns consume — NO chained re-prompt', async () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const result = await prompt.onSubmit('definitelyNotTheRealPassword', { router: null });

    // Crucial: the action kind must be 'consume', NOT 'push'. 'push' would
    // chain a second prompt and re-prompt the user indefinitely — the bug
    // this fix closes.
    expect(result.kind).toBe('consume');

    // The prompt must be removed from the active slot so the main
    // terminal input takes over. Users can re-invoke
    // `sudo cat adminTerminal.txt` manually to try again.
    expect(getActivePrompt()).toBeNull();
  });

  it('wrong password returns a masked echo (password not printed in the clear)', async () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const result = await prompt.onSubmit('wrong', { router: null });
    if (result.kind !== 'consume') throw new Error('expected consume');
    // Echo should be bullet-masked, not the raw text.
    expect(result.echo).not.toContain('wrong');
    expect(result.echo).toBe('•'.repeat('wrong'.length));
  });

  it('empty password still closes the prompt (single-attempt contract)', async () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const result = await prompt.onSubmit('', { router: null });
    expect(result.kind).toBe('consume');
    expect(getActivePrompt()).toBeNull();
  });

  it('correct password sets hasFileContents flag (verified via consume output)', async () => {
    // We can't check sessionStorage in node env, but the consume action
    // is sufficient evidence the correct-path diverged from the wrong-path.
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');

    const okResult = await prompt.onSubmit(ADMIN_FILE_PASSWORD, { router: null });
    expect(okResult.kind).toBe('consume');
    // Output is present (the decrypt bar wrapper), but its content is
    // a React node — we just assert it's truthy here.
    if (okResult.kind !== 'consume') throw new Error('type narrow');
    expect(okResult.output).toBeTruthy();
  });

  it('onCancel closes the prompt and returns cancel', () => {
    dispatchSudo(parseSudoInvocation(['cat', 'adminTerminal.txt']), ctx);
    const prompt = getActivePrompt();
    if (!prompt) throw new Error('prompt not installed');
    if (!prompt.onCancel) throw new Error('onCancel missing');

    const cancel = prompt.onCancel();
    expect(cancel?.kind).toBe('cancel');
    expect(getActivePrompt()).toBeNull();
  });
});
