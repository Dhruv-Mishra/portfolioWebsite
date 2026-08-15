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
  { greeting: 'Hey. First look around?', hint: VOICE_WELCOME_HINT },
  { greeting: 'You just got here. I can show you around.', hint: 'Try saying, show my resume' },
  { greeting: 'Welcome in. What do you want to see first?', hint: 'Try saying, go to about' },
  { greeting: 'Take a look. I can walk you through the sketchbook.', hint: 'Try saying, open the guestbook' },
  { greeting: 'Nice, you found the place. Want a tour?', hint: 'Try saying, show Cropio' },
  { greeting: 'Hey. Want a quick look around?', hint: 'Try saying, dark mode' },
  { greeting: 'You just arrived. Tell me what to open first.', hint: 'Try saying, open feedback' },
  { greeting: 'Come in. I can show you around from here.', hint: VOICE_WELCOME_HINT },
  { greeting: 'First time here? I can give you a tour.', hint: 'Try saying, show my resume' },
  { greeting: 'Hey. Have a look around with me.', hint: 'Try saying, go to about' },
  { greeting: 'You made it. What should we open first?', hint: 'Try saying, open the guestbook' },
  { greeting: 'Welcome. I can show you around.', hint: 'Try saying, show Cropio' },
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
