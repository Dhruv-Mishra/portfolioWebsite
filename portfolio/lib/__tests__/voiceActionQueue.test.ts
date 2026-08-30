import { describe, expect, it, vi } from 'vitest';
import {
  createVoiceActionQueue,
  DEFERRED_VOICE_TOOL_NAMES,
  DEPENDENT_VOICE_TOOL_NAMES,
  dependentHostIdForTool,
  END_VOICE_SESSION_SAFETY_MS,
  hostIdForVoiceTool,
  IMMEDIATE_VOICE_TOOL_NAMES,
  isDeferredVoiceTool,
  isDependentVoiceTool,
  isImmediateVoiceTool,
  openerHostIdForTool,
} from '@/lib/voiceActionQueue';

describe('voice action queue', () => {
  it('classifies immediate vs deferred site tools', () => {
    expect(IMMEDIATE_VOICE_TOOL_NAMES).toEqual([
      'lookup_site_facts',
      'get_current_page_context',
      'set_theme',
      'set_preference',
      'set_master_volume',
      'set_audio_category_volume',
      'set_voice_output',
      'set_voice_backend',
      'set_motion_preference',
      'fill_field',
      'close_project',
    ]);
    expect(DEFERRED_VOICE_TOOL_NAMES).toEqual([
      'navigate_to',
      'open_project',
      'open_link',
      'open_feedback',
      'open_command_palette',
      'open_shortcuts',
      'open_chat',
      'browse_history',
      'scroll_page',
      'end_voice_session',
    ]);
    expect(DEPENDENT_VOICE_TOOL_NAMES).toEqual([
      'control_project_video',
      'send_chat_message',
      'run_terminal_command',
      'submit_guestbook',
      'submit_feedback',
    ]);
    expect(isImmediateVoiceTool('lookup_site_facts')).toBe(true);
    expect(isImmediateVoiceTool('get_current_page_context')).toBe(true);
    expect(isDeferredVoiceTool('get_current_page_context')).toBe(false);
    expect(isDeferredVoiceTool('navigate_to')).toBe(true);
    expect(isDeferredVoiceTool('set_theme')).toBe(false);
    expect(isImmediateVoiceTool('end_voice_session')).toBe(false);
    expect(isDependentVoiceTool('send_chat_message')).toBe(true);
    expect(isImmediateVoiceTool('send_chat_message')).toBe(false);
    expect(isDependentVoiceTool('submit_guestbook')).toBe(true);
    expect(isImmediateVoiceTool('submit_guestbook')).toBe(false);
    expect(isDependentVoiceTool('submit_feedback')).toBe(true);
    expect(isImmediateVoiceTool('submit_feedback')).toBe(false);
    expect(openerHostIdForTool('open_project')).toBe('project-video');
    expect(openerHostIdForTool('open_chat')).toBe('chat');
    expect(openerHostIdForTool('open_feedback')).toBe('feedback');
    expect(openerHostIdForTool('navigate_to', { path: '/' })).toBe('terminal');
    expect(openerHostIdForTool('navigate_to', { path: '/guestbook' })).toBe('guestbook');
    expect(openerHostIdForTool('navigate_to', { path: '/about' })).toBeNull();
    expect(dependentHostIdForTool('control_project_video')).toBe('project-video');
    expect(dependentHostIdForTool('send_chat_message')).toBe('chat');
    expect(dependentHostIdForTool('run_terminal_command')).toBe('terminal');
    expect(dependentHostIdForTool('submit_guestbook')).toBe('guestbook');
    expect(dependentHostIdForTool('submit_feedback')).toBe('feedback');
    expect(hostIdForVoiceTool('run_terminal_command')).toBe('terminal');
    expect(hostIdForVoiceTool('submit_guestbook')).toBe('guestbook');
    expect(hostIdForVoiceTool('submit_feedback')).toBe('feedback');
    expect(hostIdForVoiceTool('fill_field', { field: 'terminal-input' })).toBe('terminal');
    expect(hostIdForVoiceTool('fill_field', { field: 'chat-composer' })).toBe('chat');
    expect(hostIdForVoiceTool('fill_field', { field: 'guestbook-message' })).toBe('guestbook');
    expect(hostIdForVoiceTool('fill_field', { field: 'guestbook-name' })).toBe('guestbook');
    expect(hostIdForVoiceTool('fill_field', { field: 'feedback-message' })).toBe('feedback');
    expect(hostIdForVoiceTool('fill_field', { field: 'feedback-contact' })).toBe('feedback');
  });

  it('holds terminal and chat fill_field commits until those hosts are ready', async () => {
    const idle = true;
    let terminalReady = false;
    let chatReady = false;
    const committed: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => idle,
    });

    queue.enqueue(() => {
      committed.push('fill_guestbook');
    });
    queue.enqueue(() => {
      committed.push('fill_terminal');
    }, { ready: () => terminalReady });
    queue.enqueue(() => {
      committed.push('fill_chat');
    }, { ready: () => chatReady });

    await Promise.resolve();
    expect(committed).toEqual(['fill_guestbook']);

    terminalReady = true;
    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual(['fill_guestbook', 'fill_terminal']);

    chatReady = true;
    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual(['fill_guestbook', 'fill_terminal', 'fill_chat']);
  });

  it('settles a host-gated action when its host never becomes ready', async () => {
    let fireTimeout: (() => void) | undefined;
    const run = vi.fn();
    const queue = createVoiceActionQueue({
      canCommit: () => true,
      schedule: (fn) => {
        fireTimeout = fn;
        return 1;
      },
      cancel: vi.fn(),
    });

    const outcome = queue.enqueue(run, {
      ready: () => false,
      readyTimeoutMs: 25,
    });
    expect(queue.size()).toBe(1);

    fireTimeout?.();

    await expect(outcome).resolves.toBe('timed-out');
    expect(run).not.toHaveBeenCalled();
    expect(queue.size()).toBe(0);
  });

  it('holds deferred commits until playback is idle and intro is complete', () => {
    let idle = false;
    let introComplete = false;
    const committed: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => idle && introComplete,
    });

    queue.enqueue(() => {
      committed.push('navigate');
    });
    expect(committed).toEqual([]);
    expect(queue.size()).toBe(1);

    idle = true;
    queue.notifyReady();
    expect(committed).toEqual([]);

    introComplete = true;
    queue.notifyReady();
    expect(committed).toEqual(['navigate']);
    expect(queue.size()).toBe(0);
  });

  it('commits FIFO and waits again if speech resumes after a commit', async () => {
    let idle = true;
    const committed: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => idle,
    });

    queue.enqueue(() => {
      committed.push('one');
      idle = false;
    });
    queue.enqueue(() => {
      committed.push('two');
    });

    await Promise.resolve();
    expect(committed).toEqual(['one']);
    expect(queue.size()).toBe(1);

    idle = true;
    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual(['one', 'two']);
  });

  it('runs one commit at a time', async () => {
    let release!: () => void;
    const first = new Promise<void>(resolve => {
      release = resolve;
    });
    const committed: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => true,
    });

    queue.enqueue(async () => {
      committed.push('start-one');
      await first;
      committed.push('end-one');
    });
    queue.enqueue(() => {
      committed.push('two');
    });

    await Promise.resolve();
    expect(committed).toEqual(['start-one']);
    expect(queue.isCommitting()).toBe(true);

    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(committed).toEqual(['start-one', 'end-one', 'two']);
  });

  it('lets user hangup commit when playback is idle even mid-intro', () => {
    const introComplete = false;
    const idle = true;
    const stops: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => introComplete && idle,
      canHangup: () => idle,
    });

    queue.enqueueHangup(() => {
      stops.push('hangup');
    });
    expect(stops).toEqual(['hangup']);
    expect(introComplete).toBe(false);
  });

  it('queues hangup until idle, then stops, with an 8s safety timeout', () => {
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    let idle = false;
    const stops: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => idle,
      canHangup: () => idle,
      schedule: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
      cancel: vi.fn(),
    });

    queue.enqueueHangup(() => {
      stops.push('hangup');
    });
    expect(stops).toEqual([]);
    expect(queue.hasHangup()).toBe(true);
    expect(scheduled[0]?.ms).toBe(END_VOICE_SESSION_SAFETY_MS);

    idle = true;
    queue.notifyReady();
    expect(stops).toEqual(['hangup']);
    expect(queue.hasHangup()).toBe(false);
  });

  it('forces hangup on the second request or when the safety timer fires', () => {
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const stops: string[] = [];
    const visuals: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => false,
      schedule: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
      cancel: vi.fn(),
    });

    queue.enqueue(() => {
      visuals.push('navigate');
    });
    queue.enqueueHangup(() => {
      stops.push('first');
    });
    expect(stops).toEqual([]);

    queue.enqueueHangup(() => {
      stops.push('forced');
    });
    expect(stops).toEqual(['forced']);
    expect(visuals).toEqual([]);
    expect(queue.size()).toBe(0);

    queue.enqueueHangup(() => {
      stops.push('timed');
    });
    scheduled.at(-1)?.fn();
    expect(stops).toEqual(['forced', 'timed']);
  });

  it('holds dependent UI actions until their opener commits and the host is ready', async () => {
    const idle = true;
    let projectReady = false;
    let chatReady = false;
    let terminalReady = false;
    const committed: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => idle,
    });

    queue.enqueue(() => {
      committed.push('open_project');
    });
    queue.enqueue(() => {
      committed.push('control_project_video');
    }, { ready: () => projectReady });
    queue.enqueue(() => {
      committed.push('open_chat');
    });
    queue.enqueue(() => {
      committed.push('send_chat_message');
    }, { ready: () => chatReady });
    queue.enqueue(() => {
      committed.push('navigate_home');
    });
    queue.enqueue(() => {
      committed.push('run_terminal_command');
    }, { ready: () => terminalReady });

    await Promise.resolve();
    expect(committed).toEqual(['open_project']);
    expect(queue.size()).toBe(5);

    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual(['open_project']);

    projectReady = true;
    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual(['open_project', 'control_project_video', 'open_chat']);

    chatReady = true;
    queue.notifyReady();
    await Promise.resolve();
    await Promise.resolve();
    expect(committed).toEqual([
      'open_project',
      'control_project_video',
      'open_chat',
      'send_chat_message',
      'navigate_home',
    ]);

    terminalReady = true;
    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual([
      'open_project',
      'control_project_video',
      'open_chat',
      'send_chat_message',
      'navigate_home',
      'run_terminal_command',
    ]);
    expect(queue.size()).toBe(0);
  });

  it('keeps greeting deferral in front of a later dependent action', async () => {
    let introComplete = false;
    const idle = true;
    let chatReady = false;
    const committed: string[] = [];
    const queue = createVoiceActionQueue({
      canCommit: () => introComplete && idle,
    });

    queue.enqueue(() => {
      committed.push('open_chat');
    });
    queue.enqueue(() => {
      committed.push('send_chat_message');
    }, { ready: () => chatReady });

    queue.notifyReady();
    expect(committed).toEqual([]);

    introComplete = true;
    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual(['open_chat']);

    chatReady = true;
    queue.notifyReady();
    await Promise.resolve();
    expect(committed).toEqual(['open_chat', 'send_chat_message']);
  });
});
