import { VALID_NAVIGATION_PATHS, type NavigationPath } from '@/lib/navigationPaths';

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

export const VOICE_SOURCE_SET = new Set<string>(VOICE_INVOCATION_SOURCES);
export const VOICE_TOPIC_SET = new Set<string>(VOICE_INVOCATION_TOPICS);
const ROUTE_SET = new Set<string>(VALID_NAVIGATION_PATHS);

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readAllowlisted(
  record: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && allowed.has(value) ? value : undefined;
}

export function normalizeRoute(path: string): NavigationPath | undefined {
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return ROUTE_SET.has(trimmed) ? trimmed as NavigationPath : undefined;
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
  const source = readAllowlisted(record, 'source', VOICE_SOURCE_SET) as VoiceInvocationSource | undefined;
  const topic = readAllowlisted(record, 'topic', VOICE_TOPIC_SET) as VoiceInvocationTopic | undefined;
  if (!source && !topic) return undefined;
  return { source, topic };
}
