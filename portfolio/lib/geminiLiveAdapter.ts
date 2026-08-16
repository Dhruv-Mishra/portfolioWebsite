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
import { VOICE_LIVE_TOOL_DECLARATIONS } from '@/lib/siteToolDeclarations';
import {
  buildVoiceSessionStartCue,
  DEFAULT_VOICE_SETUP,
  VOICE_LIVE_REALTIME_INPUT_CONFIG,
  type VoiceCaller,
  type VoiceCallerEventMap,
  type VoiceCallerListener,
  type VoiceExitReason,
  type VoiceSessionHandle,
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
    turnComplete: new Set(),
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

function isOpen(socket: WebSocket | null): socket is WebSocket {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

export class GeminiLiveCaller implements VoiceCaller {
  readonly id = 'gemini-live';

  private socket: WebSocket | null = null;
  private closed = false;
  private ready = false;
  private greetSent = false;
  private sessionStartCue = '';
  private ignoreAudioUntilTurnComplete = false;
  private toolNames = new Map<string, string>();
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

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  async connect(session: VoiceSessionHandle): Promise<void> {
    this.closeSocket();
    this.closed = false;
    this.ready = false;
    this.sessionStartCue = session.setup.greetOnConnect
      ? buildVoiceSessionStartCue({
          welcomeGreeting: session.setup.welcomeGreeting || DEFAULT_VOICE_SETUP.welcomeGreeting,
          welcomeHint: session.setup.welcomeHint || DEFAULT_VOICE_SETUP.welcomeHint,
        })
      : '';
    this.greetSent = false;
    this.ignoreAudioUntilTurnComplete = false;
    this.toolNames.clear();
    this.emit('phase', 'connecting');

    const url = `${VOICE_LIVE_WS_PATH}?access_token=${encodeURIComponent(session.token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    try {
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
              tools: [{ functionDeclarations: VOICE_LIVE_TOOL_DECLARATIONS }],
              sessionResumption: {},
              contextWindowCompression: { slidingWindow: {} },
              realtimeInputConfig: VOICE_LIVE_REALTIME_INPUT_CONFIG,
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
    } catch (error) {
      this.closeSocket();
      throw error;
    }

    socket.addEventListener('message', event => {
      void this.handleMessage(event.data);
    });
    socket.addEventListener('close', () => {
      this.ready = false;
      if (this.socket === socket) this.socket = null;
      if (!this.closed) {
        this.closed = true;
        this.emit('health', { ok: false, configured: true, reason: 'Voice connection closed.' });
        this.emit('ended', 'health');
      }
    });
  }

  sendAudio(chunk: ArrayBuffer): void {
    const socket = this.socket;
    if (!this.ready || !isOpen(socket)) return;
    const bytes = new Uint8Array(chunk);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    socket.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: btoa(binary),
          mimeType: `audio/pcm;rate=${VOICE_AGENT_INPUT_RATE}`,
        },
      },
    }));
  }

  sendText(text: string): void {
    const socket = this.socket;
    if (!this.ready || !isOpen(socket)) return;
    socket.send(JSON.stringify({
      realtimeInput: { text },
    }));
  }

  sendToolResult(callId: string, result: SiteToolResult, name?: string): void {
    const toolName = name ?? this.toolNames.get(callId);
    if (!toolName) return;
    this.sendFunctionResponse(callId, toolName, result);
  }

  interrupt(): void {
    this.ignoreAudioUntilTurnComplete = true;
    this.emit('interrupted', true);
    this.emit('phase', 'listening');
  }

  close(reason: VoiceExitReason = 'user'): void {
    if (this.closed) {
      this.closeSocket();
      return;
    }
    this.closed = true;
    this.closeSocket();
    this.emit('ended', reason);
  }

  private sendFunctionResponse(callId: string, name: string, result: SiteToolResult): void {
    const socket = this.socket;
    if (!this.ready || !isOpen(socket)) return;
    socket.send(JSON.stringify({
      toolResponse: {
        functionResponses: [{
          id: callId,
          name,
          response: result,
        }],
      },
    }));
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
      this.ready = true;
      this.emit('phase', 'listening');
      if (!this.greetSent && this.sessionStartCue) {
        this.greetSent = true;
        this.sendText(this.sessionStartCue);
      }
      return;
    }

    if (!this.ready) return;

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
    if (!this.ignoreAudioUntilTurnComplete) {
      for (const part of modelTurn?.parts ?? []) {
        const inline = part.inlineData as { data?: string } | undefined;
        if (inline?.data) {
          this.emit('audio', decodeBase64(inline.data));
          this.emit('phase', 'speaking');
        }
      }
    }

    const cancelled = payload.toolCallCancellation as { ids?: unknown } | undefined;
    if (Array.isArray(cancelled?.ids) && cancelled.ids.length > 0) {
      for (const id of cancelled.ids) {
        if (typeof id === 'string') this.toolNames.delete(id);
      }
      this.emit('interrupted', true);
    }

    const toolCall = payload.toolCall as { functionCalls?: Array<Record<string, unknown>> } | undefined;
    for (const call of toolCall?.functionCalls ?? []) {
      const callId = typeof call.id === 'string' ? call.id : '';
      const callName = typeof call.name === 'string' ? call.name : '';
      if (callId && callName) this.toolNames.set(callId, callName);

      const parsed = parseSiteToolCall({
        id: call.id,
        name: call.name,
        args: call.args ?? {},
      });
      if (parsed) {
        this.toolNames.set(parsed.id, parsed.name);
        this.emit('phase', 'acting');
        this.emit('toolCall', parsed);
      } else if (callId && callName) {
        this.sendFunctionResponse(callId, callName, {
          ok: false,
          spokenText: 'That action is not available.',
          errorCode: 'invalid-tool',
        });
      }
    }

    if (serverContent?.turnComplete || serverContent?.generationComplete) {
      this.ignoreAudioUntilTurnComplete = false;
      this.emit('turnComplete', true);
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
