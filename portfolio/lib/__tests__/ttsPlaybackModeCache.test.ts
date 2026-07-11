import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const playbackSource = fs.readFileSync(
  path.join(process.cwd(), 'hooks', 'useTtsPlayback.ts'),
  'utf8',
);
const chatSource = fs.readFileSync(
  path.join(process.cwd(), 'hooks', 'useStickyChat.ts'),
  'utf8',
);

describe('TTS playback mode cache contract', () => {
  it('defers a voice-mode change until the next playback click', () => {
    const modeMismatchCheck = playbackSource.indexOf('requestedClientSpeechRef.current !== shouldRequestClientSpeech');
    const sameMessagePauseCheck = playbackSource.indexOf("state.activeMessageId === messageId && state.status === 'playing'");

    expect(playbackSource).toContain('requestedClientSpeechRef.current = shouldRequestClientSpeech');
    expect(modeMismatchCheck).toBeGreaterThan(-1);
    expect(modeMismatchCheck).toBeLessThan(sameMessagePauseCheck);
    expect(playbackSource.slice(modeMismatchCheck, sameMessagePauseCheck)).toContain(
      'await startPlayback(messageId, trimmedText, options)',
    );
  });

  it('keeps generated audio persistent across mode changes and refreshes', () => {
    expect(playbackSource).not.toContain('clearTtsAudioCache');
    expect(chatSource).toContain(
      "void pruneTtsAudioCache(['welcome', ...toSave.map(message => message.id)])",
    );
  });
});