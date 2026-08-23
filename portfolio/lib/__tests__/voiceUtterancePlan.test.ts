import { describe, expect, it } from 'vitest';
import { planVoiceUtterance } from '@/lib/voiceUtterancePlan';

describe('planVoiceUtterance', () => {
  it('chains homepage navigation with a safe terminal command', () => {
    expect(planVoiceUtterance('go to homepage and type help in terminal')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/' } },
      { id: 'plan-2', name: 'run_terminal_command', args: { command: 'help' } },
    ]);
  });

  it('chains project open with preview playback', () => {
    expect(planVoiceUtterance('open cropio and play the preview')).toEqual([
      { id: 'plan-1', name: 'open_project', args: { slug: 'cropio' } },
      { id: 'plan-2', name: 'control_project_video', args: { action: 'play' } },
    ]);
  });

  it('returns nothing for conversational or explanation requests', () => {
    expect(planVoiceUtterance('tell me about cropio')).toEqual([]);
    expect(planVoiceUtterance('how are you')).toEqual([]);
    expect(planVoiceUtterance('what is this site')).toEqual([]);
  });

  it('plans close_project for close, dismiss, and hide requests', () => {
    expect(planVoiceUtterance('close the project')).toEqual([
      { id: 'plan-1', name: 'close_project', args: {} },
    ]);
    expect(planVoiceUtterance('dismiss this modal')).toEqual([
      { id: 'plan-1', name: 'close_project', args: {} },
    ]);
    expect(planVoiceUtterance('hide that preview')).toEqual([
      { id: 'plan-1', name: 'close_project', args: {} },
    ]);
  });

  it('plans preview control for play it and pause it', () => {
    expect(planVoiceUtterance('play it')).toEqual([
      { id: 'plan-1', name: 'control_project_video', args: { action: 'play' } },
    ]);
    expect(planVoiceUtterance('pause it')).toEqual([
      { id: 'plan-1', name: 'control_project_video', args: { action: 'pause' } },
    ]);
  });

  it('maps explicit page, theme, and then/also chains and keeps successful prefixes', () => {
    expect(planVoiceUtterance('go to about then switch to dark mode')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/about' } },
      { id: 'plan-2', name: 'set_theme', args: { action: 'dark' } },
    ]);
    expect(planVoiceUtterance('open settings, also engage disco mode')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/settings' } },
      { id: 'plan-2', name: 'set_theme', args: { action: 'disco' } },
    ]);
    expect(planVoiceUtterance('do not go to homepage and type help in terminal')).toEqual([]);
    expect(planVoiceUtterance('go to homepage and type sudo in terminal')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/' } },
    ]);
    expect(planVoiceUtterance('type sudo in terminal')).toEqual([]);
    expect(planVoiceUtterance('go to homepage and tell me a joke')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/' } },
    ]);
    expect(planVoiceUtterance('go to about, then open cropio, then play the preview, then switch to dark mode')).toEqual([]);
  });

  it('plans unknown type-token as a non-submitting terminal fill and keeps nav prefixes', () => {
    expect(planVoiceUtterance('go to home and type hello')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/' } },
      { id: 'plan-2', name: 'fill_field', args: { field: 'terminal-input', value: 'hello' } },
    ]);
    expect(planVoiceUtterance('go to home and type help in terminal')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/' } },
      { id: 'plan-2', name: 'run_terminal_command', args: { command: 'help' } },
    ]);
    expect(planVoiceUtterance('go to about then type help in terminal')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/about' } },
      { id: 'plan-2', name: 'run_terminal_command', args: { command: 'help' } },
    ]);
  });

  it('plans bare hint as the puzzle-safe terminal command', () => {
    expect(planVoiceUtterance('enter hint on the terminal')).toEqual([
      { id: 'plan-1', name: 'run_terminal_command', args: { command: 'hint' } },
    ]);
    expect(planVoiceUtterance('switch to home and enter hint on the terminal')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/' } },
      { id: 'plan-2', name: 'run_terminal_command', args: { command: 'hint' } },
    ]);
    expect(planVoiceUtterance('type /hint')).toEqual([
      { id: 'plan-1', name: 'run_terminal_command', args: { command: 'hint' } },
    ]);
    expect(planVoiceUtterance('enter /hint on the terminal')).toEqual([
      { id: 'plan-1', name: 'run_terminal_command', args: { command: 'hint' } },
    ]);
    expect(planVoiceUtterance('give me a hint')).toEqual([]);
    expect(planVoiceUtterance('type matrix hint in terminal')).toEqual([]);
  });
});
