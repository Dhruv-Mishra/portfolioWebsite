import type { ChatReplyPayload, ChatStreamEvent } from '@/lib/chatTransport';

/** Reads an NDJSON chat stream, reporting deltas as they arrive, and resolves with the final payload. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<ChatReplyPayload> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  const handleLine = (line: string): ChatReplyPayload | null => {
    if (!line.trim()) return null;
    const event = JSON.parse(line) as ChatStreamEvent;
    if (event.type === 'delta') {
      if (typeof event.text === 'string' && event.text) onDelta(event.text);
      return null;
    }
    if (event.type === 'done') {
      const { reply, action, signature, modelId, degraded, fallbackReason } = event;
      return { reply, action, signature, modelId, degraded, fallbackReason };
    }
    return null;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffered.split('\n');
      buffered = done ? '' : lines.pop() ?? '';
      for (const line of lines) {
        const payload = handleLine(line);
        if (payload) return payload;
      }
      if (done) break;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }

  throw new Error('The chat stream ended before the reply finished.');
}
