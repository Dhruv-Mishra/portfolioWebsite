import {
  getDiscoActiveSync,
  getAudioCategoryVolumeSync,
  getMasterVolumeSync,
  getSoundsMutedSync,
} from '@/hooks/useStickers';
import { FINE_POINTER_QUERY } from '@/hooks/useMediaQuery';
import { readProjectSlugFromSearch } from '@/lib/siteActionEvents';
import type { ProjectSlug } from '@/lib/projectCatalog';
import type { SiteContextSection, SiteToolResult } from '@/lib/siteTools';
import { formatUserActionJournal } from '@/lib/userActionJournal';
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
  const classes = typeof document === 'undefined' ? undefined : document.documentElement?.classList;
  const theme = classes?.contains('dark') ? 'dark' : classes?.contains('light') ? 'light'
    : input.runtime?.resolvedTheme === 'dark' || input.runtime?.resolvedTheme === 'light'
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
  if (pageContext?.route) {
    return {
      ...result,
      data: { ...result.data, pageContext: { route: pageContext.route, openProject: pageContext.openProject ?? null } },
    };
  }
  return { ...result, data: { ...result.data, pageContextRefreshRequired: true } };
}

const STATE_TEXT_LIMIT = 240;
const TEXT_FIELDS = new Set(['chat-composer', 'guestbook-message', 'feedback-message']);
const PRIVATE_SELECTOR = '[data-site-context-private], [hidden], [inert], [aria-hidden="true"]';

function compactStateText(text: string | null | undefined, limit = STATE_TEXT_LIMIT): string {
  const normalized = (text ?? '').replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized;
}

function isVisibleContextElement(element: Element): boolean {
  return !element.closest(PRIVATE_SELECTOR) && element.getClientRects().length > 0;
}

function describeContextTarget(element: Element | null): string | null {
  if (element && !isVisibleContextElement(element)) return null;
  const target = element?.closest('[data-voice-field], button, a, [data-site-context], [role="dialog"], nav, main');
  if (!target || !isVisibleContextElement(target)) return null;
  const label = target.getAttribute('data-voice-field')
    ?? target.getAttribute('aria-label')
    ?? target.getAttribute('data-site-context')
    ?? target.getAttribute('title')
    ?? (target.matches('button, a') ? target.textContent : target.tagName.toLowerCase());
  return compactStateText(label, 80) || null;
}

function readInteractionContext(): Record<string, unknown> | null {
  if (typeof document === 'undefined') return null;
  const focused = document.activeElement;
  const canHover = document.defaultView?.matchMedia?.(FINE_POINTER_QUERY).matches !== false;
  const hovered = canHover ? document.querySelectorAll(':hover') : null;
  let selection: string | null = null;
  if (focused?.matches('input, textarea')) {
    const field = focused.getAttribute('data-voice-field');
    if (field && TEXT_FIELDS.has(field) && focused.getAttribute('type') !== 'password' && isVisibleContextElement(focused)) {
      const input = focused as HTMLInputElement | HTMLTextAreaElement;
      if (input.selectionStart != null && input.selectionEnd != null) {
        selection = compactStateText(input.value.slice(input.selectionStart, input.selectionEnd)) || null;
      }
    }
  } else {
    const selected = document.getSelection();
    const anchor = selected?.anchorNode?.parentElement;
    const focus = selected?.focusNode?.parentElement;
    const publicText = (element: Element | null | undefined) => element
      && element.closest('main, [data-site-context]')
      && !element.closest('input, textarea, [contenteditable], [data-site-context-private]')
      && isVisibleContextElement(element);
    if (publicText(anchor) && publicText(focus) && selected?.rangeCount === 1) {
      const contents = selected.getRangeAt(0).cloneContents();
      if (!contents.querySelector(`input, textarea, [contenteditable], ${PRIVATE_SELECTOR}`)) {
        selection = compactStateText(selected.toString()) || null;
      }
    }
  }
  return {
    selection,
    hover: describeContextTarget(hovered?.item(hovered.length - 1) ?? null),
    focus: describeContextTarget(focused),
  };
}

function readChatContext(): Record<string, unknown> | null {
  if (typeof document === 'undefined') return null;
  const composer = document.querySelector<HTMLTextAreaElement>('[data-voice-field="chat-composer"]');
  if (!composer || !isVisibleContextElement(composer)) return null;
  const messages = Array.from(document.querySelectorAll('[data-site-chat-user]')).filter(isVisibleContextElement);
  return {
    draft: compactStateText(composer.value) || null,
    recentUserMessages: messages.slice(-3).map(message => compactStateText(message.textContent)),
    ...(messages.length > 3 ? { omittedMessages: messages.length - 3 } : {}),
  };
}

function readMediaContext(openProject?: string): Record<string, unknown> | null {
  if (typeof document === 'undefined' || !openProject) return null;
  const video = document.querySelector<HTMLVideoElement>(`[data-site-context="project-preview"][data-site-project="${openProject}"] video`);
  if (!video || !isVisibleContextElement(video)) return null;
  return {
    project: openProject,
    status: video.error ? 'error' : video.ended ? 'ended' : video.paused ? 'paused' : video.readyState < 3 ? 'buffering' : 'playing',
    muted: video.muted,
    volume: Math.round(video.volume * 100),
  };
}

export function readVoiceCurrentContext(
  include: readonly SiteContextSection[] = ['page'],
  input: VoiceCurrentContextInput = {},
): Record<string, unknown> {
  const current = buildVoiceCurrentPageContext(input);
  const data: Record<string, unknown> = {};
  for (const section of new Set(include)) {
    switch (section) {
      case 'page':
        data.pageContext = { route: current?.route ?? null, openProject: current?.openProject ?? null };
        break;
      case 'preferences':
        data.preferences = {
          theme: current?.theme ?? null,
          disco: current?.disco,
          muted: current?.muted,
          volume: current?.volume,
          audio: {
            'voice-agent': Math.round(getAudioCategoryVolumeSync('voiceAgent') * 100),
            'website-effects': Math.round(getAudioCategoryVolumeSync('siteSfx') * 100),
            'chat-read-aloud': Math.round(getAudioCategoryVolumeSync('chatTts') * 100),
          },
        };
        break;
      case 'interaction':
        data.interaction = current?.route ? readInteractionContext() : null;
        break;
      case 'media':
        data.media = current?.route === '/projects' ? readMediaContext(current.openProject) : null;
        break;
      case 'chat':
        data.chat = current?.route ? readChatContext() : null;
        break;
      case 'history':
        data.recentActions = formatUserActionJournal();
        break;
    }
  }
  return data;
}
