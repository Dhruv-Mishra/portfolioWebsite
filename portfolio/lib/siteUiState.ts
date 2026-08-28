import type { ProjectSlug } from '@/lib/projectCatalog';
import { isProjectSlug } from '@/lib/projectCatalog';

export const VALID_UI_PATHS = [
  '/',
  '/about',
  '/projects',
  '/resume',
  '/chat',
  '/guestbook',
  '/stickers',
  '/settings',
] as const;

export type UiPath = (typeof VALID_UI_PATHS)[number];

export interface ClientUiState {
  pathname: UiPath;
  theme: 'light' | 'dark';
  disco: boolean;
  audio: {
    muted: boolean;
    volume: number;
  };
  project: {
    slug: ProjectSlug;
    playing: boolean;
    muted: boolean;
  } | null;
}

const PATH_SET = new Set<string>(VALID_UI_PATHS);

function clampPercent(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.round(Math.min(100, Math.max(0, numeric)));
}

export function sanitizeClientUiState(raw: unknown): ClientUiState | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const pathname = typeof input.pathname === 'string' && PATH_SET.has(input.pathname)
    ? (input.pathname as UiPath)
    : null;
  if (!pathname) return null;

  const theme = input.theme === 'dark' ? 'dark' : 'light';
  const disco = input.disco === true;
  const audioRaw = input.audio && typeof input.audio === 'object'
    ? (input.audio as Record<string, unknown>)
    : {};
  const projectRaw = input.project && typeof input.project === 'object'
    ? (input.project as Record<string, unknown>)
    : null;

  let project: ClientUiState['project'] = null;
  if (projectRaw && typeof projectRaw.slug === 'string' && isProjectSlug(projectRaw.slug)) {
    project = {
      slug: projectRaw.slug,
      playing: projectRaw.playing === true,
      muted: projectRaw.muted !== false,
    };
  }

  return {
    pathname,
    theme,
    disco,
    audio: {
      muted: audioRaw.muted === true,
      volume: clampPercent(audioRaw.volume),
    },
    project,
  };
}

export function formatUiStateLine(state: ClientUiState): string {
  const audio = state.audio.muted ? 'muted' : `vol ${state.audio.volume}`;
  const theme = state.disco ? 'disco' : state.theme;
  const project = state.project
    ? ` project=${state.project.slug}${state.project.playing ? ' playing' : ' paused'}${state.project.muted ? ' video-muted' : ''}`
    : '';
  return `UI: ${state.pathname} ${theme} ${audio}${project}`;
}
