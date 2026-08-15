import { VALID_NAVIGATION_PATHS, VALID_THEME_ACTIONS } from '@/lib/actions';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';
import {
  PROJECT_VIDEO_ACTIONS,
  VOICE_SAFE_TERMINAL_COMMANDS,
  type ProjectVideoAction,
  type SiteToolCall,
} from '@/lib/siteTools';
import { parseSiteToolCall } from '@/lib/siteToolValidation';

export type PlannedVoiceAction = SiteToolCall;

const MAX_PLANNED_ACTIONS = 3;

const CLAUSE_SEPARATOR = /\s*(?:,\s*(?:then\s*)?|\b(?:and then|then|also|and)\b)\s*/i;

const NEGATION_PATTERNS = [
  /\bdont\b/i,
  /\bdo not\b/i,
  /\bnot now\b/i,
  /\brather not\b/i,
  /\bcant\b/i,
  /\bcannot\b/i,
  /\bcouldnt\b/i,
  /\bcould not\b/i,
  /\bwont\b/i,
  /\bwould not\b/i,
  /\bwouldnt\b/i,
  /\bshouldnt\b/i,
  /\bshould not\b/i,
  /\bnever\b/i,
] as const;

const EXPLANATION_PATTERNS = [
  /\btell me about\b/i,
  /\bwhat is\b/i,
  /\bwhat does\b/i,
  /\bhow does\b/i,
  /\bhow do(?:es)?\b/i,
  /\bwhy\b/i,
  /\bcompare\b/i,
  /\bexplain\b/i,
  /\bdetails? on\b/i,
  /\bmore about\b/i,
  /\boverview of\b/i,
] as const;

const NAV_VERB = /\b(?:go\s+to|open|take\s+me(?:\s+to)?|navigate\s+to)\b/i;
const PROJECT_VERB = /\b(?:open|show)\b/i;
const HOME_PATTERN = /\b(?:home\s*page|homepage|home)\b/i;
const HOME_SHORTCUT = /\b(?:take me home|go home|head home|bring me home|back home|back to home)\b/i;

const PAGE_ALIASES: Array<{ path: (typeof VALID_NAVIGATION_PATHS)[number]; pattern: RegExp }> = [
  { path: '/about', pattern: /\babout(?:\s+page)?\b/i },
  { path: '/projects', pattern: /\bprojects?(?:\s+page)?\b/i },
  { path: '/resume', pattern: /\b(?:resume|cv)(?:\s+page)?\b/i },
  { path: '/chat', pattern: /\bchat(?:\s+page)?\b/i },
  { path: '/guestbook', pattern: /\bguest\s*book\b/i },
  { path: '/stickers', pattern: /\bstickers?\b/i },
  { path: '/settings', pattern: /\bsettings?\b/i },
];

const TERMINAL_COMMAND_PATTERN = new RegExp(
  `\\b(?:type|run|enter)\\s+(${VOICE_SAFE_TERMINAL_COMMANDS.join('|')})\\s+(?:in|into|on)\\s+(?:the\\s+)?terminal\\b`,
  'i',
);

const VIDEO_ACTION_PATTERN = new RegExp(
  `\\b(${PROJECT_VIDEO_ACTIONS.join('|')})\\b`,
  'i',
);

function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”‘’"'`]/g, '')
    .replace(/[^a-z0-9+\s,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesNegation(input: string): boolean {
  return NEGATION_PATTERNS.some(pattern => pattern.test(input));
}

function isExplanationRequest(input: string): boolean {
  return EXPLANATION_PATTERNS.some(pattern => pattern.test(input));
}

function splitClauses(input: string): string[] {
  return input.split(CLAUSE_SEPARATOR).map(part => part.trim()).filter(Boolean);
}

function plannedCall(id: string, name: SiteToolCall['name'], args: SiteToolCall['args']): PlannedVoiceAction | null {
  return parseSiteToolCall({ id, name, args });
}

function resolveTerminalCommand(clause: string): PlannedVoiceAction['args'] | null {
  const match = clause.match(TERMINAL_COMMAND_PATTERN);
  if (!match?.[1]) return null;
  const command = match[1].toLowerCase();
  if (!(VOICE_SAFE_TERMINAL_COMMANDS as readonly string[]).includes(command)) return null;
  return { command } as Extract<SiteToolCall, { name: 'run_terminal_command' }>['args'];
}

function resolveProjectSlug(clause: string): ProjectSlug | null {
  if (!PROJECT_VERB.test(clause)) return null;
  const matches = PROJECT_ACTIONS.filter(project =>
    project.keywords.some(keyword => new RegExp(keyword, 'i').test(clause)),
  );
  return matches.length === 1 ? matches[0].slug : null;
}

function resolvePreviewAction(clause: string): ProjectVideoAction | null {
  if (!/\b(?:preview|video)\b/i.test(clause)) return null;
  const match = clause.match(VIDEO_ACTION_PATTERN);
  if (!match?.[1]) return null;
  const action = match[1].toLowerCase();
  return (PROJECT_VIDEO_ACTIONS as readonly string[]).includes(action)
    ? action as ProjectVideoAction
    : null;
}

function resolveThemeAction(clause: string): (typeof VALID_THEME_ACTIONS)[number] | null {
  const isDiscoOff =
    /\b(?:turn|switch|shut|take)\s+off\s+(?:the\s+)?disco(?:\s+mode)?\b/i.test(clause)
    || /\b(?:turn|switch|shut)\s+(?:the\s+)?disco(?:\s+mode)?\s+off\b/i.test(clause)
    || /\b(?:exit|leave|stop|disable|end|close|cancel)\s+(?:the\s+)?disco(?:\s+mode)?\b/i.test(clause)
    || /\bno\s+more\s+disco(?:\s+mode)?\b/i.test(clause)
    || /\bdisco(?:\s+mode)?\s+(?:off|stop|disabled?|exit)\b/i.test(clause);
  if (isDiscoOff) return 'disco-off';

  if (/\bdisco(?:\s+mode)?\b/i.test(clause)) return 'disco';
  if (/\btoggle(?:\s+(?:the\s+)?theme)?\b/i.test(clause)) return 'toggle';

  const hasThemeCue = /\b(?:mode|theme)\b/i.test(clause)
    || /\b(?:go|switch|make|turn|set|flip)\b/i.test(clause);
  if (hasThemeCue && /\bdark\b/i.test(clause)) return 'dark';
  if (hasThemeCue && /\blight\b/i.test(clause)) return 'light';
  return null;
}

function resolveNavigationPath(clause: string): (typeof VALID_NAVIGATION_PATHS)[number] | null {
  if (HOME_SHORTCUT.test(clause) || HOME_PATTERN.test(clause)) return '/';
  if (!NAV_VERB.test(clause)) return null;
  const matches = PAGE_ALIASES.filter(route => route.pattern.test(clause));
  return matches.length === 1 ? matches[0].path : null;
}

function resolveClause(clause: string, id: string): PlannedVoiceAction | null {
  const terminal = resolveTerminalCommand(clause);
  if (terminal) return plannedCall(id, 'run_terminal_command', terminal);

  const slug = resolveProjectSlug(clause);
  if (slug) return plannedCall(id, 'open_project', { slug });

  const preview = resolvePreviewAction(clause);
  if (preview) return plannedCall(id, 'control_project_video', { action: preview });

  const theme = resolveThemeAction(clause);
  if (theme) return plannedCall(id, 'set_theme', { action: theme });

  const path = resolveNavigationPath(clause);
  if (path) return plannedCall(id, 'navigate_to', { path });

  return null;
}

export function planVoiceUtterance(text: string): PlannedVoiceAction[] {
  const normalized = normalizeUtterance(text);
  if (!normalized || includesNegation(normalized) || isExplanationRequest(normalized)) {
    return [];
  }

  const clauses = splitClauses(normalized);
  if (clauses.length === 0 || clauses.length > MAX_PLANNED_ACTIONS) return [];

  const planned: PlannedVoiceAction[] = [];
  for (const [index, clause] of clauses.entries()) {
    const action = resolveClause(clause, `plan-${index + 1}`);
    if (!action) return [];
    planned.push(action);
  }
  return planned;
}
