// lib/actions.ts — Chat action metadata and follow-up suggestions
import { PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';
import {
  isSitePreferenceKey,
  isVoiceFieldId,
  type SitePreferenceKey,
  type VoiceFieldId,
} from '@/lib/siteTools';

export interface FieldFillAction {
  field: VoiceFieldId;
  value: string;
  submit?: boolean;
}

export interface PreferenceAction {
  key: SitePreferenceKey;
  enabled: boolean;
}

export interface GuestbookSubmitAction {
  message: string;
  name?: string;
}

export interface ActionExecution {
  navigateTo?: string;
  themeAction?: 'dark' | 'light' | 'toggle' | 'disco' | 'disco-off';
  openUrls?: string[];
  feedbackAction?: boolean;
  projectSlug?: ProjectSlug;
  commandPaletteAction?: boolean;
  voiceSessionAction?: boolean;
  fieldFill?: FieldFillAction;
  preferenceAction?: PreferenceAction;
  guestbookSubmit?: GuestbookSubmitAction;
}

/** Action metadata for suggestion chips and prompt documentation. */
export interface ActionDef {
  label: string;
  navigateTo?: string;
  themeAction?: 'dark' | 'light' | 'toggle' | 'disco' | 'disco-off';
  openUrls?: string[];
  feedbackAction?: boolean;
  projectSlug?: ProjectSlug;
  commandPaletteAction?: boolean;
  voiceSessionAction?: boolean;
  fieldFill?: FieldFillAction;
  preferenceAction?: PreferenceAction;
  guestbookSubmit?: GuestbookSubmitAction;
}

export const VALID_NAVIGATION_PATHS = ['/', '/about', '/projects', '/resume', '/chat', '/guestbook', '/stickers', '/settings'] as const;
export const VALID_THEME_ACTIONS = ['dark', 'light', 'toggle', 'disco', 'disco-off'] as const;

type NavigationPath = (typeof VALID_NAVIGATION_PATHS)[number];
type ThemeAction = (typeof VALID_THEME_ACTIONS)[number];

const NAVIGATION_PATH_SET = new Set<string>(VALID_NAVIGATION_PATHS);
const THEME_ACTION_SET = new Set<string>(VALID_THEME_ACTIONS);
const PROJECT_SLUG_SET = new Set<string>(PROJECT_ACTIONS.map(project => project.slug));
const ACTION_EXECUTION_KEYS = new Set([
  'navigateTo',
  'themeAction',
  'openUrls',
  'feedbackAction',
  'projectSlug',
  'commandPaletteAction',
  'voiceSessionAction',
  'fieldFill',
  'preferenceAction',
  'guestbookSubmit',
]);

export const DISCO_ACTION_LABEL = 'Engage disco mode';
export const DISCO_EXIT_ACTION_LABEL = 'Exit disco mode';
export const DISCO_EXPLAINER_LABEL = "What's disco mode?";

const NAVIGATION_REPLIES: Record<NavigationPath, string> = {
  '/': 'Taking you back to the home page ~',
  '/about': 'Opening the about page ~',
  '/projects': 'Taking you to the projects page ~',
  '/resume': 'Opening the resume page ~',
  '/chat': 'Bringing you back to the chat page ~',
  '/guestbook': 'Opening the guestbook ~',
  '/stickers': 'Opening the sticker collection ~',
  '/settings': 'Opening the settings page ~',
};

const THEME_REPLIES: Record<ThemeAction, string> = {
  dark: 'Switching to dark mode ~',
  light: 'Switching to light mode ~',
  toggle: 'Toggling the theme ~',
  disco: 'Engaging disco mode — turn the music up ~',
  'disco-off': 'Exiting disco mode ~',
};

const OPEN_LINK_TOOL_OPTIONS = [
  { key: 'github', url: PERSONAL_LINKS.github, fallbackReply: 'Opening GitHub for you ~' },
  { key: 'linkedin', url: PERSONAL_LINKS.linkedin, fallbackReply: 'Opening LinkedIn for you ~' },
  { key: 'codeforces', url: PERSONAL_LINKS.codeforces, fallbackReply: 'Opening Codeforces for you ~' },
  { key: 'cphistory', url: PERSONAL_LINKS.cpHistory, fallbackReply: 'Opening CP history for you ~' },
  { key: 'email', url: PERSONAL_LINKS.email, fallbackReply: 'Opening email ~' },
  { key: 'phone', url: PERSONAL_LINKS.phone, fallbackReply: 'Opening the phone shortcut ~' },
  { key: 'resume', url: PERSONAL_LINKS.resume, fallbackReply: 'Opening the resume PDF ~' },
  { key: 'project-jarvis', url: PROJECT_LINKS.jarvis, fallbackReply: 'Opening the Jarvis voice agent repo ~' },
  { key: 'project-jarvis-demo', url: PROJECT_LINKS.jarvisDemo, fallbackReply: 'Calling Jarvis live ~' },
  { key: 'project-fluentui', url: PROJECT_LINKS.fluentui, fallbackReply: 'Opening the Fluent UI repo ~' },
  { key: 'project-cropio', url: PROJECT_LINKS.cropio, fallbackReply: 'Opening the Cropio repo ~' },
  { key: 'project-courseevaluator', url: PROJECT_LINKS.courseEvaluator, fallbackReply: 'Opening the Course Evaluator repo ~' },
  { key: 'project-ivc', url: PROJECT_LINKS.ivc, fallbackReply: 'Opening the IVC repo ~' },
  { key: 'project-portfolio', url: PROJECT_LINKS.portfolio, fallbackReply: 'Opening the portfolio repo ~' },
  { key: 'project-recommender', url: PROJECT_LINKS.recommender, fallbackReply: 'Opening the Hybrid Recommender repo ~' },
  { key: 'project-atomvault', url: PROJECT_LINKS.atomvault, fallbackReply: 'Opening the AtomVault repo ~' },
  { key: 'project-bloomfilter', url: PROJECT_LINKS.bloomfilter, fallbackReply: 'Opening the Bloom Filter research link ~' },
] as const;

const OPEN_LINK_OPTIONS_BY_URL = new Map<string, (typeof OPEN_LINK_TOOL_OPTIONS)[number]>(
  OPEN_LINK_TOOL_OPTIONS.map(option => [option.url, option])
);
const APPROVED_OPEN_URLS = new Set<string>(OPEN_LINK_TOOL_OPTIONS.map(option => option.url));

const PROJECT_MODAL_ACTIONS: ActionDef[] = PROJECT_ACTIONS.map(project => ({
  label: project.label,
  projectSlug: project.slug,
}));

/**
 * Central action registry — single source of truth for all chat actions.
 * Defines label, response, side-effect metadata, fuzzy matching config,
 * and theme-conditional visibility.
 */
export const ACTION_REGISTRY: ActionDef[] = [
  ...PROJECT_MODAL_ACTIONS,
  {
    label: 'Open command palette',
    commandPaletteAction: true,
  },
  {
    label: 'Show me your portfolio',
    navigateTo: '/projects',
  },
  {
    label: 'Go to the home page',
    navigateTo: '/',
  },
  {
    label: 'Open the resume page',
    navigateTo: '/resume',
  },
  {
    label: 'Return to chat',
    navigateTo: '/chat',
  },
  {
    label: 'Switch to dark mode',
    themeAction: 'dark',
  },
  {
    label: 'Switch to light mode',
    themeAction: 'light',
  },
  {
    label: 'Toggle the theme',
    themeAction: 'toggle',
  },
  {
    label: DISCO_ACTION_LABEL,
    themeAction: 'disco',
  },
  {
    label: DISCO_EXIT_ACTION_LABEL,
    themeAction: 'disco-off',
  },
  {
    label: 'Take me to the projects page',
    navigateTo: '/projects',
  },
  {
    label: 'Show me your experience timeline',
    navigateTo: '/about',
  },
  {
    label: 'Open the guestbook',
    navigateTo: '/guestbook',
  },
  {
    label: 'Browse the sticker collection',
    navigateTo: '/stickers',
  },
  {
    label: 'Open chat settings',
    navigateTo: '/settings',
  },
  {
    label: 'Open the Cropio repo',
    openUrls: [PROJECT_LINKS.cropio],
  },
  {
    label: 'Open the Jarvis voice agent repo',
    openUrls: [PROJECT_LINKS.jarvis],
  },
  {
    label: 'Try the Jarvis voice agent live',
    openUrls: [PROJECT_LINKS.jarvisDemo],
  },
  {
    label: 'Open your GitHub profile',
    openUrls: [PERSONAL_LINKS.github],
  },
  {
    label: 'Show me your resume PDF',
    openUrls: [PERSONAL_LINKS.resume],
  },
  {
    label: 'Open the Fluent UI repo',
    openUrls: [PROJECT_LINKS.fluentui],
  },
  {
    label: 'Open the Course Evaluator repo',
    openUrls: [PROJECT_LINKS.courseEvaluator],
  },
  {
    label: 'Open the IVC repo',
    openUrls: [PROJECT_LINKS.ivc],
  },
  {
    label: 'Open the portfolio source',
    openUrls: [PROJECT_LINKS.portfolio],
  },
  {
    label: 'Open the Hybrid Recommender repo',
    openUrls: [PROJECT_LINKS.recommender],
  },
  {
    label: 'Open the AtomVault repo',
    openUrls: [PROJECT_LINKS.atomvault],
  },
  {
    label: 'Open the Bloom Filter research',
    openUrls: [PROJECT_LINKS.bloomfilter],
  },
  {
    label: 'Open your LinkedIn',
    openUrls: [PERSONAL_LINKS.linkedin],
  },
  {
    label: 'Show your Codeforces profile',
    openUrls: [PERSONAL_LINKS.codeforces],
  },
  {
    label: 'Open your CP history',
    openUrls: [PERSONAL_LINKS.cpHistory],
  },
  {
    label: 'Email me',
    openUrls: [PERSONAL_LINKS.email],
  },
  {
    label: 'Call me',
    openUrls: [PERSONAL_LINKS.phone],
  },
  {
    label: 'Report a bug',
    feedbackAction: true,
  },
  {
    label: 'Start voice mode',
    voiceSessionAction: true,
  },
];

export function hasActionExecution(action: unknown): action is ActionExecution {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return false;
  }

  const candidate = action as Record<string, unknown>;
  for (const [key, value] of Object.entries(candidate)) {
    if (!ACTION_EXECUTION_KEYS.has(key) && value !== undefined) {
      return false;
    }
  }

  if (candidate.navigateTo !== undefined &&
    (typeof candidate.navigateTo !== 'string' || !NAVIGATION_PATH_SET.has(candidate.navigateTo))) {
    return false;
  }

  if (candidate.themeAction !== undefined &&
    (typeof candidate.themeAction !== 'string' || !THEME_ACTION_SET.has(candidate.themeAction))) {
    return false;
  }

  if (candidate.projectSlug !== undefined &&
    (typeof candidate.projectSlug !== 'string' || !PROJECT_SLUG_SET.has(candidate.projectSlug))) {
    return false;
  }

  if (candidate.feedbackAction !== undefined && candidate.feedbackAction !== true) {
    return false;
  }

  if (candidate.commandPaletteAction !== undefined && candidate.commandPaletteAction !== true) {
    return false;
  }

  if (candidate.voiceSessionAction !== undefined && candidate.voiceSessionAction !== true) {
    return false;
  }

  if (candidate.fieldFill !== undefined) {
    if (!candidate.fieldFill || typeof candidate.fieldFill !== 'object' || Array.isArray(candidate.fieldFill)) {
      return false;
    }
    const fieldFill = candidate.fieldFill as Record<string, unknown>;
    if (!isVoiceFieldId(fieldFill.field) || typeof fieldFill.value !== 'string' || fieldFill.value.trim().length === 0 || fieldFill.value.length > 1000) {
      return false;
    }
    if (fieldFill.submit !== undefined && fieldFill.submit !== true) {
      return false;
    }
  }

  if (candidate.preferenceAction !== undefined) {
    if (!candidate.preferenceAction || typeof candidate.preferenceAction !== 'object' || Array.isArray(candidate.preferenceAction)) {
      return false;
    }
    const preference = candidate.preferenceAction as Record<string, unknown>;
    if (!isSitePreferenceKey(preference.key) || typeof preference.enabled !== 'boolean') {
      return false;
    }
  }

  if (candidate.guestbookSubmit !== undefined) {
    if (!candidate.guestbookSubmit || typeof candidate.guestbookSubmit !== 'object' || Array.isArray(candidate.guestbookSubmit)) {
      return false;
    }
    const guestbook = candidate.guestbookSubmit as Record<string, unknown>;
    if (typeof guestbook.message !== 'string' || guestbook.message.trim().length < 5 || guestbook.message.length > 300) {
      return false;
    }
    if (guestbook.name !== undefined && (typeof guestbook.name !== 'string' || guestbook.name.trim().length < 2 || guestbook.name.length > 40)) {
      return false;
    }
  }

  let uniqueUrls: string[] = [];
  if (candidate.openUrls !== undefined) {
    if (!Array.isArray(candidate.openUrls) || candidate.openUrls.length === 0 || candidate.openUrls.length > 2) {
      return false;
    }

    for (const url of candidate.openUrls) {
      if (typeof url !== 'string' || !APPROVED_OPEN_URLS.has(url)) {
        return false;
      }
    }
    uniqueUrls = [...new Set(candidate.openUrls)];
    if (uniqueUrls.length > 2) {
      return false;
    }
  }

  const transientSurfaceCount = Number(candidate.feedbackAction === true) +
    Number(candidate.projectSlug !== undefined) +
    Number(candidate.commandPaletteAction === true) +
    Number(candidate.voiceSessionAction === true) +
    Number(candidate.fieldFill !== undefined) +
    Number(candidate.guestbookSubmit !== undefined);
  if (transientSurfaceCount > 1 || (candidate.navigateTo !== undefined && transientSurfaceCount > 0)) {
    return false;
  }

  const effectCount = Number(candidate.navigateTo !== undefined) +
    Number(candidate.themeAction !== undefined) +
    Number(candidate.feedbackAction === true) +
    Number(candidate.projectSlug !== undefined) +
    Number(candidate.commandPaletteAction === true) +
    Number(candidate.voiceSessionAction === true) +
    Number(candidate.fieldFill !== undefined) +
    Number(candidate.preferenceAction !== undefined) +
    Number(candidate.guestbookSubmit !== undefined) +
    uniqueUrls.length;

  return effectCount > 0 && effectCount <= 3;
}

function normalizeActionLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function toActionExecution(action: ActionDef): ActionExecution {
  return {
    navigateTo: action.navigateTo,
    themeAction: action.themeAction,
    openUrls: action.openUrls ? [...action.openUrls] : undefined,
    feedbackAction: action.feedbackAction,
    projectSlug: action.projectSlug,
    commandPaletteAction: action.commandPaletteAction,
    voiceSessionAction: action.voiceSessionAction,
    fieldFill: action.fieldFill ? { ...action.fieldFill } : undefined,
    preferenceAction: action.preferenceAction ? { ...action.preferenceAction } : undefined,
    guestbookSubmit: action.guestbookSubmit ? { ...action.guestbookSubmit } : undefined,
  };
}

export function resolveExactActionLabel(label: string): ActionExecution | null {
  const normalized = normalizeActionLabel(label);
  const action = ACTION_REGISTRY.find(entry => normalizeActionLabel(entry.label) === normalized);
  if (!action) return null;

  const execution = toActionExecution(action);
  return hasActionExecution(execution) ? execution : null;
}

export function getActionFallbackReply(action: ActionExecution | null | undefined): string | null {
  if (!action) {
    return null;
  }

  if (action.projectSlug) {
    const project = PROJECT_ACTIONS.find(entry => entry.slug === action.projectSlug);
    return project?.response ?? 'Opening that project right here ~';
  }

  if (action.navigateTo && NAVIGATION_PATH_SET.has(action.navigateTo)) {
    return NAVIGATION_REPLIES[action.navigateTo as NavigationPath];
  }

  if (action.themeAction && THEME_ACTION_SET.has(action.themeAction)) {
    return THEME_REPLIES[action.themeAction as ThemeAction];
  }

  if (action.feedbackAction) {
    return 'Opening the feedback note ~';
  }

  if (action.commandPaletteAction) {
    return 'Opening the command palette ~';
  }

  if (action.voiceSessionAction) {
    return 'Switching to voice mode ~';
  }

  if (action.fieldFill) {
    return action.fieldFill.submit ? 'Typing that in and sending it ~' : 'Typing that in for you ~';
  }

  if (action.preferenceAction) {
    return action.preferenceAction.enabled ? 'Turning that on ~' : 'Turning that off ~';
  }

  if (action.guestbookSubmit) {
    return 'Pinning that guestbook note ~';
  }

  if (action.openUrls?.length) {
    const option = OPEN_LINK_OPTIONS_BY_URL.get(action.openUrls[0]);
    return option?.fallbackReply ?? 'Opening that link for you ~';
  }

  return null;
}

/**
 * Get followup action labels for suggestion chips.
 * Light / dark / toggle theme actions are excluded (UI already exposes those
 * via the theme toggle), but disco enter/exit actions are allowed through so
 * chat can surface a state-aware hardcoded disco chip.
 */
export function getFollowupActions(): string[] {
  return ACTION_REGISTRY
    .filter(a => !a.themeAction || a.themeAction === 'disco' || a.themeAction === 'disco-off')
    .map(a => a.label);
}

export interface DiscoSuggestionOptions {
  discoActive?: boolean;
  exclude?: readonly string[];
  lastUserText?: string;
}

function normalizeSuggestionText(text: string): string {
  return text.trim().toLowerCase();
}

export function getInitialChatSuggestions(discoActive = false): { base: string[]; extra: string[] } {
  if (discoActive) {
    return {
      base: [INITIAL_SUGGESTIONS[0], DISCO_EXIT_ACTION_LABEL],
      extra: INITIAL_SUGGESTIONS.slice(1),
    };
  }

  return {
    base: [INITIAL_SUGGESTIONS[0], DISCO_ACTION_LABEL],
    extra: INITIAL_SUGGESTIONS.slice(1).filter(suggestion => suggestion !== DISCO_EXPLAINER_LABEL),
  };
}

export function getPromotedFollowupActions(
  actions: readonly string[],
  options: DiscoSuggestionOptions = {},
): string[] {
  const excluded = new Set(options.exclude?.map(normalizeSuggestionText) ?? []);
  const lastUserText = options.lastUserText ? normalizeSuggestionText(options.lastUserText) : '';
  if (lastUserText) excluded.add(lastUserText);

  const candidates = actions.filter(action => {
    if (excluded.has(normalizeSuggestionText(action))) return false;
    if (options.discoActive && action === DISCO_ACTION_LABEL) return false;
    if (!options.discoActive && action === DISCO_EXIT_ACTION_LABEL) return false;
    return true;
  });

  if (options.discoActive && candidates.includes(DISCO_EXIT_ACTION_LABEL)) {
    return [DISCO_EXIT_ACTION_LABEL, ...candidates.filter(action => action !== DISCO_EXIT_ACTION_LABEL)];
  }

  if (!options.discoActive && candidates.includes(DISCO_ACTION_LABEL)) {
    return [DISCO_ACTION_LABEL, ...candidates.filter(action => action !== DISCO_ACTION_LABEL)];
  }

  return candidates;
}

/** Conversational followup suggestions (not actions — sent to LLM) */
export const FOLLOWUP_CONVERSATIONAL = [
  "What projects have you worked on?",
  "How does Cropio work?",
  "Tell me about your time at IIIT Delhi",
  "What's your favorite language?",
  "How did you get into competitive programming?",
  "What do you enjoy most about your work?",
  "Tell me about your research",
  "What are your hobbies?",
  "Tell me about your PC build",
  "What games do you play?",
  DISCO_EXPLAINER_LABEL,
] as const;

/** Initial suggestions shown before any conversation */
export const INITIAL_SUGGESTIONS = [
  "Tell me about your AI work",
  "What's your tech stack?",
  "Tell me about Jarvis",
  DISCO_EXPLAINER_LABEL,
  "What's the Escape the Matrix puzzle?",
  "Report a bug",
  'Open command palette',
] as const;
