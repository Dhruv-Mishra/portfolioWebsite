import type { SoundId } from '@/lib/soundManager';

export const DISCO_TRACKS = [
  { id: 'disco-loop', label: 'Original' },
  { id: 'disco-track-1', label: 'Track 1' },
  { id: 'disco-track-2', label: 'Track 2' },
  { id: 'disco-track-3', label: 'Track 3' },
] as const satisfies ReadonlyArray<{ id: SoundId; label: string }>;

export const DISCO_SWITCH_SOUND: SoundId = 'disco-track-switch';

interface DiscoPlaybackManager {
  prepareSound(id: SoundId): Promise<boolean>;
  playToCompletion(id: SoundId): Promise<boolean>;
  cancelCompletion(): void;
  startLoop(id: SoundId): boolean;
  stopLoop(id: SoundId): void;
}

export class DiscoPlaybackController {
  private index = 0;
  private request = 0;

  constructor(private readonly manager: DiscoPlaybackManager) {}

  get currentTrack(): (typeof DISCO_TRACKS)[number] {
    return DISCO_TRACKS[this.index];
  }

  async start(): Promise<boolean> {
    const request = ++this.request;
    const ready = await this.manager.prepareSound(this.currentTrack.id);
    if (!ready || request !== this.request) return false;
    return this.manager.startLoop(this.currentTrack.id);
  }

  next(): { track: (typeof DISCO_TRACKS)[number]; done: Promise<boolean> } {
    this.manager.stopLoop(this.currentTrack.id);
    this.manager.cancelCompletion();
    this.index = (this.index + 1) % DISCO_TRACKS.length;
    const request = ++this.request;
    return {
      track: this.currentTrack,
      done: this.switchTrack(request, this.currentTrack.id),
    };
  }

  stop(): void {
    this.request++;
    this.manager.cancelCompletion();
    for (const track of DISCO_TRACKS) {
      this.manager.stopLoop(track.id);
    }
  }

  private async switchTrack(request: number, trackId: SoundId): Promise<boolean> {
    const [cueReady, trackReady] = await Promise.all([
      this.manager.prepareSound(DISCO_SWITCH_SOUND),
      this.manager.prepareSound(trackId),
    ]);
    if (!cueReady || !trackReady || request !== this.request) return false;

    const cueCompleted = await this.manager.playToCompletion(DISCO_SWITCH_SOUND);
    if (!cueCompleted || request !== this.request) return false;
    return this.manager.startLoop(trackId);
  }
}