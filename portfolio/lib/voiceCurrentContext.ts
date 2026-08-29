import {
  getDiscoActiveSync,
  getMasterVolumeSync,
  getSoundsMutedSync,
} from '@/hooks/useStickers';
import { readProjectSlugFromSearch } from '@/lib/siteActionEvents';
import type { ProjectSlug } from '@/lib/projectCatalog';
import type { SiteToolResult } from '@/lib/siteTools';
import {
  parseVoiceClientSnapshot,
  topicFromPath,
  type VoiceClientSnapshot,
} from '@/lib/voiceClientSnapshot';

export type VoiceCurrentPageContext = Pick<
  VoiceClientSnapshot,
  'route' | 'topic' | 'theme' | 'disco' | 'muted' | 'volume' | 'openProject'
>;

export interface VoiceCurrentContextRuntime {
  pathname?: string;
  resolvedTheme?: string;
  discoActive?: boolean;
}

export interface VoiceCurrentContextLocation {
  pathname?: string;
  search?: string;
}

export interface VoiceCurrentContextInput {
  runtime?: VoiceCurrentContextRuntime | null;
  location?: VoiceCurrentContextLocation | null;
  disco?: boolean;
  muted?: boolean;
  volume?: number;
}

function trimPath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function browserLocation(): VoiceCurrentContextLocation | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

export function readAuthoritativePathname(
  runtimePathname?: string | null,
  location?: VoiceCurrentContextLocation | null,
): string | null {
  const raw = location?.pathname
    ?? browserLocation()?.pathname
    ?? runtimePathname
    ?? null;
  if (!raw) return null;
  return trimPath(raw);
}

export function readAuthoritativeSearch(
  location?: VoiceCurrentContextLocation | null,
): string {
  return location?.search ?? browserLocation()?.search ?? '';
}

function sanitizePageContext(raw: {
  route?: string;
  topic?: string;
  theme?: string;
  disco?: boolean;
  muted?: boolean;
  volume?: number;
  openProject?: string | null;
}): VoiceCurrentPageContext | undefined {
  const parsed = parseVoiceClientSnapshot({
    route: raw.route,
    topic: raw.topic,
    theme: raw.theme,
    disco: raw.disco,
    muted: raw.muted,
    volume: raw.volume,
    openProject: raw.openProject,
  });
  if (!parsed) return undefined;

  const context: VoiceCurrentPageContext = {};
  if (parsed.route) context.route = parsed.route;
  if (parsed.topic) context.topic = parsed.topic;
  else if (parsed.route) context.topic = topicFromPath(parsed.route);
  if (parsed.theme) context.theme = parsed.theme;
  if (typeof parsed.disco === 'boolean') context.disco = parsed.disco;
  if (typeof parsed.muted === 'boolean') context.muted = parsed.muted;
  if (typeof parsed.volume === 'number') context.volume = parsed.volume;
  if (parsed.openProject && parsed.route === '/projects') {
    context.openProject = parsed.openProject;
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

function readLiveSoundState(runtime?: VoiceCurrentContextRuntime | null): {
  disco?: boolean;
  muted?: boolean;
  volume?: number;
} {
  try {
    return {
      disco: getDiscoActiveSync(),
      muted: getSoundsMutedSync(),
      volume: Math.round(getMasterVolumeSync() * 100),
    };
  } catch {
    return typeof runtime?.discoActive === 'boolean' ? { disco: runtime.discoActive } : {};
  }
}

export function buildVoiceCurrentPageContext(
  input: VoiceCurrentContextInput = {},
): VoiceCurrentPageContext | undefined {
  const pathname = readAuthoritativePathname(input.runtime?.pathname, input.location);
  const search = readAuthoritativeSearch(input.location);
  const openProject = readProjectSlugFromSearch(search);
  const liveSound = readLiveSoundState(input.runtime);
  const disco = typeof input.disco === 'boolean' ? input.disco : liveSound.disco;
  const muted = typeof input.muted === 'boolean' ? input.muted : liveSound.muted;
  const volume = typeof input.volume === 'number' ? input.volume : liveSound.volume;
  const theme = input.runtime?.resolvedTheme === 'dark' || input.runtime?.resolvedTheme === 'light'
    ? input.runtime.resolvedTheme
    : undefined;

  return sanitizePageContext({
    route: pathname ?? undefined,
    topic: pathname ? topicFromPath(pathname) : undefined,
    theme,
    disco,
    muted,
    volume,
    openProject: openProject ?? undefined,
  });
}

export function expectedPageContextAfterNavigate(
  path: NonNullable<VoiceCurrentPageContext['route']>,
  current?: VoiceCurrentPageContext,
): VoiceCurrentPageContext | undefined {
  const next: VoiceCurrentPageContext = { ...current, route: path, topic: topicFromPath(path) };
  delete next.openProject;
  return sanitizePageContext(next);
}

export function expectedPageContextAfterOpenProject(
  slug: ProjectSlug,
  current?: VoiceCurrentPageContext,
): VoiceCurrentPageContext | undefined {
  return sanitizePageContext({
    ...current,
    route: '/projects',
    topic: 'projects',
    openProject: slug,
  });
}

export function expectedPageContextAfterCloseProject(
  current?: VoiceCurrentPageContext,
): VoiceCurrentPageContext | undefined {
  const next: VoiceCurrentPageContext = { ...current };
  delete next.openProject;
  return sanitizePageContext(next);
}

export function withVoicePageContext(
  result: SiteToolResult,
  pageContext?: VoiceCurrentPageContext,
): SiteToolResult {
  if (!result.ok) return result;
  if (pageContext && Object.keys(pageContext).length > 0) {
    return { ...result, data: { ...result.data, pageContext } };
  }
  return { ...result, data: { ...result.data, pageContextRefreshRequired: true } };
}
