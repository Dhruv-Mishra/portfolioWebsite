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
  welcomeGreeting: string;
  welcomeHint: string;
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

export const VOICE_WELCOME_VARIATIONS = [
  { greeting: 'Hey, welcome in.', hint: VOICE_WELCOME_HINT },
  { greeting: 'Good to have you here.', hint: 'Try saying, show my resume' },
  { greeting: 'Hey. You can ask me anything on the site.', hint: 'Try asking about Microsoft' },
  { greeting: 'Welcome to the sketchbook.', hint: 'Try saying, what are you working on' },
  { greeting: 'Glad you dropped in.', hint: 'Try saying, open the guestbook' },
  { greeting: 'Hey, I am here if you want a tour.', hint: 'Try saying, show Cropio' },
  { greeting: 'Welcome. Ask about work, projects, or just poke around.', hint: 'Try saying, go to about' },
  { greeting: 'Hey. Voice works for questions or site actions.', hint: 'Try saying, dark mode' },
  { greeting: 'Nice timing. I can walk you through the pages.', hint: 'Try asking about Jarvis' },
  { greeting: 'Hey, make yourself at home.', hint: 'Try saying, open feedback' },
  { greeting: 'Welcome in. Keep it casual.', hint: 'Try saying, what should I look at' },
  { greeting: 'Hey. Tell me what you want to see.', hint: VOICE_WELCOME_HINT },
] as const;

export type VoiceWelcomeVariation = (typeof VOICE_WELCOME_VARIATIONS)[number];

export function pickVoiceWelcome(random: () => number = Math.random): VoiceWelcomeVariation {
  const index = Math.min(
    VOICE_WELCOME_VARIATIONS.length - 1,
    Math.max(0, Math.floor(random() * VOICE_WELCOME_VARIATIONS.length)),
  );
  return VOICE_WELCOME_VARIATIONS[index];
}

export function buildVoiceSessionStartCue(
  setup: Pick<VoiceSessionSetup, 'welcomeGreeting' | 'welcomeHint'>,
): string {
  return `Speak this exact welcome to the visitor, then the hint, then stop. Do not replace it. Welcome: ${setup.welcomeGreeting} Hint: ${setup.welcomeHint}`;
}

export const DEFAULT_VOICE_SETUP: VoiceSessionSetup = {
  modelLabel: 'native-live',
  voiceLabel: 'male',
  inputSampleRate: 16_000,
  outputSampleRate: 24_000,
  greetOnConnect: true,
  lowNetwork: false,
  welcomeGreeting: VOICE_WELCOME_VARIATIONS[0].greeting,
  welcomeHint: VOICE_WELCOME_VARIATIONS[0].hint,
};
