'use client';

import type { SiteAskPage } from '@/lib/chatInvocation';

export const CONTROL_PROJECT_VIDEO_EVENT = 'control-project-video';
export const PROJECT_VIDEO_STATE_EVENT = 'project-video-state';
export const OPEN_MINI_CHAT_EVENT = 'open-mini-chat';

export type ProjectVideoControlAction = 'play' | 'pause' | 'mute' | 'unmute';

export interface ControlProjectVideoEventDetail {
  action: ProjectVideoControlAction;
}

export interface ProjectVideoState {
  slug: string | null;
  available: boolean;
  playing: boolean;
  muted: boolean;
}

export interface OpenMiniChatDetail {
  page: SiteAskPage;
  greeting: string;
}

type HostId = 'project-video';

const hosts = new Set<HostId>();
const hostListeners = new Set<() => void>();
let projectVideoState: ProjectVideoState = {
  slug: null,
  available: false,
  playing: false,
  muted: true,
};

function notifyHosts(): void {
  for (const listener of hostListeners) listener();
}

export function registerSiteActionHost(id: HostId): () => void {
  hosts.add(id);
  notifyHosts();
  return () => {
    hosts.delete(id);
    notifyHosts();
  };
}

export function isSiteActionHostReady(id: HostId): boolean {
  return hosts.has(id);
}

export function subscribeSiteActionHostReady(listener: () => void): () => void {
  hostListeners.add(listener);
  return () => {
    hostListeners.delete(listener);
  };
}

export function waitForSiteActionHost(id: HostId, timeoutMs = 1400): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (isSiteActionHostReady(id)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      window.clearTimeout(timer);
      unsub();
      resolve(ok);
    };
    const unsub = subscribeSiteActionHostReady(() => {
      if (isSiteActionHostReady(id)) finish(true);
    });
    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

export function publishProjectVideoState(next: ProjectVideoState): void {
  projectVideoState = next;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ProjectVideoState>(PROJECT_VIDEO_STATE_EVENT, { detail: next }));
}

export function getProjectVideoState(): ProjectVideoState {
  return projectVideoState;
}

export function dispatchProjectVideoControl(action: ProjectVideoControlAction): boolean {
  if (typeof window === 'undefined') return false;
  return window.dispatchEvent(
    new CustomEvent<ControlProjectVideoEventDetail>(CONTROL_PROJECT_VIDEO_EVENT, {
      detail: { action },
    }),
  );
}

export function openMiniChat(detail: OpenMiniChatDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenMiniChatDetail>(OPEN_MINI_CHAT_EVENT, { detail }));
}
