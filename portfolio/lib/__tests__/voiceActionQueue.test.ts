import { describe, expect, it, vi } from 'vitest';
import {
  createVoiceActionQueue,
  DEFERRED_VOICE_TOOL_NAMES,
  END_VOICE_SESSION_SAFETY_MS,
  IMMEDIATE_VOICE_TOOL_NAMES,
  isDeferredVoiceTool,
  isImmediateVoiceTool,
} from '@/lib/voiceActionQueue';

describe('voice action queue', () => {
  it('classifies immediate vs deferred site tools', () => {
    expect(IMMEDIATE_VOICE_TOOL_NAMES).toEqual([
      'lookup_site_facts',
      'set_theme',
      'set_preference',
      'fill_field',
      'submit_guestbook',
    ]);
    expect(DEFERRED_VOICE_TOOL_NAMES).toEqual([
      'navigate_to',
      'open_project',
      'open_link',
      'open_feedback',
      'open_command_palette',
      'end_voice_session',
    ]);
    expect(isImmediateVoiceTool('lookup_site_facts')).toBe(true);
    expect(isDeferredVoiceTool('navigate_to')).toBe(true);
    expect(isDeferredVoiceTool('set_theme')).toBe(false);
    expect(isImmediateVoiceTool('end_voice_session')).toBe(false);
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
});
