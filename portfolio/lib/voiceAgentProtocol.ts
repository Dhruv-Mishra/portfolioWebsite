import type { SiteToolCall, SiteToolResult } from '@/lib/siteTools';

export type VoiceAgentPhase =
  | 'idle'
  | 'entering'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'acting'
  | 'exiting'
  | 'error';

export type VoiceExitReason = 'user' | 'health' | 'error';

export interface VoiceSessionRequest {
  lowNetwork: boolean;
  resumeHandle?: string;
}

export interface VoiceSessionHandle {
  token: string;
  expiresAt: string;
  newSessionExpiresAt: string;
  setup: VoiceSessionSetup;
}

export interface VoiceSessionSetup {
  modelLabel: string;
  voiceLabel: string;
  inputSampleRate: number;
  outputSampleRate: number;
  greetOnConnect: boolean;
  lowNetwork: boolean;
}

export interface VoiceHealthStatus {
  ok: boolean;
  configured: boolean;
  reason?: string;
}

export interface VoiceCallerEventMap {
  phase: VoiceAgentPhase;
  userTranscript: string;
  agentTranscript: string;
  audio: ArrayBuffer;
  interrupted: boolean;
  toolCall: SiteToolCall;
  turnComplete: boolean;
  health: VoiceHealthStatus;
  error: string;
  ended: VoiceExitReason;
}

export type VoiceCallerListener<K extends keyof VoiceCallerEventMap> = (
  payload: VoiceCallerEventMap[K],
) => void;

export interface VoiceCaller {
  readonly id: string;
  connect(session: VoiceSessionHandle): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  sendText(text: string): void;
  sendToolResult(callId: string, result: SiteToolResult, name?: string): void;
  interrupt(): void;
  close(reason?: VoiceExitReason): void;
  on<K extends keyof VoiceCallerEventMap>(event: K, listener: VoiceCallerListener<K>): () => void;
}

export const VOICE_WELCOME_HINT = 'Try saying, open projects';

export const DEFAULT_VOICE_SETUP: VoiceSessionSetup = {
  modelLabel: 'native-live',
  voiceLabel: 'male',
  inputSampleRate: 16_000,
  outputSampleRate: 24_000,
  greetOnConnect: true,
  lowNetwork: false,
};
