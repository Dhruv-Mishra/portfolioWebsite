import { describe, expect, it } from 'vitest';
import { GeminiLiveCaller } from '@/lib/geminiLiveAdapter';
import type { VoiceCallerEventMap } from '@/lib/voiceAgentProtocol';

type LiveMessageHandler = {
  handleMessage: (raw: unknown) => Promise<void>;
};

function internals(caller: GeminiLiveCaller): LiveMessageHandler {
  return caller as unknown as LiveMessageHandler;
}

function collect(caller: GeminiLiveCaller) {
  const events: Array<{ event: keyof VoiceCallerEventMap; payload: unknown }> = [];
  const keys = [
    'phase',
    'userTranscript',
    'agentTranscript',
    'audio',
    'interrupted',
    'turnComplete',
  ] as const;
  for (const key of keys) {
    caller.on(key, payload => {
      events.push({ event: key, payload });
    });
  }
  return events;
}

async function becomeReady(caller: GeminiLiveCaller): Promise<void> {
  await internals(caller).handleMessage(JSON.stringify({ setupComplete: true }));
}

describe('gemini live adapter message handling', () => {
  it('emits transcripts and speaking without flipping to listening on input or generationComplete', async () => {
    const caller = new GeminiLiveCaller();
    const events = collect(caller);
    await becomeReady(caller);
    events.length = 0;

    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { inputTranscription: { text: 'hello there' } },
    }));
    expect(events).toEqual([
      { event: 'userTranscript', payload: 'hello there' },
    ]);

    events.length = 0;
    await internals(caller).handleMessage(JSON.stringify({
      serverContent: {
        outputTranscription: { text: 'welcome in' },
        modelTurn: {
          parts: [{ inlineData: { data: typeof btoa === 'function' ? btoa('\u0000\u0001') : 'AAE=' } }],
        },
      },
    }));
    expect(events.some(event => event.event === 'agentTranscript' && event.payload === 'welcome in')).toBe(true);
    expect(events.some(event => event.event === 'audio')).toBe(true);
    expect(events.filter(event => event.event === 'phase').map(event => event.payload)).toEqual(['speaking', 'speaking']);

    events.length = 0;
    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { generationComplete: true },
    }));
    expect(events).toEqual([]);

    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { turnComplete: true },
    }));
    expect(events).toEqual([
      { event: 'turnComplete', payload: true },
      { event: 'phase', payload: 'listening' },
    ]);
  });

  it('emits interrupted and listening when the model reports an interrupt', async () => {
    const caller = new GeminiLiveCaller();
    const events = collect(caller);
    await becomeReady(caller);
    events.length = 0;

    await internals(caller).handleMessage(JSON.stringify({
      serverContent: { interrupted: true },
    }));
    expect(events).toEqual([
      { event: 'interrupted', payload: true },
      { event: 'phase', payload: 'listening' },
    ]);
  });
});
