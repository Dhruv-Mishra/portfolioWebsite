// lib/actions.ts — Unified action registry for chat suggestions
import { PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';

/** Action metadata for pre-built responses that bypass the LLM  */
export interface ActionDef {
  /** Display label (used as suggestion text and exact-match key) */
  label: string;
  /** Action verbs for auto-generated fuzzy matching regex */
  verbs: string[];
  /** Keywords for auto-generated fuzzy matching regex */
  keywords: string[];
  /** Pre-built assistant response text */
  response: string;
  /** Page path to navigate to */
  navigateTo?: string;
  /** Theme switch action */
  themeAction?: 'dark' | 'light' | 'toggle';
  /** URLs to open in new tabs */
  openUrls?: string[];
  /** Open feedback modal */
  feedbackAction?: boolean;
  /** Only show as followup when theme matches (omit = always show) */
  showWhen?: 'dark' | 'light';
}

/**
 * Central action registry — single source of truth for all chat actions.
 * Defines label, response, side-effect metadata, fuzzy matching config,
 * and theme-conditional visibility.
 */
export const ACTION_REGISTRY: ActionDef[] = [
  {
    label: 'Switch to dark mode',
    verbs: ['switch', 'change', 'enable'],
    keywords: ['dark\\s*mode'],
    response: 'Switching to dark mode for you ~',
    themeAction: 'dark',
    showWhen: 'light',
  },
  {
    label: 'Switch to light mode',
    verbs: ['switch', 'change', 'enable'],
    keywords: ['light\\s*mode'],
    response: 'Switching to light mode for you ~',
    showWhen: 'dark',
    themeAction: 'light',
  },
  {
    label: 'Toggle the theme',
    verbs: ['toggle'],
    keywords: ['theme'],
    response: 'Toggling the theme ~',
    themeAction: 'toggle',
    showWhen: 'light',
  },
  {
    label: 'Take me to the projects page',
    verbs: ['go', 'take', 'navigate', 'visit'],
    keywords: ['projects?\\s*page'],
    response: 'Here are my projects!',
    navigateTo: '/projects',
  },
  {
    label: 'Open your GitHub profile',
    verbs: ['open', 'show', 'view', 'see'],
    keywords: ['github'],
    response: 'Opening GitHub for you ~',
    openUrls: [PERSONAL_LINKS.github],
  },
  {
    label: 'Show me your resume PDF',
    verbs: ['open', 'show', 'view', 'see'],
    keywords: ['resume'],
    response: "Here's my resume!",
    openUrls: [PERSONAL_LINKS.resume],
  },
  {
    label: 'Open the Fluent UI repo',
    verbs: ['open', 'show', 'view', 'see'],
    keywords: ['fluent\\s*ui'],
    response: 'Opening the Fluent UI Android repo ~',
    openUrls: [PROJECT_LINKS.fluentui],
  },
  {
    label: 'Open your LinkedIn',
    verbs: ['open', 'show', 'view', 'see'],
    keywords: ['linkedin'],
    response: 'Opening LinkedIn for you ~',
    openUrls: [PERSONAL_LINKS.linkedin],
  },
  {
    label: 'Show your Codeforces profile',
    verbs: ['open', 'show', 'view', 'see'],
    keywords: ['codeforces'],
    response: 'Opening Codeforces for you ~',
    openUrls: [PERSONAL_LINKS.codeforces],
  },
  {
    label: 'Report a bug',
    verbs: ['report', 'submit', 'send'],
    keywords: ['bug', 'feedback'],
    response: 'Opening the feedback form for you ~',
    feedbackAction: true,
  },
];

// ─── Auto-generated regex matchers from verbs × keywords ───
const _compiledMatchers: [RegExp, string][] = ACTION_REGISTRY.map(action => {
  const verbPattern = action.verbs.join('|');
  const keywordPattern = action.keywords.join('|');
  const regex = new RegExp(`\\b(${verbPattern})\\b.*\\b(${keywordPattern})\\b`, 'i');
  return [regex, action.label];
});

// ─── Label → action lookup map (built once) ───
const _actionByLabel = new Map<string, ActionDef>(
  ACTION_REGISTRY.map(a => [a.label.toLowerCase(), a])
);

/**
 * Resolve free-text to a known action.
 * Phase 1: exact match (case-insensitive) against action labels.
 * Phase 2: regex match using auto-generated verb×keyword patterns.
 * Returns the ActionDef if matched, null otherwise.
 */
export function resolveAction(text: string): ActionDef | null {
  // Phase 1: exact match
  const exact = _actionByLabel.get(text.toLowerCase());
  if (exact) return exact;
  // Phase 2: fuzzy match
  for (const [pattern, label] of _compiledMatchers) {
    if (pattern.test(text)) {
      return _actionByLabel.get(label.toLowerCase()) ?? null;
    }
  }
  return null;
}

/**
 * Get followup action labels filtered by current theme.
 * Omits theme-switching actions that don't apply to the current theme.
 */
export function getFollowupActions(currentTheme: string | undefined): string[] {
  return ACTION_REGISTRY
    .filter(a => !a.showWhen || a.showWhen === currentTheme)
    .map(a => a.label);
}

/** Conversational followup suggestions (not actions — sent to LLM) */
export const FOLLOWUP_CONVERSATIONAL = [
  "What projects have you worked on?",
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
  "Toggle the theme",
  "Report a bug",
] as const;
