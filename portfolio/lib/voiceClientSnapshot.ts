import { VALID_NAVIGATION_PATHS } from '@/lib/actions';
import { isProjectSlug, type ProjectSlug } from '@/lib/projectCatalog';
import {
  MASTER_VOLUME_PERCENT_MAX,
  MASTER_VOLUME_PERCENT_MIN,
} from '@/lib/siteTools';
import {
  pickCatalogItem,
  pickVoiceWelcome,
  VOICE_SUGGESTION_VARIATIONS,
  type VoiceWelcomeVariation,
} from '@/lib/voiceAgentProtocol';

export const VOICE_INVOCATION_SOURCES = [
  'home',
  'nav',
  'resume',
  'settings',
  'chat',
  'command',
  'tool',
  'generic',
] as const;

export type VoiceInvocationSource = (typeof VOICE_INVOCATION_SOURCES)[number];

export const VOICE_INVOCATION_TOPICS = [
  'resume',
  'projects',
  'about',
  'guestbook',
  'chat',
  'settings',
  'stickers',
  'home',
  'generic',
] as const;

export type VoiceInvocationTopic = (typeof VOICE_INVOCATION_TOPICS)[number];

export interface VoiceInvocationContext {
  source?: VoiceInvocationSource;
  topic?: VoiceInvocationTopic;
}

export interface VoiceClientSnapshot {
  route?: (typeof VALID_NAVIGATION_PATHS)[number];
  theme?: 'light' | 'dark';
  disco?: boolean;
  muted?: boolean;
  volume?: number;
  source?: VoiceInvocationSource;
  topic?: VoiceInvocationTopic;
  openProject?: ProjectSlug;
}

const SOURCE_SET = new Set<string>(VOICE_INVOCATION_SOURCES);
const TOPIC_SET = new Set<string>(VOICE_INVOCATION_TOPICS);
const ROUTE_SET = new Set<string>(VALID_NAVIGATION_PATHS);

const CONTEXTUAL_WELCOMES: Record<VoiceInvocationTopic, readonly VoiceWelcomeVariation[]> = {
  resume: [
    { greeting: "I see you're looking at my resume, what do you wanna know?", hint: VOICE_SUGGESTION_VARIATIONS[5] },
    { greeting: "That's my resume on the table. Want the short tour?", hint: VOICE_SUGGESTION_VARIATIONS[6] },
  ],
  projects: [
    { greeting: "You're on the projects wall. Which one should we open?", hint: VOICE_SUGGESTION_VARIATIONS[0] },
    { greeting: "This is the work shelf. Curious about any of them?", hint: VOICE_SUGGESTION_VARIATIONS[10] },
  ],
  about: [
    { greeting: "You're on the about page. Want the story or the work?", hint: VOICE_SUGGESTION_VARIATIONS[7] },
    { greeting: "This is the about note. What do you wanna know?", hint: VOICE_SUGGESTION_VARIATIONS[7] },
  ],
  guestbook: [
    { greeting: "You're at the guestbook. Want to sign, or just look around?", hint: VOICE_SUGGESTION_VARIATIONS[8] },
    { greeting: "The wall is open. Leave a note, or ask me something?", hint: VOICE_SUGGESTION_VARIATIONS[9] },
  ],
  chat: [
    { greeting: "You're in chat. Want to talk instead of type?", hint: VOICE_SUGGESTION_VARIATIONS[1] },
    { greeting: "Chat's already open. What do you wanna know?", hint: VOICE_SUGGESTION_VARIATIONS[2] },
  ],
  settings: [
    { greeting: "You're in settings. Want a quieter look, or shall we wander?", hint: VOICE_SUGGESTION_VARIATIONS[12] },
    { greeting: "This is the settings desk. Need a toggle, or a tour?", hint: VOICE_SUGGESTION_VARIATIONS[13] },
  ],
  stickers: [
    { greeting: "You're in the sticker album. Want the lore, or a page hop?", hint: VOICE_SUGGESTION_VARIATIONS[3] },
    { greeting: "Sticker shelf is open. What do you wanna know?", hint: VOICE_SUGGESTION_VARIATIONS[4] },
  ],
  home: [
    { greeting: "You're on the home page. What do you wanna know?", hint: VOICE_SUGGESTION_VARIATIONS[0] },
    { greeting: "Home base. Want projects, resume, or a wander?", hint: VOICE_SUGGESTION_VARIATIONS[1] },
  ],
  generic: [
    { greeting: "Glad you're here. What do you wanna know?", hint: VOICE_SUGGESTION_VARIATIONS[2] },
    { greeting: "Sketchbook's open. Where should we look first?", hint: VOICE_SUGGESTION_VARIATIONS[11] },
  ],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAllowlisted(
  record: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && allowed.has(value) ? value : undefined;
}

function normalizeRoute(path: string): (typeof VALID_NAVIGATION_PATHS)[number] | undefined {
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return ROUTE_SET.has(trimmed) ? trimmed as (typeof VALID_NAVIGATION_PATHS)[number] : undefined;
}

export function topicFromPath(path: string | null | undefined): VoiceInvocationTopic {
  const route = path ? normalizeRoute(path) : undefined;
  if (route === '/') return 'home';
  if (route === '/resume') return 'resume';
  if (route === '/projects') return 'projects';
  if (route === '/about') return 'about';
  if (route === '/guestbook') return 'guestbook';
  if (route === '/chat') return 'chat';
  if (route === '/settings') return 'settings';
  if (route === '/stickers') return 'stickers';
  return 'generic';
}

export function parseVoiceInvocationContext(raw: unknown): VoiceInvocationContext | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  if ('nativeEvent' in record || 'currentTarget' in record) return undefined;
  const source = readAllowlisted(record, 'source', SOURCE_SET) as VoiceInvocationSource | undefined;
  const topic = readAllowlisted(record, 'topic', TOPIC_SET) as VoiceInvocationTopic | undefined;
  if (!source && !topic) return undefined;
  return { source, topic };
}

export function parseVoiceClientSnapshot(raw: unknown): VoiceClientSnapshot | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const snapshot: VoiceClientSnapshot = {};
  const routeValue = typeof record.route === 'string' ? normalizeRoute(record.route) : undefined;
  if (routeValue) snapshot.route = routeValue;
  if (record.theme === 'light' || record.theme === 'dark') snapshot.theme = record.theme;
  if (typeof record.disco === 'boolean') snapshot.disco = record.disco;
  if (typeof record.muted === 'boolean') snapshot.muted = record.muted;
  if (
    typeof record.volume === 'number'
    && Number.isInteger(record.volume)
    && record.volume >= MASTER_VOLUME_PERCENT_MIN
    && record.volume <= MASTER_VOLUME_PERCENT_MAX
  ) {
    snapshot.volume = record.volume;
  }
  const source = readAllowlisted(record, 'source', SOURCE_SET) as VoiceInvocationSource | undefined;
  const topic = readAllowlisted(record, 'topic', TOPIC_SET) as VoiceInvocationTopic | undefined;
  if (source) snapshot.source = source;
  if (topic) snapshot.topic = topic;
  if (
    routeValue === '/projects'
    && typeof record.openProject === 'string'
    && isProjectSlug(record.openProject)
  ) {
    snapshot.openProject = record.openProject;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

export function buildVoiceClientStateParagraph(snapshot: VoiceClientSnapshot): string {
  const parts = [
    snapshot.route ? `route ${snapshot.route}` : null,
    snapshot.theme ? `${snapshot.theme} theme` : null,
    snapshot.disco === true ? 'disco on' : snapshot.disco === false ? 'disco off' : null,
    snapshot.muted === true ? 'sound muted' : snapshot.muted === false ? 'sound on' : null,
    typeof snapshot.volume === 'number' ? `volume ${snapshot.volume}` : null,
    snapshot.openProject ? `open project ${snapshot.openProject}` : null,
    snapshot.topic ? `opened about ${snapshot.topic}` : null,
    snapshot.source ? `from ${snapshot.source}` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return '';
  return `Session context: ${parts.join('; ')}. Use this only to stay oriented; do not recap it unless asked.`;
}

export function pickContextualVoiceWelcome(
  topic?: VoiceInvocationTopic,
  random: () => number = Math.random,
): VoiceWelcomeVariation {
  if (!topic || topic === 'generic' || topic === 'home') {
    const genericOrHome = topic ? CONTEXTUAL_WELCOMES[topic] : null;
    if (genericOrHome && random() < 0.5) return pickCatalogItem(genericOrHome, random);
    return pickVoiceWelcome(random);
  }
  return pickCatalogItem(CONTEXTUAL_WELCOMES[topic], random);
}
