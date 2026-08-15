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

  it('maps explicit page, theme, and then/also chains and fails closed otherwise', () => {
    expect(planVoiceUtterance('go to about then switch to dark mode')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/about' } },
      { id: 'plan-2', name: 'set_theme', args: { action: 'dark' } },
    ]);
    expect(planVoiceUtterance('open settings, also engage disco mode')).toEqual([
      { id: 'plan-1', name: 'navigate_to', args: { path: '/settings' } },
      { id: 'plan-2', name: 'set_theme', args: { action: 'disco' } },
    ]);
    expect(planVoiceUtterance('do not go to homepage and type help in terminal')).toEqual([]);
    expect(planVoiceUtterance('go to homepage and type sudo in terminal')).toEqual([]);
    expect(planVoiceUtterance('go to homepage and tell me a joke')).toEqual([]);
    expect(planVoiceUtterance('go to about, then open cropio, then play the preview, then switch to dark mode')).toEqual([]);
  });
});
