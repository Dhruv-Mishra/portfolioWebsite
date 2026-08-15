import { PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';
import { VALID_NAVIGATION_PATHS, VALID_THEME_ACTIONS } from '@/lib/actions';

export const SITE_TOOL_NAMES = [
  'navigate_to',
  'set_theme',
  'open_project',
  'open_link',
  'open_feedback',
  'open_command_palette',
  'fill_field',
  'set_preference',
  'submit_guestbook',
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
  open_link: { key: ApprovedLinkKey };
  open_feedback: Record<string, never>;
  open_command_palette: Record<string, never>;
  fill_field: { field: VoiceFieldId; value: string; submit?: boolean };
  set_preference: { key: SitePreferenceKey; enabled: boolean };
  submit_guestbook: { message: string; name?: string };
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
