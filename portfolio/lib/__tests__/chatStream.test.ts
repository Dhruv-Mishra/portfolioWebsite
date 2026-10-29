import { describe, expect, it } from 'vitest';

import { readChatStream } from '@/lib/chatStream';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('readChatStream', () => {
  it('reports deltas split across chunk boundaries and resolves with the done payload', async () => {
    const deltas: string[] = [];
    const payload = await readChatStream(streamOf([
      '{"type":"delta","text":"Hel',
      'lo"}\n{"type":"delta","text":" there"}\n',
      '{"type":"done","reply":"Hello there.","action":null,"signature":"sig","modelId":"qwen-3.8-27b"}',
    ]), (text) => deltas.push(text));

    expect(deltas).toEqual(['Hello', ' there']);
    expect(payload).toMatchObject({ reply: 'Hello there.', action: null, signature: 'sig', modelId: 'qwen-3.8-27b' });
  });

  it('rejects a stream that ends without a final payload', async () => {
    await expect(readChatStream(streamOf(['{"type":"delta","text":"Hi"}\n']), () => undefined))
      .rejects.toThrow('The chat stream ended before the reply finished.');
  });
});
