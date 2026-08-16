import type { ProjectSlug } from '@/lib/projectCatalog';
import type {
  BrowseHistoryDirection,
  FeedbackCategory,
  PageScrollDirection,
  ProjectVideoAction,
  SiteToolResult,
  VoiceSafeTerminalCommand,
} from '@/lib/siteTools';

export const OPEN_PROJECT_EVENT = 'voice-open-project';
export const CLOSE_PROJECT_EVENT = 'voice-close-project';
export const CONTROL_PROJECT_VIDEO_EVENT = 'voice-control-project-video';
export const SEND_CHAT_MESSAGE_EVENT = 'voice-send-chat-message';
export const RUN_TERMINAL_COMMAND_EVENT = 'voice-run-terminal-command';
export const SUBMIT_GUESTBOOK_EVENT = 'voice-submit-guestbook';
export const SUBMIT_FEEDBACK_EVENT = 'voice-submit-feedback';
export const OPEN_CHAT_EVENT = 'open-chat';
export const OPEN_SHORTCUTS_EVENT = 'open-shortcuts';

export const PROJECT_OPEN_QUERY_KEY = 'project';

export interface OpenProjectEventDetail {
  slug: ProjectSlug;
}

export interface ControlProjectVideoEventDetail {
  action: ProjectVideoAction;
}

export interface SendChatMessageEventDetail {
  message: string;
}

export interface RunTerminalCommandEventDetail {
  command: VoiceSafeTerminalCommand;
}

export interface SubmitGuestbookEventDetail {
  message: string;
  name?: string;
}

export interface SubmitFeedbackEventDetail {
  message: string;
  contact?: string;
  category?: FeedbackCategory;
}

export type SiteActionHostId = 'project-video' | 'chat' | 'terminal' | 'guestbook' | 'feedback';

export interface SiteActionHostResult {
  handled: boolean;
  result?: SiteToolResult;
}

const readyHosts = new Set<SiteActionHostId>();
const hostReadyListeners = new Set<(id: SiteActionHostId) => void>();

export function registerSiteActionHost(id: SiteActionHostId): () => void {
  readyHosts.add(id);
  for (const listener of hostReadyListeners) listener(id);
  return () => {
    readyHosts.delete(id);
  };
}

export function isSiteActionHostReady(id: SiteActionHostId): boolean {
  return readyHosts.has(id);
}

export function subscribeSiteActionHostReady(
  listener: (id: SiteActionHostId) => void,
): () => void {
  hostReadyListeners.add(listener);
  return () => {
    hostReadyListeners.delete(listener);
  };
}

export function resetSiteActionHostsForTests(): void {
  readyHosts.clear();
  hostReadyListeners.clear();
}

function dispatchCancellable<T>(name: string, detail: T): SiteActionHostResult {
  if (typeof window === 'undefined') {
    return { handled: false };
  }
  const event = new CustomEvent<T>(name, { detail, cancelable: true });
  window.dispatchEvent(event);
  // Dispatch only reports acceptance. Listeners must claim synchronously
  // before starting async work; late attaches are not observed here.
  // A claimed result may be a thenable that settles to the final SiteToolResult.
  if (!event.defaultPrevented) {
    return { handled: false };
  }
  const result = (event as CustomEvent<T> & { siteActionResult?: SiteToolResult }).siteActionResult;
  return { handled: true, result };
}

export function attachSiteActionResult(
  event: Event,
  result: SiteToolResult | Promise<SiteToolResult>,
): void {
  Object.assign(event, { siteActionResult: result });
  if ('preventDefault' in event) event.preventDefault();
}

export function requestOpenProject(slug: ProjectSlug): SiteActionHostResult {
  return dispatchCancellable<OpenProjectEventDetail>(OPEN_PROJECT_EVENT, { slug });
}

export function requestCloseProject(): SiteActionHostResult {
  return dispatchCancellable(CLOSE_PROJECT_EVENT, {});
}

export function requestProjectVideoControl(action: ProjectVideoAction): SiteActionHostResult {
  return dispatchCancellable<ControlProjectVideoEventDetail>(CONTROL_PROJECT_VIDEO_EVENT, { action });
}

export function requestSendChatMessage(message: string): SiteActionHostResult {
  return dispatchCancellable<SendChatMessageEventDetail>(SEND_CHAT_MESSAGE_EVENT, { message });
}

export function requestRunTerminalCommand(command: VoiceSafeTerminalCommand): SiteActionHostResult {
  return dispatchCancellable<RunTerminalCommandEventDetail>(RUN_TERMINAL_COMMAND_EVENT, { command });
}

export function requestSubmitGuestbook(detail: SubmitGuestbookEventDetail): SiteActionHostResult {
  return dispatchCancellable<SubmitGuestbookEventDetail>(SUBMIT_GUESTBOOK_EVENT, detail);
}

export function requestSubmitFeedback(detail: SubmitFeedbackEventDetail): SiteActionHostResult {
  return dispatchCancellable<SubmitFeedbackEventDetail>(SUBMIT_FEEDBACK_EVENT, detail);
}

export function requestOpenChat(): boolean {
  if (typeof window === 'undefined') return false;
  const event = new CustomEvent(OPEN_CHAT_EVENT, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function requestOpenShortcuts(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_EVENT));
}

export function browseHistory(direction: BrowseHistoryDirection): SiteToolResult {
  if (typeof window === 'undefined') {
    return { ok: false, spokenText: 'Browser history is only available in the browser.', errorCode: 'no-window' };
  }
  if (direction === 'back') {
    window.history.back();
    return { ok: true, spokenText: 'Going back.', data: { direction } };
  }
  window.history.forward();
  return { ok: true, spokenText: 'Going forward.', data: { direction } };
}

export function scrollRoutePage(direction: PageScrollDirection, amount: number): SiteToolResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, spokenText: 'I can only scroll in the browser.', errorCode: 'no-window' };
  }
  const container = document.querySelector<HTMLElement>('[data-route-scroll-container]');
  if (!container) {
    return { ok: false, spokenText: 'I could not find the page scroller.', errorCode: 'missing-scroll-container' };
  }

  const viewport = container.clientHeight || window.innerHeight;
  if (direction === 'top') {
    container.scrollTo({ top: 0, behavior: 'smooth' });
    return { ok: true, spokenText: 'Scrolled to the top.', data: { direction, nextAction: 'Want me to open a section from here?' } };
  }
  if (direction === 'bottom') {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    return { ok: true, spokenText: 'Scrolled to the bottom.', data: { direction, nextAction: 'Want me to go back to the top?' } };
  }

  const delta = viewport * amount * (direction === 'up' ? -1 : 1);
  container.scrollBy({ top: delta, behavior: 'smooth' });
  return {
    ok: true,
    spokenText: direction === 'down' ? 'Scrolling down.' : 'Scrolling up.',
    data: { direction, amount, nextAction: 'Want another scroll, or should I open something on this page?' },
  };
}

export function buildProjectHref(slug: ProjectSlug): string {
  return `/projects?${PROJECT_OPEN_QUERY_KEY}=${encodeURIComponent(slug)}`;
}

export function readProjectSlugFromSearch(search: string | null | undefined): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const slug = params.get(PROJECT_OPEN_QUERY_KEY)?.trim();
  return slug || null;
}
