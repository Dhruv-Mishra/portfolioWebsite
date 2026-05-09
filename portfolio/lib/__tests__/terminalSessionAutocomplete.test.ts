import { describe, it, expect, afterEach } from 'vitest';
import {
  __persistTerminalSessionForTest,
  __readTerminalSessionForTest,
  __resetTerminalSessionForTest,
} from '@/context/TerminalContext';
import { completeTerminalCommandInput } from '@/lib/terminalCommandNames';

describe('terminal session persistence', () => {
  afterEach(() => {
    __resetTerminalSessionForTest();
  });

  it('starts with the initial terminal line and empty command history', () => {
    const session = __readTerminalSessionForTest();
    expect(session.outputLines).toHaveLength(1);
    expect(session.outputLines[0].command).toBe('init');
    expect(session.commandHistory).toEqual([]);
  });

  it('keeps transcript and command history in the module session snapshot', () => {
    __persistTerminalSessionForTest({
      outputLines: [{ id: 4, command: 'help', output: 'ok' }],
      commandHistory: ['help'],
    });

    const session = __readTerminalSessionForTest();
    expect(session.outputLines).toEqual([{ id: 4, command: 'help', output: 'ok' }]);
    expect(session.commandHistory).toEqual(['help']);
  });

  it('preserves a cleared transcript across remount-style reads', () => {
    __persistTerminalSessionForTest({
      outputLines: [],
      commandHistory: ['clear'],
    });

    const session = __readTerminalSessionForTest();
    expect(session.outputLines).toEqual([]);
    expect(session.commandHistory).toEqual(['clear']);
  });
});

describe('completeTerminalCommandInput', () => {
  it('does nothing for empty input or commands with arguments', () => {
    expect(completeTerminalCommandInput('')).toEqual({
      value: '',
      session: null,
      completed: false,
    });
    expect(completeTerminalCommandInput('git status')).toEqual({
      value: 'git status',
      session: null,
      completed: false,
    });
  });

  it('completes a single case-insensitive command prefix', () => {
    const result = completeTerminalCommandInput('RES');
    expect(result.value).toBe('resume');
    expect(result.completed).toBe(true);
  });

  it('cycles deterministic matches on repeated Tab presses', () => {
    const first = completeTerminalCommandInput('ch');
    expect(first.value).toBe('chat');

    const second = completeTerminalCommandInput(first.value, first.session);
    expect(second.value).toBe('cheatsheet');

    const third = completeTerminalCommandInput(second.value, second.session);
    expect(third.value).toBe('chat');
  });

  it('supports slash command completion', () => {
    const result = completeTerminalCommandInput('/h');
    expect(result.value).toBe('/hint');
    expect(result.completed).toBe(true);
  });

  it('keeps exact commands stable when there is only one match', () => {
    const result = completeTerminalCommandInput('resume');
    expect(result.value).toBe('resume');
    expect(result.completed).toBe(false);
  });
});
