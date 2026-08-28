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
  clientState?: string;
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

export const VOICE_WELCOME_HINT = 'Try saying open projects, or just ask what I can show you.';

export const VOICE_SUGGESTION_VARIATIONS: readonly string[] = [
  'Try saying open projects if you want to wander the work.',
  'You could ask me to open the projects page and look around.',
  'Curious about the work, try saying show me the projects.',
  'Have you tried the easter egg yet by going to the terminal to type hint?',
  'There is a small easter egg hiding in the terminal if you type hint.',
  'Try saying open the resume if you want the shorter path through the work.',
  'You could ask me to pull up the resume if you would rather see the paper trail.',
  'Want the story first, try saying take me to about.',
  'The guestbook is open if you would like to leave a note, so try saying open the guestbook.',
  'Feel like signing the wall, you could ask me to bring up the guestbook.',
  'Cropio is worth a look if you want one of the bigger projects, so try saying open Cropio.',
  'If something is off or you have a thought, try saying open feedback.',
  'I can flip the site into dark mode if that is easier on the eyes, so try saying dark mode.',
  'Want a quieter look, you could ask me to switch to dark mode.',
];

export type VoiceWelcomeVariation = { greeting: string; hint: string };

export const VOICE_WELCOME_VARIATIONS: readonly VoiceWelcomeVariation[] = [
  { greeting: 'This is Dhruv Mishra\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[0] },
  { greeting: 'Welcome to Dhruv Mishra\'s site!', hint: VOICE_SUGGESTION_VARIATIONS[1] },
  { greeting: 'Dhruv\'s sketchbook is open for you.', hint: VOICE_SUGGESTION_VARIATIONS[3] },
  { greeting: 'This site belongs to Dhruv Mishra.', hint: VOICE_SUGGESTION_VARIATIONS[5] },
  { greeting: 'Come see Dhruv Mishra\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[7] },
  { greeting: 'Glad you found Dhruv\'s sketchbook.', hint: VOICE_SUGGESTION_VARIATIONS[8] },
  { greeting: 'Hello from Dhruv Mishra\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[10] },
  { greeting: 'You\'re on Dhruv Mishra\'s site.', hint: VOICE_SUGGESTION_VARIATIONS[11] },
  { greeting: 'Good to have you on Dhruv\'s site.', hint: VOICE_SUGGESTION_VARIATIONS[12] },
  { greeting: 'Pull up a chair in Dhruv\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[4] },
  { greeting: 'Hi, this is Dhruv Mishra\'s site.', hint: VOICE_SUGGESTION_VARIATIONS[2] },
  { greeting: 'Make yourself at home on Dhruv\'s site.', hint: VOICE_SUGGESTION_VARIATIONS[9] },
  { greeting: 'Look around Dhruv Mishra\'s sketchbook.', hint: VOICE_SUGGESTION_VARIATIONS[6] },
  { greeting: 'Well hello from Dhruv\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[13] },
];

export const VOICE_EXIT_VEIL_VARIATIONS: readonly string[] = [
  'Taking you back. Would love to talk again.',
  'Heading back now. Come find me anytime.',
  'Tucking the call away. I\'d like another chat.',
  'Back to the sketchbook. Call again if you want.',
  'Closing the line. I\'ll be here.',
  'Stepping out of voice. Come say hi later.',
  'That\'s the hangup. I\'d enjoy another visit.',
  'Fading this out. Talk soon if you like.',
  'Back to the page. I\'d welcome another call.',
];

export const VOICE_IDLE_CHECKIN_VARIATIONS: readonly string[] = [
  'Are you there?',
  'Still with me?',
  'You still around?',
  'Hey, still listening?',
  'Did I lose you for a second?',
  'Still there, or should I wait?',
  'Just checking you\'re still with me.',
];

export const VOICE_IDLE_HANGUP_VARIATIONS: readonly string[] = [
  'Feel free to call me again. Hanging up now.',
  'I\'ll let you go. Call back anytime.',
  'Going quiet for now. You can reach me again whenever.',
  'I\'ll hang up here. Come back if you want another look.',
  'Signing off for a bit. Feel free to call again.',
  'That\'s me hanging up. I\'d like another chat later.',
  'I\'ll close the call. Ring again whenever you like.',
];

export function pickCatalogItem<T>(items: readonly T[], random: () => number = Math.random): T {
  const index = Math.min(
    items.length - 1,
    Math.max(0, Math.floor(random() * items.length)),
  );
  return items[index];
}

export function pickVoiceWelcome(random: () => number = Math.random): VoiceWelcomeVariation {
  return pickCatalogItem(VOICE_WELCOME_VARIATIONS, random);
}

export function pickVoiceSuggestion(random: () => number = Math.random): string {
  return pickCatalogItem(VOICE_SUGGESTION_VARIATIONS, random);
}

export function pickVoiceExitVeil(random: () => number = Math.random): string {
  return pickCatalogItem(VOICE_EXIT_VEIL_VARIATIONS, random);
}

export function pickVoiceIdleCheckIn(random: () => number = Math.random): string {
  return pickCatalogItem(VOICE_IDLE_CHECKIN_VARIATIONS, random);
}

export function pickVoiceIdleHangup(random: () => number = Math.random): string {
  return pickCatalogItem(VOICE_IDLE_HANGUP_VARIATIONS, random);
}

export function buildVoiceSessionStartCue(
  setup: Pick<VoiceSessionSetup, 'welcomeGreeting' | 'welcomeHint'>,
): string {
  return `Speak this exact welcome to the visitor, then stop. Do not replace it. Welcome: ${setup.welcomeGreeting} ${setup.welcomeHint}`;
}

export function buildVoiceExactSpeakCue(line: string): string {
  return `Speak this exact line to the visitor, then stop. Do not replace it. Line: ${line}`;
}

export const VOICE_MIC_PERMISSION_PROMPT = "Seems like you haven't provided the permission to use the microphone. I would need that to hear you.";
export const VOICE_MIC_PERMISSION_TIMEOUT_LINE = "I couldn't access the microphone, disconnecting now. Feel free to call again.";
export const VOICE_MIC_PERMISSION_WAIT_MS = 10_000;

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

export const VOICE_LIVE_REALTIME_INPUT_CONFIG = {
  automaticActivityDetection: {
    disabled: false,
    startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
    prefixPaddingMs: 280,
    endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
    silenceDurationMs: 900,
  },
  activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
} as const;
