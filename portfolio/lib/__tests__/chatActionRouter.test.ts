import { describe, it, expect } from 'vitest';
import { resolveChatIntent, type ChatIntentResolution } from '@/lib/chatActionRouter';

type Expected =
  | { kind: 'null' }
  | { kind: 'action'; navigateTo?: string; themeAction?: string; feedbackAction?: boolean; projectSlug?: string; openUrlContains?: string }
  | { kind: 'project-info'; projectSlug: string };

function check(input: string, expected: Expected) {
  const result = resolveChatIntent(input);
  if (expected.kind === 'null') {
    expect(result, `"${input}" should not trigger an action`).toBeNull();
    return;
  }

  expect(result, `"${input}" should resolve`).not.toBeNull();
  const r = result as ChatIntentResolution;

  if (expected.kind === 'project-info') {
    expect(r.kind, `"${input}" kind`).toBe('project-info');
    if (r.kind === 'project-info') {
      expect(r.projectSlug).toBe(expected.projectSlug);
    }
    return;
  }

  expect(r.kind, `"${input}" kind`).toBe('action');
  if (r.kind !== 'action') return;

  if (expected.navigateTo !== undefined) {
    expect(r.action.navigateTo, `"${input}" navigateTo`).toBe(expected.navigateTo);
  }
  if (expected.themeAction !== undefined) {
    expect(r.action.themeAction, `"${input}" themeAction`).toBe(expected.themeAction);
  }
  if (expected.feedbackAction !== undefined) {
    expect(r.action.feedbackAction, `"${input}" feedbackAction`).toBe(expected.feedbackAction);
  }
  if (expected.projectSlug !== undefined) {
    expect(r.action.projectSlug, `"${input}" projectSlug`).toBe(expected.projectSlug);
  }
  if (expected.openUrlContains !== undefined) {
    const urls = r.action.openUrls ?? [];
    expect(
      urls.some(u => u.includes(expected.openUrlContains!)),
      `"${input}" openUrls should contain "${expected.openUrlContains}" (got ${JSON.stringify(urls)})`,
    ).toBe(true);
  }
}

describe('resolveChatIntent — exact action labels', () => {
  it('matches canonical labels verbatim', () => {
    check('Switch to dark mode', { kind: 'action', themeAction: 'dark' });
    check('Switch to light mode', { kind: 'action', themeAction: 'light' });
    check('Toggle the theme', { kind: 'action', themeAction: 'toggle' });
    check('Report a bug', { kind: 'action', feedbackAction: true });
    check('Show me your portfolio', { kind: 'action', navigateTo: '/projects' });
    check('Open your GitHub profile', { kind: 'action', openUrlContains: 'github.com/Dhruv-Mishra' });
  });
});

describe('resolveChatIntent — theme intents', () => {
  it('matches natural theme phrasings', () => {
    check('switch to dark mode', { kind: 'action', themeAction: 'dark' });
    check('make it dark mode', { kind: 'action', themeAction: 'dark' });
    check('turn on dark mode', { kind: 'action', themeAction: 'dark' });
    check('change to light mode', { kind: 'action', themeAction: 'light' });
    check('dark mode please', { kind: 'action', themeAction: 'dark' });
    check('light mode please', { kind: 'action', themeAction: 'light' });
    check('flip to dark mode', { kind: 'action', themeAction: 'dark' });
    check('go dark', { kind: 'action', themeAction: 'dark' });
    check('toggle the theme', { kind: 'action', themeAction: 'toggle' });
  });

  it('does NOT trigger on casual mentions of dark/light', () => {
    check('it is dark outside', { kind: 'null' });
    check('I love dark chocolate', { kind: 'null' });
    check('the lights are off', { kind: 'null' });
    check('make it a dark comedy', { kind: 'null' });
    check('turn on the kitchen lights', { kind: 'null' });
    check('a bright light appeared', { kind: 'null' });
  });
});

describe('resolveChatIntent — navigation intents', () => {
  it('matches explicit route requests', () => {
    check('take me to the projects page', { kind: 'action', navigateTo: '/projects' });
    check('go to the about page', { kind: 'action', navigateTo: '/about' });
    check('navigate to the resume page', { kind: 'action', navigateTo: '/resume' });
    check('bring me to the home page', { kind: 'action', navigateTo: '/' });
    check('open the home page', { kind: 'action', navigateTo: '/' });
  });

  it('matches short natural phrasings', () => {
    check('take me home', { kind: 'action', navigateTo: '/' });
    check('go home', { kind: 'action', navigateTo: '/' });
    check('back to home', { kind: 'action', navigateTo: '/' });
    check('projects page', { kind: 'action', navigateTo: '/projects' });
    check('about page', { kind: 'action', navigateTo: '/about' });
    check('resume page', { kind: 'action', navigateTo: '/resume' });
  });

  it('does NOT trigger on unrelated phrasing', () => {
    check('take me to dinner', { kind: 'null' });
    check('take me to the moon', { kind: 'null' });
    check('I want to go to bed', { kind: 'null' });
    check('go to hell', { kind: 'null' });
    check('I was thinking about home cooking', { kind: 'null' });
    check('homework is due', { kind: 'null' });
  });
});

describe('resolveChatIntent — link intents', () => {
  it('opens explicit links with natural phrasing', () => {
    check('open your github', { kind: 'action', openUrlContains: 'github.com/Dhruv-Mishra' });
    check('pull up your linkedin', { kind: 'action', openUrlContains: 'linkedin.com' });
    check('show me your codeforces', { kind: 'action', openUrlContains: 'codeforces.com' });
    check("what's your github?", { kind: 'action', openUrlContains: 'github.com/Dhruv-Mishra' });
    check('can I see your linkedin', { kind: 'action', openUrlContains: 'linkedin.com' });
    check('show me your resume pdf', { kind: 'action', openUrlContains: 'resume.pdf' });
  });

  it('does NOT trigger on incidental mentions', () => {
    check('I have a github account somewhere', { kind: 'null' });
    check('linkedin is annoying', { kind: 'null' });
    check('never open that link', { kind: 'null' });
  });
});

describe('resolveChatIntent — feedback intents', () => {
  it('triggers on clear feedback phrasing', () => {
    check('report a bug', { kind: 'action', feedbackAction: true });
    check('leave feedback', { kind: 'action', feedbackAction: true });
    check('I want to report an issue', { kind: 'action', feedbackAction: true });
    check('send feedback', { kind: 'action', feedbackAction: true });
  });

  it('does NOT trigger on ambiguous "bug" mentions', () => {
    check('open bug spray', { kind: 'null' });
    check('I hate to bug you', { kind: 'null' });
    check('there is a bug in my salad', { kind: 'null' });
    check('I will report the weather', { kind: 'null' });
  });
});

describe('resolveChatIntent — project action intents', () => {
  it('opens projects on explicit action phrasing', () => {
    check('show me cropio', { kind: 'action', projectSlug: 'cropio' });
    check('open cropio', { kind: 'action', projectSlug: 'cropio' });
    check('pull up fluent ui', { kind: 'action', projectSlug: 'fluent-ui-android' });
    check('open atomvault', { kind: 'action', projectSlug: 'atomvault' });
  });

  it('opens project repos when repo/github keyword present', () => {
    check('open the cropio repo', { kind: 'action', openUrlContains: 'Cropio-ImageEditor' });
    check('show me the fluent ui github', { kind: 'action', openUrlContains: 'fluentui-android' });
    check('pull up the atomvault source', { kind: 'action', openUrlContains: 'AtomVault' });
  });

  it('returns project-info for explanation requests', () => {
    check('tell me about cropio', { kind: 'project-info', projectSlug: 'cropio' });
    check('what is course evaluator', { kind: 'project-info', projectSlug: 'course-evaluator' });
    check('explain the bloom filter research', { kind: 'project-info', projectSlug: 'bloom-filter-research' });
  });
});

describe('resolveChatIntent — negation', () => {
  it('returns null for negated requests', () => {
    check("don't switch to dark mode", { kind: 'null' });
    check("do not open my github", { kind: 'null' });
    check("I can't open github right now", { kind: 'null' });
    check("I won't report a bug", { kind: 'null' });
    check("shouldn't go to the projects page", { kind: 'null' });
    check("rather not switch to dark mode", { kind: 'null' });
    check("never open that link", { kind: 'null' });
  });
});

describe('resolveChatIntent — chitchat', () => {
  it('returns null for plain conversation', () => {
    check('hi', { kind: 'null' });
    check('hello there', { kind: 'null' });
    check('thanks', { kind: 'null' });
    check('that is cool', { kind: 'null' });
    check('what do you think about rust', { kind: 'null' });
    check('', { kind: 'null' });
  });
});

describe('resolveChatIntent — typo tolerance', () => {
  it('matches project names with small typos', () => {
    check('show me cropi', { kind: 'action', projectSlug: 'cropio' });
    check('open atomvalt', { kind: 'action', projectSlug: 'atomvault' });
  });
});
