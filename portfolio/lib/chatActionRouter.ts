import { ACTION_REGISTRY, getActionFallbackReply, type ActionDef, type ActionExecution, VALID_NAVIGATION_PATHS } from '@/lib/actions';
import { getProjectFactText } from '@/lib/dhruvFacts.server';
import { PERSONAL_LINKS, PROJECT_LINKS } from '@/lib/links';
import { PROJECT_ACTIONS, type ProjectSlug } from '@/lib/projectCatalog';

interface ActionResolution {
  kind: 'action';
  action: ActionExecution;
  reply: string;
}

interface ProjectInfoResolution {
  kind: 'project-info';
  projectSlug: ProjectSlug;
  reply: string;
}

export type ChatIntentResolution = ActionResolution | ProjectInfoResolution;

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
];

const NEGATION_PATTERNS = [/\bdon't\b/i, /\bdo not\b/i, /\bnot now\b/i, /\bdont\b/i] as const;
const ACTION_VERB_PATTERN = /\b(open|show|view|pull up|bring up|take me to|go to|navigate to|visit|switch|toggle|set|turn on|turn it|make it|report|send|leave)\b/i;
const PROJECT_ACTION_VERB_PATTERN = /\b(open|show|view|pull up|bring up)\b/i;
const NAVIGATION_VERB_PATTERN = /\b(go to|take me to|navigate to|bring me to|open)\b/i;
const LINK_VERB_PATTERN = /\b(open|visit|show|take me to|go to|pull up)\b/i;
const THEME_VERB_PATTERN = /\b(switch|toggle|set|make it|turn on|change)\b/i;
const FEEDBACK_VERB_PATTERN = /\b(report|give|send|leave|open)\b/i;

const ROUTE_ALIASES: Array<{ path: (typeof VALID_NAVIGATION_PATHS)[number]; pattern: RegExp }> = [
  { path: '/', pattern: /\b(home|homepage|main page|start page|landing page)\b/i },
  { path: '/about', pattern: /\b(about|about page|about you)\b/i },
  { path: '/projects', pattern: /\b(projects|projects page|portfolio page|work page|your portfolio)\b/i },
  { path: '/resume', pattern: /\b(resume|cv|resume page)\b/i },
  { path: '/chat', pattern: /\b(chat|chat page|notes|note page)\b/i },
];

const LINK_TARGETS: Array<{ pattern: RegExp; action: ActionExecution }> = [
  { pattern: /\bgithub(?: profile)?\b/i, action: { openUrls: [PERSONAL_LINKS.github] } },
  { pattern: /\blinkedin\b/i, action: { openUrls: [PERSONAL_LINKS.linkedin] } },
  { pattern: /\bcodeforces\b/i, action: { openUrls: [PERSONAL_LINKS.codeforces] } },
  { pattern: /\bcp history\b|\bcode jam\b/i, action: { openUrls: [PERSONAL_LINKS.cpHistory] } },
  { pattern: /\bresume(?: pdf)?\b/i, action: { openUrls: [PERSONAL_LINKS.resume] } },
  { pattern: /\bemail\b/i, action: { openUrls: [PERSONAL_LINKS.email] } },
  { pattern: /\bphone\b|\bcall\b|\bnumber\b/i, action: { openUrls: [PERSONAL_LINKS.phone] } },
];

const PROJECT_REPO_TARGETS: Partial<Record<ProjectSlug, string>> = {
  'fluent-ui-android': PROJECT_LINKS.fluentui,
  'course-evaluator': PROJECT_LINKS.courseEvaluator,
  'ivc-vital-checkup': PROJECT_LINKS.ivc,
  'personal-portfolio': PROJECT_LINKS.portfolio,
  'cropio': PROJECT_LINKS.cropio,
  'hybrid-recommender': PROJECT_LINKS.recommender,
  'bloom-filter-research': PROJECT_LINKS.bloomfilter,
  'atomvault': PROJECT_LINKS.atomvault,
};

const EXACT_ACTION_LABELS = new Map(
  ACTION_REGISTRY.map(action => [normalizeInput(action.label), action])
);

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[“”'"`]/g, '')
    .replace(/[^a-z0-9+:/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesNegation(input: string): boolean {
  return NEGATION_PATTERNS.some(pattern => pattern.test(input));
}

function isExplanationRequest(input: string): boolean {
  return EXPLANATION_PATTERNS.some(pattern => pattern.test(input));
}

function findProjectMention(input: string): ProjectSlug | null {
  const matches = PROJECT_ACTIONS.filter(project =>
    project.keywords.some(keyword => new RegExp(keyword, 'i').test(input)),
  );

  if (matches.length !== 1) {
    return null;
  }

  return matches[0].slug;
}

function toActionExecution(action: ActionDef): ActionExecution {
  return {
    navigateTo: action.navigateTo,
    themeAction: action.themeAction,
    openUrls: action.openUrls,
    feedbackAction: action.feedbackAction,
    projectSlug: action.projectSlug,
  };
}

function resolveExactActionLabel(input: string): ActionResolution | null {
  const actionDef = EXACT_ACTION_LABELS.get(input);
  if (!actionDef) {
    return null;
  }

  const action = toActionExecution(actionDef);
  return {
    kind: 'action',
    action,
    reply: getActionFallbackReply(action) ?? 'On it ~',
  };
}

function resolveProjectAction(input: string, projectSlug: ProjectSlug): ActionResolution | null {
  if (!PROJECT_ACTION_VERB_PATTERN.test(input)) {
    return null;
  }

  if (/\b(repo|repository|github|source|code|link)\b/i.test(input)) {
    const repoUrl = PROJECT_REPO_TARGETS[projectSlug];
    if (!repoUrl) {
      return null;
    }

    const action: ActionExecution = { openUrls: [repoUrl] };
    return {
      kind: 'action',
      action,
      reply: getActionFallbackReply(action) ?? 'Opening that repo for you ~',
    };
  }

  const action: ActionExecution = { projectSlug };
  return {
    kind: 'action',
    action,
    reply: getActionFallbackReply(action) ?? 'Opening that project right here ~',
  };
}

function resolveProjectInfo(input: string, projectSlug: ProjectSlug): ProjectInfoResolution | null {
  if (!isExplanationRequest(input)) {
    return null;
  }

  const reply = getProjectFactText(projectSlug);
  if (!reply) {
    return null;
  }

  return {
    kind: 'project-info',
    projectSlug,
    reply,
  };
}

function resolveNavigation(input: string): ActionResolution | null {
  if (!NAVIGATION_VERB_PATTERN.test(input) || isExplanationRequest(input)) {
    return null;
  }

  const matches = ROUTE_ALIASES.filter(route => route.pattern.test(input));
  if (matches.length !== 1) {
    return null;
  }

  const action: ActionExecution = { navigateTo: matches[0].path };
  return {
    kind: 'action',
    action,
    reply: getActionFallbackReply(action) ?? 'Taking you there ~',
  };
}

function resolveTheme(input: string): ActionResolution | null {
  if (!THEME_VERB_PATTERN.test(input)) {
    return null;
  }

  if (/\bdark(?: mode)?\b/i.test(input)) {
    const action: ActionExecution = { themeAction: 'dark' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Switching to dark mode ~' };
  }

  if (/\blight(?: mode)?\b/i.test(input)) {
    const action: ActionExecution = { themeAction: 'light' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Switching to light mode ~' };
  }

  if (/\btheme\b/i.test(input) && /\btoggle\b/i.test(input)) {
    const action: ActionExecution = { themeAction: 'toggle' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Toggling the theme ~' };
  }

  return null;
}

function resolveFeedback(input: string): ActionResolution | null {
  if (!FEEDBACK_VERB_PATTERN.test(input)) {
    return null;
  }

  if (!/\b(feedback|bug|issue|report)\b/i.test(input)) {
    return null;
  }

  const action: ActionExecution = { feedbackAction: true };
  return {
    kind: 'action',
    action,
    reply: getActionFallbackReply(action) ?? 'Opening the feedback note ~',
  };
}

function resolveKnownLink(input: string): ActionResolution | null {
  if (!LINK_VERB_PATTERN.test(input) || isExplanationRequest(input)) {
    return null;
  }

  const projectSlug = findProjectMention(input);
  if (projectSlug && /\b(repo|repository|github|source|code|link)\b/i.test(input)) {
    return resolveProjectAction(input, projectSlug);
  }

  const matches = LINK_TARGETS.filter(target => target.pattern.test(input));
  if (matches.length !== 1) {
    return null;
  }

  return {
    kind: 'action',
    action: matches[0].action,
    reply: getActionFallbackReply(matches[0].action) ?? 'Opening that link for you ~',
  };
}

export function resolveChatIntent(input: string): ChatIntentResolution | null {
  const normalized = normalizeInput(input);
  if (!normalized || includesNegation(normalized)) {
    return null;
  }

  const exactAction = resolveExactActionLabel(normalized);
  if (exactAction) {
    return exactAction;
  }

  const projectSlug = findProjectMention(normalized);

  if (projectSlug && !isExplanationRequest(normalized)) {
    const projectAction = resolveProjectAction(normalized, projectSlug);
    if (projectAction) {
      return projectAction;
    }
  }

  const navigation = resolveNavigation(normalized);
  if (navigation) {
    return navigation;
  }

  const theme = resolveTheme(normalized);
  if (theme) {
    return theme;
  }

  const feedback = resolveFeedback(normalized);
  if (feedback) {
    return feedback;
  }

  const knownLink = resolveKnownLink(normalized);
  if (knownLink) {
    return knownLink;
  }

  if (projectSlug) {
    const projectInfo = resolveProjectInfo(normalized, projectSlug);
    if (projectInfo) {
      return projectInfo;
    }
  }

  if (!ACTION_VERB_PATTERN.test(normalized)) {
    return null;
  }

  return null;
}