import { PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';
import { VALID_NAVIGATION_PATHS, VALID_THEME_ACTIONS } from '@/lib/actions';

export const SITE_TOOL_NAMES = [
  'navigate_to',
  'set_theme',
  'open_project',
  'close_project',
  'control_project_video',
  'open_link',
  'open_feedback',
  'open_command_palette',
  'open_shortcuts',
  'open_chat',
  'browse_history',
  'scroll_page',
  'send_chat_message',
  'run_terminal_command',
  'fill_field',
  'set_preference',
  'set_master_volume',
  'set_voice_output',
  'set_voice_backend',
  'set_motion_preference',
  'submit_guestbook',
  'submit_feedback',
  'lookup_site_facts',
  'start_voice_session',
  'end_voice_session',
] as const;

export type SiteToolName = (typeof SITE_TOOL_NAMES)[number];

export const VOICE_FIELD_IDS = [
  'guestbook-message',
  'guestbook-name',
  'feedback-message',
  'feedback-contact',
  'command-palette-query',
  'terminal-input',
  'chat-composer',
] as const;

export type VoiceFieldId = (typeof VOICE_FIELD_IDS)[number];

export const SITE_PREFERENCE_KEYS = [
  'sound-effects',
  'haptics',
  'enhance-immersion',
  'stickers',
  'sticker-toasts',
  'paper-grain',
  'tape',
  'sketch-outlines',
  'speak-by-default',
  'voice-low-network',
  'voice-ambient-music',
] as const;

export type SitePreferenceKey = (typeof SITE_PREFERENCE_KEYS)[number];

export const PROJECT_VIDEO_ACTIONS = ['play', 'pause', 'mute', 'unmute'] as const;
export type ProjectVideoAction = (typeof PROJECT_VIDEO_ACTIONS)[number];

export const PAGE_SCROLL_DIRECTIONS = ['up', 'down', 'top', 'bottom'] as const;
export type PageScrollDirection = (typeof PAGE_SCROLL_DIRECTIONS)[number];

export const PAGE_SCROLL_AMOUNT_MIN = 0.25;
export const PAGE_SCROLL_AMOUNT_MAX = 3;
export const PAGE_SCROLL_AMOUNT_DEFAULT = 0.9;

export const BROWSE_HISTORY_DIRECTIONS = ['back', 'forward'] as const;
export type BrowseHistoryDirection = (typeof BROWSE_HISTORY_DIRECTIONS)[number];

export const VOICE_OUTPUT_MODES = ['device', 'server'] as const;
export type VoiceOutputMode = (typeof VOICE_OUTPUT_MODES)[number];

export const VOICE_BACKEND_MODES = ['native', 'whisper'] as const;
export type VoiceBackendMode = (typeof VOICE_BACKEND_MODES)[number];

export const MOTION_PREFERENCE_VALUES = ['system', 'reduced', 'full'] as const;
export type MotionPreferenceValue = (typeof MOTION_PREFERENCE_VALUES)[number];

export const MASTER_VOLUME_PERCENT_MIN = 0;
export const MASTER_VOLUME_PERCENT_MAX = 100;

export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'kudos', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const CHAT_MESSAGE_MAX_LENGTH = 500;

/** Bare, non-destructive terminal commands safe for voice dispatch. No args. */
export const VOICE_SAFE_TERMINAL_COMMANDS = [
  'help',
  'hint',
  'joke',
  'about',
  'contact',
  'projects',
  'guestbook',
  'settings',
  'stickers',
  'resume',
  'cv',
  'chat',
  'socials',
  'github',
  'linkedin',
  'skills',
  'ls',
  'whoami',
  'date',
  'cheatsheet',
  'feedback',
] as const;
export type VoiceSafeTerminalCommand = (typeof VOICE_SAFE_TERMINAL_COMMANDS)[number];

export const APPROVED_LINK_KEYS = [
  'github',
  'linkedin',
  'codeforces',
  'cphistory',
  'email',
  'phone',
  'resume',
  'project-jarvis',
  'project-jarvis-demo',
  'project-fluentui',
  'project-cropio',
  'project-courseevaluator',
  'project-ivc',
  'project-portfolio',
  'project-recommender',
  'project-atomvault',
  'project-bloomfilter',
] as const;

export type ApprovedLinkKey = (typeof APPROVED_LINK_KEYS)[number];

export const APPROVED_LINKS: Record<ApprovedLinkKey, string> = {
  github: PERSONAL_LINKS.github,
  linkedin: PERSONAL_LINKS.linkedin,
  codeforces: PERSONAL_LINKS.codeforces,
  cphistory: PERSONAL_LINKS.cpHistory,
  email: PERSONAL_LINKS.email,
  phone: PERSONAL_LINKS.phone,
  resume: PERSONAL_LINKS.resume,
  'project-jarvis': PROJECT_LINKS.jarvis,
  'project-jarvis-demo': PROJECT_LINKS.jarvisDemo,
  'project-fluentui': PROJECT_LINKS.fluentui,
  'project-cropio': PROJECT_LINKS.cropio,
  'project-courseevaluator': PROJECT_LINKS.courseEvaluator,
  'project-ivc': PROJECT_LINKS.ivc,
  'project-portfolio': PROJECT_LINKS.portfolio,
  'project-recommender': PROJECT_LINKS.recommender,
  'project-atomvault': PROJECT_LINKS.atomvault,
  'project-bloomfilter': PROJECT_LINKS.bloomfilter,
};

export type SiteToolArgsMap = {
  navigate_to: { path: (typeof VALID_NAVIGATION_PATHS)[number] };
  set_theme: { action: (typeof VALID_THEME_ACTIONS)[number] };
  open_project: { slug: ProjectSlug };
  close_project: Record<string, never>;
  control_project_video: { action: ProjectVideoAction };
  open_link: { key: ApprovedLinkKey };
  open_feedback: Record<string, never>;
  open_command_palette: Record<string, never>;
  open_shortcuts: Record<string, never>;
  open_chat: Record<string, never>;
  browse_history: { direction: BrowseHistoryDirection };
  scroll_page: { direction: PageScrollDirection; amount?: number };
  send_chat_message: { message: string };
  run_terminal_command: { command: VoiceSafeTerminalCommand };
  fill_field: { field: VoiceFieldId; value: string };
  set_preference: { key: SitePreferenceKey; enabled: boolean };
  set_master_volume: { percent: number };
  set_voice_output: { mode: VoiceOutputMode };
  set_voice_backend: { backend: VoiceBackendMode };
  set_motion_preference: { motion: MotionPreferenceValue };
  submit_guestbook: { message: string; name?: string };
  submit_feedback: { message: string; contact?: string; category?: FeedbackCategory };
  lookup_site_facts: { query: string };
  start_voice_session: Record<string, never>;
  end_voice_session: { reason?: 'user' | 'health' | 'error' };
};

export type SiteToolCall = {
  [Name in SiteToolName]: {
    id: string;
    name: Name;
    args: SiteToolArgsMap[Name];
  };
}[SiteToolName];

export interface SiteToolResult {
  ok: boolean;
  spokenText: string;
  displayText?: string;
  data?: Record<string, unknown>;
  errorCode?: string;
}

export const PROJECT_SLUGS = PROJECT_ACTIONS.map(project => project.slug);

export function isSiteToolName(value: unknown): value is SiteToolName {
  return typeof value === 'string' && (SITE_TOOL_NAMES as readonly string[]).includes(value);
}

export function isVoiceFieldId(value: unknown): value is VoiceFieldId {
  return typeof value === 'string' && (VOICE_FIELD_IDS as readonly string[]).includes(value);
}

export function isSitePreferenceKey(value: unknown): value is SitePreferenceKey {
  return typeof value === 'string' && (SITE_PREFERENCE_KEYS as readonly string[]).includes(value);
}

export function isApprovedLinkKey(value: unknown): value is ApprovedLinkKey {
  return typeof value === 'string' && (APPROVED_LINK_KEYS as readonly string[]).includes(value);
}

export function isProjectVideoAction(value: unknown): value is ProjectVideoAction {
  return typeof value === 'string' && (PROJECT_VIDEO_ACTIONS as readonly string[]).includes(value);
}

export function isPageScrollDirection(value: unknown): value is PageScrollDirection {
  return typeof value === 'string' && (PAGE_SCROLL_DIRECTIONS as readonly string[]).includes(value);
}

export function isBrowseHistoryDirection(value: unknown): value is BrowseHistoryDirection {
  return typeof value === 'string' && (BROWSE_HISTORY_DIRECTIONS as readonly string[]).includes(value);
}

export function isVoiceOutputMode(value: unknown): value is VoiceOutputMode {
  return typeof value === 'string' && (VOICE_OUTPUT_MODES as readonly string[]).includes(value);
}

export function isVoiceBackendMode(value: unknown): value is VoiceBackendMode {
  return typeof value === 'string' && (VOICE_BACKEND_MODES as readonly string[]).includes(value);
}

export function isMotionPreferenceValue(value: unknown): value is MotionPreferenceValue {
  return typeof value === 'string' && (MOTION_PREFERENCE_VALUES as readonly string[]).includes(value);
}

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export function isVoiceSafeTerminalCommand(value: unknown): value is VoiceSafeTerminalCommand {
  return typeof value === 'string' && (VOICE_SAFE_TERMINAL_COMMANDS as readonly string[]).includes(value);
}

/** Shared parser/event guard: allowlisted bare command only, no extra args. */
export function resolveVoiceSafeTerminalCommand(detail: unknown): VoiceSafeTerminalCommand | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const record = detail as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== 'command')) return null;
  const raw = record.command;
  if (typeof raw !== 'string') return null;
  const command = raw === '/hint' ? 'hint' : raw;
  return isVoiceSafeTerminalCommand(command) ? command : null;
}
