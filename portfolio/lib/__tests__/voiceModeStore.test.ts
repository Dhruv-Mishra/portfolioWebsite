import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useStickers', () => ({
  unlockSticker: vi.fn(),
}));
vi.mock('@/lib/voiceAudioActivation', () => ({
  disposePrimedVoiceAudio: vi.fn(),
  primeVoiceEnterAudio: vi.fn(),
}));
vi.mock('@/lib/voiceSounds', () => ({
  playVoiceToggle: vi.fn((cb?: () => void) => cb?.()),
  primeVoiceSounds: vi.fn(),
  startVoiceAmbient: vi.fn(),
}));

import { unlockSticker } from '@/hooks/useStickers';
import {
  consumeVoiceInvocationContext,
  consumeVoiceModeRequest,
  peekVoiceModeRequest,
  requestVoiceMode,
} from '@/lib/voiceModeStore';

describe('voiceModeStore central invocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeVoiceModeRequest();
    consumeVoiceInvocationContext();
  });

  it('requestVoiceMode requests the phoned-a-friend sticker unlock centrally', () => {
    expect(unlockSticker).not.toHaveBeenCalled();

    requestVoiceMode({ source: 'nav', topic: 'projects' });

    expect(unlockSticker).toHaveBeenCalledTimes(1);
    expect(unlockSticker).toHaveBeenCalledWith('phoned-a-friend');
    expect(peekVoiceModeRequest()).toBe('enter');
  });

});
