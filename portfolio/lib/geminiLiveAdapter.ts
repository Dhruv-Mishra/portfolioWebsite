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
  parseVoiceResumeHandle,
  VOICE_LIVE_REALTIME_INPUT_CONFIG,
  type VoiceCaller,
  type VoiceCallerEventMap,
  type VoiceCallerListener,
  type VoiceExitReason,
  type VoiceSessionHandle,
} from '@/lib/voiceAgentProtocol';

const OPEN_TIMEOUT_MS = 12_000;
const SETUP_TIMEOUT_MS = 8_000;
const PENDING_TEXT_MAX = 32;
const AUDIO_BACKPRESSURE_BYTES = 256 * 1024;
const SAFE_CONNECTION_ERROR = 'Voice connection failed.';
const SAFE_CONNECTION_TIMEOUT = 'Voice connection timed out.';

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
    toolCancellation: new Set(),
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasProviderError(payload: Record<string, unknown>): boolean {
  return 'error' in payload && payload.error != null;
}

export class GeminiLiveCaller implements VoiceCaller {
  readonly id = 'gemini-live';

  private socket: WebSocket | null = null;
  private generation = 0;
  private closed = false;
  private ready = false;
  private greetSent = false;
  private sessionStartCue = '';
  private pendingTexts: string[] = [];
  private toolNames = new Map<string, string>();
  private listeners = createListenerMap();
  private resumeHandle: string | null = null;
  private healthEmitted = false;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private setupTimer: ReturnType<typeof setTimeout> | null = null;

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

  private emitHealthOnce(reason: string): void {
    if (this.healthEmitted) return;
    this.healthEmitted = true;
    this.emit('health', { ok: false, configured: true, reason });
  }

  private isCurrent(socket: WebSocket, epoch: number): boolean {
    return this.socket === socket && this.generation === epoch;
  }

  private clearTimers(): void {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    if (this.setupTimer !== null) {
      clearTimeout(this.setupTimer);
      this.setupTimer = null;
    }
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    this.clearTimers();
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  async connect(session: VoiceSessionHandle): Promise<void> {
    const previous = this.socket;
    this.generation += 1;
    const epoch = this.generation;
    this.socket = null;
    this.ready = false;
    this.closed = false;
    this.healthEmitted = false;
    this.resumeHandle = parseVoiceResumeHandle(session.setup.resumeHandle ?? session.resumeHandle) ?? null;
    this.sessionStartCue = session.setup.greetOnConnect
      ? buildVoiceSessionStartCue({
          welcomeGreeting: session.setup.welcomeGreeting || DEFAULT_VOICE_SETUP.welcomeGreeting,
          welcomeHint: session.setup.welcomeHint || DEFAULT_VOICE_SETUP.welcomeHint,
        })
      : '';
    this.greetSent = false;
    this.pendingTexts = [];
    this.toolNames.clear();
    this.clearTimers();
    if (previous && (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING)) {
      previous.close();
    }
    this.emit('phase', 'connecting');

    const url = `${VOICE_LIVE_WS_PATH}?access_token=${encodeURIComponent(session.token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const settle = (action: () => void) => {
          if (settled || this.generation !== epoch) return;
          settled = true;
          this.clearTimers();
          action();
        };

        const fail = (message: string) => {
          settle(() => reject(new Error(message)));
        };

        this.openTimer = setTimeout(() => {
          fail(SAFE_CONNECTION_TIMEOUT);
        }, OPEN_TIMEOUT_MS);

        socket.addEventListener('open', () => {
          if (!this.isCurrent(socket, epoch) || settled) return;
          if (this.openTimer !== null) {
            clearTimeout(this.openTimer);
            this.openTimer = null;
          }
          this.setupTimer = setTimeout(() => {
            fail(SAFE_CONNECTION_TIMEOUT);
          }, SETUP_TIMEOUT_MS);

          const resumeHandle = parseVoiceResumeHandle(session.setup.resumeHandle ?? session.resumeHandle);
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
                thinkingConfig: {
                  thinkingLevel: 'MINIMAL',
                },
              },
              systemInstruction: {
                parts: [{ text: buildVoiceSystemInstruction(session.setup.clientState) }],
              },
              tools: [{ functionDeclarations: VOICE_LIVE_TOOL_DECLARATIONS }],
              sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
              contextWindowCompression: { slidingWindow: {} },
              realtimeInputConfig: VOICE_LIVE_REALTIME_INPUT_CONFIG,
              inputAudioTranscription: session.setup.lowNetwork ? undefined : {},
              outputAudioTranscription: session.setup.lowNetwork ? undefined : {},
            },
          }));
        });

        socket.addEventListener('error', () => {
          if (!this.isCurrent(socket, epoch)) return;
          if (!settled) {
            fail(SAFE_CONNECTION_ERROR);
            return;
          }
          if (this.closed) return;
          this.emit('error', SAFE_CONNECTION_ERROR);
          this.emitHealthOnce('Voice connection interrupted.');
        });

        socket.addEventListener('close', () => {
          if (this.generation !== epoch) return;
          this.ready = false;
          if (this.socket === socket) this.socket = null;
          if (!settled) {
            fail(SAFE_CONNECTION_ERROR);
            return;
          }
          if (!this.closed) {
            this.closed = true;
            this.emitHealthOnce('Voice connection closed.');
            this.emit('ended', 'health');
          }
        });

        socket.addEventListener('message', event => {
          if (!this.isCurrent(socket, epoch)) return;
          void this.handleMessage(event.data, {
            epoch,
            socket,
            onReady: () => settle(() => resolve()),
            onError: () => fail(SAFE_CONNECTION_ERROR),
          });
        });
      });
    } catch (error) {
      if (this.generation === epoch) {
        this.closed = true;
        this.closeSocket();
      }
      throw error;
    }
  }

  sendAudio(chunk: ArrayBuffer): void {
    const socket = this.socket;
    if (!this.ready || !isOpen(socket)) return;
    if (socket.bufferedAmount > AUDIO_BACKPRESSURE_BYTES) return;
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
    if (!this.ready || !isOpen(socket)) {
      if (!this.closed) {
        if (this.pendingTexts.length >= PENDING_TEXT_MAX) this.pendingTexts.shift();
        this.pendingTexts.push(text);
      }
      return;
    }
    socket.send(JSON.stringify({
      realtimeInput: { text },
    }));
  }

  endAudioStream(): void {
    const socket = this.socket;
    if (!this.ready || !isOpen(socket)) return;
    socket.send(JSON.stringify({
      realtimeInput: { audioStreamEnd: true },
    }));
  }

  getResumeHandle(): string | null {
    return this.resumeHandle;
  }

  private flushPendingTexts(): void {
    if (this.pendingTexts.length === 0) return;
    const queued = this.pendingTexts;
    this.pendingTexts = [];
    for (const text of queued) this.sendText(text);
  }

  sendToolResult(callId: string, result: SiteToolResult, name?: string): void {
    const toolName = name ?? this.toolNames.get(callId);
    if (!toolName) return;
    this.sendFunctionResponse(callId, toolName, result);
  }

  interrupt(): void {
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

  private applySessionResumptionUpdate(payload: Record<string, unknown>): void {
    const update = asRecord(payload.sessionResumptionUpdate);
    if (!update) return;
    if (update.resumable !== true) {
      this.resumeHandle = null;
      return;
    }
    const handle = parseVoiceResumeHandle(update.newHandle);
    if (!handle) return;
    this.resumeHandle = handle;
  }

  private async handleMessage(
    raw: unknown,
    context?: {
      epoch: number;
      socket: WebSocket;
      onReady?: () => void;
      onError?: () => void;
    },
  ): Promise<void> {
    if (context && !this.isCurrent(context.socket, context.epoch)) return;

    const text = typeof raw === 'string' ? raw : await (raw as Blob).text();
    if (context && !this.isCurrent(context.socket, context.epoch)) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    if (hasProviderError(payload)) {
      this.emit('error', SAFE_CONNECTION_ERROR);
      if (this.ready) this.emitHealthOnce('Voice connection interrupted.');
      context?.onError?.();
      return;
    }

    this.applySessionResumptionUpdate(payload);

    if (payload.setupComplete) {
      this.ready = true;
      this.emit('phase', 'listening');
      this.flushPendingTexts();
      if (!this.greetSent && this.sessionStartCue) {
        this.greetSent = true;
        this.sendText(this.sessionStartCue);
      }
      context?.onReady?.();
      return;
    }

    if (payload.goAway) {
      this.emitHealthOnce('Voice session is ending.');
    }

    if (!this.ready) return;

    const serverContent = payload.serverContent as Record<string, unknown> | undefined;
    if (serverContent?.interrupted) {
      this.interrupt();
    }

    const input = serverContent?.inputTranscription as { text?: string } | undefined;
    if (input?.text) {
      this.emit('userTranscript', input.text);
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

    const cancelled = payload.toolCallCancellation as { ids?: unknown } | undefined;
    if (Array.isArray(cancelled?.ids) && cancelled.ids.length > 0) {
      const ids = cancelled.ids.filter((id): id is string => typeof id === 'string');
      for (const id of ids) this.toolNames.delete(id);
      if (ids.length > 0) {
        this.emit('toolCancellation', ids);
        this.emit('interrupted', true);
      }
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

    if (serverContent?.turnComplete) {
      this.emit('turnComplete', true);
      this.emit('phase', 'listening');
    }
  }
}

export function createGeminiLiveCaller(): VoiceCaller {
  return new GeminiLiveCaller();
}

export const GEMINI_LIVE_OUTPUT_RATE = VOICE_AGENT_OUTPUT_RATE;
