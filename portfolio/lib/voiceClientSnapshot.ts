import type { NavigationPath } from '@/lib/navigationPaths';
import { isProjectSlug, type ProjectSlug } from '@/lib/projectSlugs';
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
import {
  asRecord,
  normalizeRoute,
  readAllowlisted,
  VOICE_SOURCE_SET as SOURCE_SET,
  VOICE_TOPIC_SET as TOPIC_SET,
  type VoiceInvocationSource,
  type VoiceInvocationTopic,
} from '@/lib/voiceInvocation';

export {
  VOICE_INVOCATION_SOURCES,
  VOICE_INVOCATION_TOPICS,
  topicFromPath,
  parseVoiceInvocationContext,
  type VoiceInvocationSource,
  type VoiceInvocationTopic,
  type VoiceInvocationContext,
} from '@/lib/voiceInvocation';

export interface VoiceClientSnapshot {
  route?: NavigationPath;
  theme?: 'light' | 'dark';
  disco?: boolean;
  muted?: boolean;
  volume?: number;
  source?: VoiceInvocationSource;
  topic?: VoiceInvocationTopic;
  openProject?: ProjectSlug;
}

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
