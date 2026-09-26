export const PROJECT_SLUG_LIST = [
  'jarvis-voice-agent',
  'fluent-ui-android',
  'course-evaluator',
  'ivc-vital-checkup',
  'personal-portfolio',
  'cropio',
  'hybrid-recommender',
  'bloom-filter-research',
  'atomvault',
] as const;

export type ProjectSlug = (typeof PROJECT_SLUG_LIST)[number];

const PROJECT_SLUG_SET = new Set<string>(PROJECT_SLUG_LIST);

export function isProjectSlug(value: string): value is ProjectSlug {
  return PROJECT_SLUG_SET.has(value);
}
