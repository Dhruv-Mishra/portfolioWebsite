import { parseSiteToolCall } from '@/lib/siteToolValidation';
import type { SiteToolResult } from '@/lib/siteTools';
import {
  VOICE_AGENT_INPUT_RATE,
  VOICE_AGENT_MODEL_ID,
  VOICE_AGENT_OUTPUT_RATE,
  VOICE_AGENT_VOICE_NAME,
  VOICE_LIVE_WS_PATH,
} from '@/lib/voiceAgentConfig';
import { buildVoiceSystemInstruction } from '@/lib/voiceAgentPrompt';
import { SITE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
import type {
  VoiceCaller,
  VoiceCallerEventMap,
  VoiceCallerListener,
  VoiceExitReason,
  VoiceSessionHandle,
} from '@/lib/voiceAgentProtocol';

type ListenerMap = {
  [K in keyof VoiceCallerEventMap]: Set<VoiceCallerListener<K>>;
};

function createListenerMap(): ListenerMap {
  return {
    phase: new Set(),
    userTranscript: new Set(),
    agentTranscript: new Set(),
    audio: new Set(),
    interrupted: new Set(),
    toolCall: new Set(),
    health: new Set(),
    error: new Set(),
    ended: new Set(),
  };
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export class GeminiLiveCaller implements VoiceCaller {
  readonly id = 'gemini-live';

  private socket: WebSocket | null = null;
  private closed = false;
  private listeners = createListenerMap();

  on<K extends keyof VoiceCallerEventMap>(event: K, listener: VoiceCallerListener<K>): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private emit<K extends keyof VoiceCallerEventMap>(event: K, payload: VoiceCallerEventMap[K]): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }

  async connect(session: VoiceSessionHandle): Promise<void> {
    this.closed = false;
    this.emit('phase', 'connecting');

    const url = `${VOICE_LIVE_WS_PATH}?access_token=${encodeURIComponent(session.token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('Voice connection timed out.'));
      }, 12_000);

      socket.addEventListener('open', () => {
        window.clearTimeout(timer);
        socket.send(JSON.stringify({
          setup: {
            model: `models/${VOICE_AGENT_MODEL_ID}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: VOICE_AGENT_VOICE_NAME },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: buildVoiceSystemInstruction() }],
            },
            tools: [{ functionDeclarations: SITE_TOOL_DECLARATIONS }],
            sessionResumption: {},
            contextWindowCompression: { slidingWindow: {} },
            inputAudioTranscription: session.setup.lowNetwork ? undefined : {},
            outputAudioTranscription: session.setup.lowNetwork ? undefined : {},
          },
        }));
        resolve();
      }, { once: true });

      socket.addEventListener('error', () => {
        window.clearTimeout(timer);
        reject(new Error('Voice connection failed.'));
      }, { once: true });
    });

    socket.addEventListener('message', event => {
      void this.handleMessage(event.data);
    });
    socket.addEventListener('close', () => {
      if (!this.closed) {
        this.emit('health', { ok: false, configured: true, reason: 'Voice connection closed.' });
        this.emit('ended', 'health');
      }
    });
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const bytes = new Uint8Array(chunk);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    this.socket.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: btoa(binary),
          mimeType: `audio/pcm;rate=${VOICE_AGENT_INPUT_RATE}`,
        },
      },
    }));
  }

  sendText(text: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      realtimeInput: { text },
    }));
  }

  sendToolResult(callId: string, result: SiteToolResult): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      toolResponse: {
        functionResponses: [{
          id: callId,
          response: result,
        }],
      },
    }));
  }

  interrupt(): void {
    this.emit('interrupted', true);
    this.emit('phase', 'listening');
  }

  close(reason: VoiceExitReason = 'user'): void {
    this.closed = true;
    this.socket?.close();
    this.socket = null;
    this.emit('ended', reason);
  }

  private async handleMessage(raw: unknown): Promise<void> {
    const text = typeof raw === 'string' ? raw : await (raw as Blob).text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    if (payload.setupComplete) {
      this.emit('phase', 'listening');
      this.sendText('Please greet the visitor now and end with the required try-saying line.');
      return;
    }

    const serverContent = payload.serverContent as Record<string, unknown> | undefined;
    if (serverContent?.interrupted) {
      this.interrupt();
    }

    const input = serverContent?.inputTranscription as { text?: string } | undefined;
    if (input?.text) {
      this.emit('userTranscript', input.text);
      this.emit('phase', 'listening');
    }

    const output = serverContent?.outputTranscription as { text?: string } | undefined;
    if (output?.text) {
      this.emit('agentTranscript', output.text);
      this.emit('phase', 'speaking');
    }

    const modelTurn = serverContent?.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined;
    for (const part of modelTurn?.parts ?? []) {
      const inline = part.inlineData as { data?: string } | undefined;
      if (inline?.data) {
        this.emit('audio', decodeBase64(inline.data));
        this.emit('phase', 'speaking');
      }
    }

    const toolCall = payload.toolCall as { functionCalls?: Array<Record<string, unknown>> } | undefined;
    for (const call of toolCall?.functionCalls ?? []) {
      const parsed = parseSiteToolCall({
        id: call.id,
        name: call.name,
        args: call.args ?? {},
      });
      if (parsed) {
        this.emit('phase', 'acting');
        this.emit('toolCall', parsed);
      }
    }

    if (serverContent?.turnComplete || serverContent?.generationComplete) {
      this.emit('phase', 'listening');
    }

    if (payload.goAway) {
      this.emit('health', { ok: false, configured: true, reason: 'Voice session is ending.' });
    }
  }
}

export function createGeminiLiveCaller(): VoiceCaller {
  return new GeminiLiveCaller();
}

export const GEMINI_LIVE_OUTPUT_RATE = VOICE_AGENT_OUTPUT_RATE;
