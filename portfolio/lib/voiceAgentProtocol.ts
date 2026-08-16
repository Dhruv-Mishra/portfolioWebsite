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

export const VOICE_WELCOME_HINT = 'Try saying open projects, or just ask what I can show you.';

export const VOICE_SUGGESTION_VARIATIONS: readonly string[] = [
  'Try saying open projects if you want to wander the work.',
  'You could ask me to open the projects page and look around.',
  'Curious about the work? Try saying show me the projects.',
  'Have you tried the easter egg yet? Go to the terminal and type hint.',
  'There is a small easter egg hiding in the terminal if you type hint.',
  'Try saying open the resume if you want the shorter path through the work.',
  'You could ask me to pull up the resume if you would rather see the paper trail.',
  'Want the story first? Try saying take me to about.',
  'The guestbook is open if you would like to leave a note. Try saying open the guestbook.',
  'Feel like signing the wall? You could ask me to bring up the guestbook.',
  'Cropio is worth a look if you want one of the bigger projects. Try saying open Cropio.',
  'If something is off or you have a thought, try saying open feedback.',
  'I can flip the site into dark mode if that is easier on the eyes. Try saying dark mode.',
  'Want a quieter look? You could ask me to switch to dark mode.',
];

export type VoiceWelcomeVariation = { greeting: string; hint: string };

export const VOICE_WELCOME_VARIATIONS: readonly VoiceWelcomeVariation[] = [
  { greeting: 'Hey there. This is Dhruv Mishra\'s portfolio, a small sketchbook of the work.', hint: VOICE_SUGGESTION_VARIATIONS[0] },
  { greeting: 'Welcome. You\'ve landed on Dhruv Mishra\'s site — the work, the path, and a few corners to poke at.', hint: VOICE_SUGGESTION_VARIATIONS[1] },
  { greeting: 'And who do we have here today? This sketchbook is Dhruv Mishra\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[3] },
  { greeting: 'Nice to meet you. This site is about Dhruv Mishra, told through projects and notes.', hint: VOICE_SUGGESTION_VARIATIONS[5] },
  { greeting: 'Come on in. You\'re on Dhruv Mishra\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[7] },
  { greeting: 'Glad you found the place. This is Dhruv\'s site, a sketchbook of the work so far.', hint: VOICE_SUGGESTION_VARIATIONS[8] },
  { greeting: 'Hello. You\'re visiting Dhruv Mishra\'s portfolio; have a look around.', hint: VOICE_SUGGESTION_VARIATIONS[10] },
  { greeting: 'Oh, hey. This sketchbook belongs to Dhruv Mishra — the work and the story behind it.', hint: VOICE_SUGGESTION_VARIATIONS[11] },
  { greeting: 'Good to have you. This is Dhruv Mishra\'s site, built as a little tour of the work.', hint: VOICE_SUGGESTION_VARIATIONS[12] },
  { greeting: 'Pull up a chair. You\'re looking at Dhruv Mishra\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[4] },
  { greeting: 'Hi. This site is Dhruv Mishra\'s portfolio — projects, a resume, and a few hidden corners.', hint: VOICE_SUGGESTION_VARIATIONS[2] },
  { greeting: 'Make yourself at home. This is Dhruv Mishra\'s portfolio.', hint: VOICE_SUGGESTION_VARIATIONS[9] },
  { greeting: 'Look who stopped by. You\'re on Dhruv Mishra\'s site, a sketchbook more than a brochure.', hint: VOICE_SUGGESTION_VARIATIONS[6] },
  { greeting: 'Well hello. This portfolio is Dhruv Mishra\'s — come see what\'s here.', hint: VOICE_SUGGESTION_VARIATIONS[13] },
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
