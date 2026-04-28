export const PROJECT_ACTIONS = [
  {
    slug: 'jarvis-voice-agent',
    label: 'Show me Jarvis Voice Agent',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['jarvis', 'voice\\s*agent', 'audio\\s*agent', 'audio[-\\s]*controlled', 'agentic\\s*website'],
    response: 'Opening Jarvis Voice Agent right here ~',
  },
  {
    slug: 'fluent-ui-android',
    label: 'Show me Fluent UI Android',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['fluent\\s*ui(\\s*android)?', 'microsoft\\s*365'],
    response: 'Opening Fluent UI Android right here ~',
  },
  {
    slug: 'course-evaluator',
    label: 'Show me Course Evaluator',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['course\\s*evaluator', 'course\\s*similarity', 'redundant\\s*course'],
    response: 'Opening Course Evaluator right here ~',
  },
  {
    slug: 'ivc-vital-checkup',
    label: 'Show me IVC Vital Checkup',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['ivc', 'vital\\s*checkup', 'instant\\s*vital\\s*checkup'],
    response: 'Opening IVC Vital Checkup right here ~',
  },
  {
    slug: 'personal-portfolio',
    label: 'Show me the portfolio project',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['portfolio\s*project', 'website\s*project', 'sketchbook\s*site', 'this\s*site'],
    response: 'Opening the portfolio project right here ~',
  },
  {
    slug: 'cropio',
    label: 'Show me Cropio',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['cropio', 'ai\\s*cropper', 'portrait\\s*cropper'],
    response: 'Opening Cropio right here ~',
  },
  {
    slug: 'hybrid-recommender',
    label: 'Show me Hybrid Recommender',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['hybrid\\s*recommender', 'movie\\s*recommend', 'movie\\s*night'],
    response: 'Opening Hybrid Recommender right here ~',
  },
  {
    slug: 'bloom-filter-research',
    label: 'Show me Bloom Filter Research',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['bloom\\s*filter', 'counting\\s*bloom', 'research'],
    response: 'Opening Bloom Filter Research right here ~',
  },
  {
    slug: 'atomvault',
    label: 'Show me AtomVault',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['atomvault', 'bank\\s*vault', 'banking\\s*database'],
    response: 'Opening AtomVault right here ~',
  },
] as const;

export type ProjectSlug = (typeof PROJECT_ACTIONS)[number]['slug'];

const PROJECT_SLUG_SET = new Set<string>(PROJECT_ACTIONS.map(project => project.slug));

export function isProjectSlug(value: string): value is ProjectSlug {
  return PROJECT_SLUG_SET.has(value);
}