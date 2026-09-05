import { getActionFallbackReply, resolveExactActionLabel as resolveExactActionExecution, type ActionExecution, VALID_NAVIGATION_PATHS } from '@/lib/actions';
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
const ACTION_VERB_PATTERN = /\b(open|show|view|pull up|bring up|take me to|go to|navigate to|visit|switch|toggle|set|turn on|turn it|make it|report|send|leave|start|enter|talk|speak)\b/i;
const PROJECT_ACTION_VERB_PATTERN = /\b(open|show|view|pull up|bring up)\b/i;
const NAVIGATION_VERB_PATTERN = /\b(go to|take me to|navigate to|bring me to|open)\b/i;
const HOME_SHORTCUT_PATTERN = /\b(take me home|go home|head home|bring me home|back home|back to home)\b/i;
const LINK_REQUEST_PATTERN = /\b(open|visit|show|take me to|go to|pull up|bring up|see|find|can i see|whats\s+your|what\s+is\s+your|wheres\s+your|where\s+is\s+your)\b/i;
const FEEDBACK_PHRASE_PATTERN = /\b(report|file|submit|send|leave|give|log)\s+(?:a|an|the|some|me\s+a|in\s+a)?\s*(bug|issue|feedback|problem|error|complaint)\b/i;
const ACTION_CHAIN_SEPARATOR_PATTERN = /\s*(?:,\s*(?:then\s*)?|\b(?:and then|then|also|and)\b)\s*/i;
const MAX_CHAIN_EFFECTS = 3;
const MAX_CHAIN_URLS = 2;

const ROUTE_ALIASES: Array<{ path: (typeof VALID_NAVIGATION_PATHS)[number]; pattern: RegExp }> = [
  { path: '/', pattern: /\b(home|homepage|main page|start page|landing page)\b/i },
  { path: '/about', pattern: /\b(about|about page|about you|experience timeline|career timeline|work timeline)\b/i },
  { path: '/projects', pattern: /\b(projects|projects page|portfolio page|work page|your portfolio)\b/i },
  { path: '/resume', pattern: /\b(resume|cv|resume page)\b/i },
  { path: '/chat', pattern: /\b(chat|chat page|notes|note page)\b/i },
  { path: '/guestbook', pattern: /\b(guestbook|guest book)\b/i },
  { path: '/stickers', pattern: /\b(stickers?|sticker collection)\b/i },
  { path: '/settings', pattern: /\b(settings?|chat settings)\b/i },
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
  'jarvis-voice-agent': PROJECT_LINKS.jarvis,
  'fluent-ui-android': PROJECT_LINKS.fluentui,
  'course-evaluator': PROJECT_LINKS.courseEvaluator,
  'ivc-vital-checkup': PROJECT_LINKS.ivc,
  'personal-portfolio': PROJECT_LINKS.portfolio,
  'cropio': PROJECT_LINKS.cropio,
  'hybrid-recommender': PROJECT_LINKS.recommender,
  'bloom-filter-research': PROJECT_LINKS.bloomfilter,
  'atomvault': PROJECT_LINKS.atomvault,
};

const PROJECT_ALIAS_TOKENS: Array<{ slug: ProjectSlug; aliases: string[] }> = [
  { slug: 'jarvis-voice-agent', aliases: ['jarvis', 'voice agent', 'audio agent', 'audio controlled agentic website', 'agentic website'] },
  { slug: 'fluent-ui-android', aliases: ['fluent ui android', 'fluent ui', 'microsoft 365'] },
  { slug: 'course-evaluator', aliases: ['course evaluator', 'course similarity evaluator'] },
  { slug: 'ivc-vital-checkup', aliases: ['ivc', 'instant vital checkup', 'vital checkup'] },
  { slug: 'personal-portfolio', aliases: ['portfolio project', 'website project', 'this site', 'portfolio'] },
  { slug: 'cropio', aliases: ['cropio', 'ai cropper', 'portrait cropper'] },
  { slug: 'hybrid-recommender', aliases: ['hybrid recommender', 'movie recommender'] },
  { slug: 'bloom-filter-research', aliases: ['bloom filter research', 'bloom filter'] },
  { slug: 'atomvault', aliases: ['atomvault', 'atom vault'] },
];

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[“”'"`]/g, '')
    .replace(/[^a-z0-9+:/,\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesNegation(input: string): boolean {
  return NEGATION_PATTERNS.some(pattern => pattern.test(input));
}

function isExplanationRequest(input: string): boolean {
  return EXPLANATION_PATTERNS.some(pattern => pattern.test(input));
}

function collapseToken(input: string): string {
  return input.replace(/[^a-z0-9]/g, '');
}

function stripRoutingWords(input: string): string {
  return input
    .replace(/\b(show|open|view|pull up|bring up|take me to|go to|navigate to|visit|tell me about|what does|what is|how does|how do|compare|explain|details on|more about|overview of|the|me|your|please)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEditDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    for (let column = 0; column < current.length; column++) {
      previous[column] = current[column];
    }
  }

  return previous[right.length];
}

function findProjectMention(input: string): ProjectSlug | null {
  const matches = PROJECT_ACTIONS.filter(project =>
    project.keywords.some(keyword => new RegExp(keyword, 'i').test(input)),
  );

  if (matches.length !== 1) {
    const candidate = collapseToken(stripRoutingWords(input));
    if (!candidate) {
      return null;
    }

    const fuzzyMatches = PROJECT_ALIAS_TOKENS
      .map(project => ({
        slug: project.slug,
        bestDistance: Math.min(
          ...project.aliases.map(alias => getEditDistance(candidate, collapseToken(alias))),
        ),
      }))
      .filter(project => project.bestDistance <= 2)
      .sort((left, right) => left.bestDistance - right.bestDistance);

    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0].slug;
    }

    if (fuzzyMatches.length > 1 && fuzzyMatches[0].bestDistance < fuzzyMatches[1].bestDistance) {
      return fuzzyMatches[0].slug;
    }

    return null;
  }

  return matches[0].slug;
}

function resolveExactActionLabel(input: string): ActionResolution | null {
  const action = resolveExactActionExecution(input);
  if (!action) {
    return null;
  }

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
  if (isExplanationRequest(input)) {
    return null;
  }

  if (HOME_SHORTCUT_PATTERN.test(input)) {
    const action: ActionExecution = { navigateTo: '/' };
    return {
      kind: 'action',
      action,
      reply: getActionFallbackReply(action) ?? 'Taking you home ~',
    };
  }

  const matches = ROUTE_ALIASES.filter(route => route.pattern.test(input));
  if (matches.length !== 1) {
    return null;
  }

  const hasNavVerb = NAVIGATION_VERB_PATTERN.test(input);
  const tokenCount = input.split(/\s+/).filter(Boolean).length;
  const isShortPageRequest = tokenCount <= 4 && /\bpage\b/i.test(input);

  if (!hasNavVerb && !isShortPageRequest) {
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
  const isDiscoOffRequest =
    /\b(?:turn|switch|shut|take)\s+off\s+(?:the\s+)?disco(?:\s+mode)?\b/i.test(input) ||
    /\b(?:turn|switch|shut)\s+(?:the\s+)?disco(?:\s+mode)?\s+off\b/i.test(input) ||
    /\b(?:exit|leave|stop|disable|end|close|cancel)\s+(?:the\s+)?disco(?:\s+mode)?\b/i.test(input) ||
    /\bno\s+more\s+disco(?:\s+mode)?\b/i.test(input) ||
    /\bdisco(?:\s+mode)?\s+(?:off|stop|disabled?|exit)\b/i.test(input);

  if (isDiscoOffRequest) {
    const action: ActionExecution = { themeAction: 'disco-off' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Exiting disco mode ~' };
  }

  const isDiscoOnRequest =
    /\b(?:turn|switch)\s+on\s+(?:the\s+)?disco(?:\s+mode)?\b/i.test(input) ||
    /\b(?:turn|switch)\s+(?:the\s+)?disco(?:\s+mode)?\s+on\b/i.test(input) ||
    /\bswitch\s+to\s+(?:the\s+)?disco(?:\s+mode)?\b/i.test(input) ||
    /\b(?:engage|start|enable)\s+(?:the\s+)?disco(?:\s+mode)?\b/i.test(input) ||
    /\bdisco(?:\s+mode)?\s+(?:on|start|enabled?)\b/i.test(input);

  if (isDiscoOnRequest) {
    const action: ActionExecution = { themeAction: 'disco' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Engaging disco mode ~' };
  }

  if (/\btoggle\b/i.test(input) && /\btheme\b/i.test(input)) {
    const action: ActionExecution = { themeAction: 'toggle' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Toggling the theme ~' };
  }

  const isDarkRequest = /\bdark\s+(?:mode|theme)\b/i.test(input) || /\bgo(?:ing)?\s+dark\b/i.test(input);
  if (isDarkRequest) {
    const action: ActionExecution = { themeAction: 'dark' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Switching to dark mode ~' };
  }

  const isLightRequest = /\blight\s+(?:mode|theme)\b/i.test(input) || /\bgo(?:ing)?\s+light\b/i.test(input);
  if (isLightRequest) {
    const action: ActionExecution = { themeAction: 'light' };
    return { kind: 'action', action, reply: getActionFallbackReply(action) ?? 'Switching to light mode ~' };
  }

  return null;
}

function resolveVoiceSession(input: string): ActionResolution | null {
  if (!/\b(?:start|enter|open|switch to)\s+(?:the\s+)?(?:native\s+)?voice(?:\s+(?:mode|agent|session|experience))\b/i.test(input)) {
    return null;
  }

  const action: ActionExecution = { voiceSessionAction: true };
  return {
    kind: 'action',
    action,
    reply: getActionFallbackReply(action) ?? 'Switching to voice mode ~',
  };
}

function resolveFeedback(input: string): ActionResolution | null {
  if (!FEEDBACK_PHRASE_PATTERN.test(input)) {
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
  if (!LINK_REQUEST_PATTERN.test(input)) {
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

function resolveSingleChatIntent(normalized: string): ChatIntentResolution | null {
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

  const voiceSession = resolveVoiceSession(normalized);
  if (voiceSession) {
    return voiceSession;
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

function getChainActionVerb(input: string): string | null {
  return input.match(ACTION_VERB_PATTERN)?.[0] ?? null;
}

function isShortChainClause(input: string): boolean {
  return input.split(/\s+/).filter(Boolean).length <= 4;
}

function countActionEffects(action: ActionExecution): number {
  return Number(Boolean(action.navigateTo)) +
    Number(Boolean(action.themeAction)) +
    Number(Boolean(action.feedbackAction)) +
    Number(Boolean(action.projectSlug)) +
    Number(Boolean(action.voiceSessionAction)) +
    Number(Boolean(action.fieldFill)) +
    Number(Boolean(action.preferenceAction)) +
    Number(Boolean(action.guestbookSubmit)) +
    (action.openUrls?.length ?? 0);
}

function mergeChainActions(current: ActionExecution, next: ActionExecution): ActionExecution | null {
  if (
    (current.navigateTo && next.navigateTo) ||
    (current.themeAction && next.themeAction) ||
    (current.projectSlug && next.projectSlug)
  ) {
    return null;
  }

  const navigationWithInPageAction =
    Boolean(current.navigateTo || next.navigateTo) &&
    Boolean(
      current.feedbackAction ||
      next.feedbackAction ||
      current.projectSlug ||
      next.projectSlug ||
      current.voiceSessionAction ||
      next.voiceSessionAction ||
      current.fieldFill ||
      next.fieldFill ||
      current.guestbookSubmit ||
      next.guestbookSubmit,
    );
  if (navigationWithInPageAction) {
    return null;
  }

  const transientSurfaceCount = Number(Boolean(current.feedbackAction || next.feedbackAction)) +
    Number(Boolean(current.projectSlug || next.projectSlug)) +
    Number(Boolean(current.voiceSessionAction || next.voiceSessionAction)) +
    Number(Boolean(current.fieldFill || next.fieldFill)) +
    Number(Boolean(current.guestbookSubmit || next.guestbookSubmit));
  if (transientSurfaceCount > 1) {
    return null;
  }

  if ((current.fieldFill && next.fieldFill) || (current.preferenceAction && next.preferenceAction) || (current.guestbookSubmit && next.guestbookSubmit)) {
    return null;
  }

  const openUrls = [...new Set([...(current.openUrls ?? []), ...(next.openUrls ?? [])])];
  if (openUrls.length > MAX_CHAIN_URLS) {
    return null;
  }

  const merged: ActionExecution = {
    navigateTo: current.navigateTo ?? next.navigateTo,
    themeAction: current.themeAction ?? next.themeAction,
    openUrls: openUrls.length ? openUrls : undefined,
    feedbackAction: current.feedbackAction || next.feedbackAction || undefined,
    projectSlug: current.projectSlug ?? next.projectSlug,
    voiceSessionAction: current.voiceSessionAction || next.voiceSessionAction || undefined,
    fieldFill: current.fieldFill ?? next.fieldFill,
    preferenceAction: current.preferenceAction ?? next.preferenceAction,
    guestbookSubmit: current.guestbookSubmit ?? next.guestbookSubmit,
  };

  return countActionEffects(merged) <= MAX_CHAIN_EFFECTS ? merged : null;
}

function resolveActionChain(input: string): ActionResolution | null | undefined {
  const clauses = input.split(ACTION_CHAIN_SEPARATOR_PATTERN).map(clause => clause.trim());
  if (clauses.length === 1) {
    return undefined;
  }

  let mergedAction: ActionExecution | null = null;
  let inheritedVerb: string | null = null;

  for (const clause of clauses) {
    if (!clause || includesNegation(clause) || isExplanationRequest(clause)) {
      return null;
    }

    let resolution = resolveSingleChatIntent(clause);
    if (!resolution && inheritedVerb && isShortChainClause(clause)) {
      resolution = resolveSingleChatIntent(`${inheritedVerb} ${clause}`);
    }

    if (!resolution || resolution.kind !== 'action') {
      return null;
    }

    inheritedVerb ??= getChainActionVerb(clause);
    mergedAction = mergedAction ? mergeChainActions(mergedAction, resolution.action) : resolution.action;
    if (!mergedAction || countActionEffects(mergedAction) > MAX_CHAIN_EFFECTS) {
      return null;
    }
  }

  if (!mergedAction) {
    return null;
  }

  return {
    kind: 'action',
    action: mergedAction,
    reply: 'Taking care of that ~',
  };
}

export function resolveChatIntent(input: string): ChatIntentResolution | null {
  const normalized = normalizeInput(input);
  if (!normalized || includesNegation(normalized)) {
    return null;
  }

  const chainedAction = resolveActionChain(normalized);
  if (chainedAction !== undefined) {
    return chainedAction;
  }

  return resolveSingleChatIntent(normalized);
}