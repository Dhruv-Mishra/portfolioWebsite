import { describe, expect, it, vi } from 'vitest';
import {
  DISCO_SWITCH_SOUND,
  DISCO_TRACKS,
  DiscoPlaybackController,
} from '@/lib/discoPlayback';
import type { SoundId } from '@/lib/soundManager';

function createManager() {
  const events: string[] = [];
  let pendingCue: ((completed: boolean) => void) | null = null;

  const manager = {
    prepareSound: vi.fn(async (id: SoundId) => {
      events.push(`prepare:${id}`);
      return true;
    }),
    playToCompletion: vi.fn((id: SoundId) => {
      events.push(`cue:${id}`);
      return new Promise<boolean>((resolve) => {
        pendingCue = resolve;
      });
    }),
    cancelCompletion: vi.fn(() => {
      events.push('cancel');
      pendingCue?.(false);
      pendingCue = null;
    }),
    startLoop: vi.fn((id: SoundId) => {
      events.push(`start:${id}`);
      return true;
    }),
    stopLoop: vi.fn((id: SoundId) => {
      events.push(`stop:${id}`);
    }),
  };

  return {
    manager,
    events,
    completeCue: () => {
      pendingCue?.(true);
      pendingCue = null;
    },
  };
}

describe('DiscoPlaybackController', () => {
  it('defines the existing loop followed by all three new tracks', () => {
    expect(DISCO_TRACKS.map((track) => track.id)).toEqual([
      'disco-loop',
      'disco-track-1',
      'disco-track-2',
      'disco-track-3',
    ]);
  });

  it('cycles through four tracks and wraps to the existing loop', async () => {
    const { manager, completeCue } = createManager();
    manager.playToCompletion.mockResolvedValue(true);
    const playback = new DiscoPlaybackController(manager);

    const selected: SoundId[] = [];
    for (let press = 0; press < DISCO_TRACKS.length; press++) {
      const next = playback.next();
      selected.push(next.track.id);
      completeCue();
      await next.done;
    }

    expect(selected).toEqual([
      'disco-track-1',
      'disco-track-2',
      'disco-track-3',
      'disco-loop',
    ]);
    expect(playback.currentTrack.id).toBe('disco-loop');
  });

  it('finishes the switch cue before starting the selected loop', async () => {
    const { manager, events, completeCue } = createManager();
    const playback = new DiscoPlaybackController(manager);
    await playback.start();
    events.length = 0;

    const next = playback.next();
    await vi.waitFor(() => {
      expect(events).toContain(`cue:${DISCO_SWITCH_SOUND}`);
    });
    expect(events).not.toContain('start:disco-track-1');

    completeCue();
    await next.done;
    expect(events.indexOf(`cue:${DISCO_SWITCH_SOUND}`)).toBeLessThan(
      events.indexOf('start:disco-track-1'),
    );
  });

  it('cancels a stale transition and starts only the latest track', async () => {
    const { manager, events, completeCue } = createManager();
    const playback = new DiscoPlaybackController(manager);
    await playback.start();
    events.length = 0;

    const first = playback.next();
    await vi.waitFor(() => {
      expect(events.filter((event) => event === `cue:${DISCO_SWITCH_SOUND}`)).toHaveLength(1);
    });
    const second = playback.next();
    await vi.waitFor(() => {
      expect(events.filter((event) => event === `cue:${DISCO_SWITCH_SOUND}`)).toHaveLength(2);
    });
    completeCue();

    await expect(first.done).resolves.toBe(false);
    await expect(second.done).resolves.toBe(true);
    expect(events).not.toContain('start:disco-track-1');
    expect(events.filter((event) => event === 'start:disco-track-2')).toHaveLength(1);
  });
});