// lib/actions.ts — Chat action metadata and follow-up suggestions
import { PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';

export interface ActionExecution {
  navigateTo?: string;
  themeAction?: 'dark' | 'light' | 'toggle';
  openUrls?: string[];
  feedbackAction?: boolean;
  projectSlug?: ProjectSlug;
}

/** Action metadata for suggestion chips and prompt documentation. */
export interface ActionDef {
  label: string;
  navigateTo?: string;
  themeAction?: 'dark' | 'light' | 'toggle';
  openUrls?: string[];
  feedbackAction?: boolean;
  projectSlug?: ProjectSlug;
}

export const VALID_NAVIGATION_PATHS = ['/', '/about', '/projects', '/resume', '/chat'] as const;
export const VALID_THEME_ACTIONS = ['dark', 'light', 'toggle'] as const;

type NavigationPath = (typeof VALID_NAVIGATION_PATHS)[number];
type ThemeAction = (typeof VALID_THEME_ACTIONS)[number];

const NAVIGATION_PATH_SET = new Set<string>(VALID_NAVIGATION_PATHS);
const THEME_ACTION_SET = new Set<string>(VALID_THEME_ACTIONS);

const NAVIGATION_REPLIES: Record<NavigationPath, string> = {
  '/': 'Taking you back to the home page ~',
  '/about': 'Opening the about page ~',
  '/projects': 'Taking you to the projects page ~',
  '/resume': 'Opening the resume page ~',
  '/chat': 'Bringing you back to the chat page ~',
};

const THEME_REPLIES: Record<ThemeAction, string> = {
  dark: 'Switching to dark mode ~',
  light: 'Switching to light mode ~',
  toggle: 'Toggling the theme ~',
};

const OPEN_LINK_TOOL_OPTIONS = [
  { key: 'github', url: PERSONAL_LINKS.github, fallbackReply: 'Opening GitHub for you ~' },
  { key: 'linkedin', url: PERSONAL_LINKS.linkedin, fallbackReply: 'Opening LinkedIn for you ~' },
  { key: 'codeforces', url: PERSONAL_LINKS.codeforces, fallbackReply: 'Opening Codeforces for you ~' },
  { key: 'cphistory', url: PERSONAL_LINKS.cpHistory, fallbackReply: 'Opening CP history for you ~' },
  { key: 'email', url: PERSONAL_LINKS.email, fallbackReply: 'Opening email ~' },
  { key: 'phone', url: PERSONAL_LINKS.phone, fallbackReply: 'Opening the phone shortcut ~' },
  { key: 'resume', url: PERSONAL_LINKS.resume, fallbackReply: 'Opening the resume PDF ~' },
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
    label: 'Show me your portfolio',
    navigateTo: '/projects',
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
    label: 'Take me to the projects page',
    navigateTo: '/projects',
  },
  {
    label: 'Open the Cropio repo',
    openUrls: [PROJECT_LINKS.cropio],
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
    label: 'Open your LinkedIn',
    openUrls: [PERSONAL_LINKS.linkedin],
  },
  {
    label: 'Show your Codeforces profile',
    openUrls: [PERSONAL_LINKS.codeforces],
  },
  {
    label: 'Report a bug',
    feedbackAction: true,
  },
];

export function hasActionExecution(action: ActionExecution | null | undefined): action is ActionExecution {
  return !!(
    action &&
    (action.navigateTo ||
      action.themeAction ||
      action.feedbackAction ||
      action.projectSlug ||
      (action.openUrls && action.openUrls.length > 0))
  );
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

  if (action.openUrls?.length) {
    const option = OPEN_LINK_OPTIONS_BY_URL.get(action.openUrls[0]);
    return option?.fallbackReply ?? 'Opening that link for you ~';
  }

  return null;
}

/**
 * Get followup action labels for suggestion chips.
 * Theme actions are intentionally excluded to keep suggestions stable.
 */
export function getFollowupActions(): string[] {
  return ACTION_REGISTRY
    .filter(a => !a.themeAction)
    .map(a => a.label);
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
] as const;

/** Initial suggestions shown before any conversation */
export const INITIAL_SUGGESTIONS = [
  "What do you work on at Microsoft?",
  "What's your tech stack?",
  "Tell me about Cropio",
  "Report a bug",
] as const;
