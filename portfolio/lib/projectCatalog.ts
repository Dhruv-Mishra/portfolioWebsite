import type { ProjectSlug } from '@/lib/projectSlugs';

export { isProjectSlug, PROJECT_SLUG_LIST, type ProjectSlug } from '@/lib/projectSlugs';

export const PROJECT_ACTIONS = [
  {
    slug: 'invoke',
    summary: 'voice-controlled coding agents on Windows',
    label: 'Show me Invoke',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['invoke(\\s*voice)?', 'voice[-\\s]*controlled\\s*coding', 'coding\\s*agents?'],
    response: 'Opening Invoke right here ~',
  },
  {
    slug: 'jarvis-voice-agent',
    summary: 'voice agent that runs a freight dispatch website',
    label: 'Show me Jarvis Voice Agent',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['jarvis', 'voice\\s*agent', 'audio\\s*agent', 'audio[-\\s]*controlled', 'agentic\\s*website'],
    response: 'Opening Jarvis Voice Agent right here ~',
  },
  {
    slug: 'fluent-ui-android',
    summary: 'Microsoft 365 design system for Android',
    label: 'Show me Fluent UI Android',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['fluent\\s*ui(\\s*android)?', 'microsoft\\s*365'],
    response: 'Opening Fluent UI Android right here ~',
  },
  {
    slug: 'course-evaluator',
    summary: 'NLP tool that flags redundant university courses',
    label: 'Show me Course Evaluator',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['course\\s*evaluator', 'course\\s*similarity', 'redundant\\s*course'],
    response: 'Opening Course Evaluator right here ~',
  },
  {
    slug: 'ivc-vital-checkup',
    summary: 'contactless kiosk that measures vitals from a camera',
    label: 'Show me IVC Vital Checkup',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['ivc', 'vital\\s*checkup', 'instant\\s*vital\\s*checkup'],
    response: 'Opening IVC Vital Checkup right here ~',
  },
  {
    slug: 'personal-portfolio',
    summary: 'this sketchbook website',
    label: 'Show me the portfolio project',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['portfolio\\s*project', 'website\\s*project', 'sketchbook\\s*site', 'this\\s*site'],
    response: 'Opening the portfolio project right here ~',
  },
  {
    slug: 'cropio',
    summary: 'AI portrait cropper that makes headshots',
    label: 'Show me Cropio',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['cropio', 'ai\\s*cropper', 'portrait\\s*cropper'],
    response: 'Opening Cropio right here ~',
  },
  {
    slug: 'hybrid-recommender',
    summary: 'group movie-night recommender',
    label: 'Show me Hybrid Recommender',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['hybrid\\s*recommender', 'movie\\s*recommend', 'movie\\s*night'],
    response: 'Opening Hybrid Recommender right here ~',
  },
  {
    slug: 'bloom-filter-research',
    summary: 'lock-free concurrent counting Bloom filters',
    label: 'Show me Bloom Filter Research',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['bloom\\s*filter', 'counting\\s*bloom', 'research'],
    response: 'Opening Bloom Filter Research right here ~',
  },
  {
    slug: 'atomvault',
    summary: 'banking database with role-based access',
    label: 'Show me AtomVault',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['atomvault', 'bank\\s*vault', 'banking\\s*database'],
    response: 'Opening AtomVault right here ~',
  },
  {
    slug: 'port-solace',
    summary: 'multiplayer voxel city game in the browser',
    label: 'Show me Port Solace',
    verbs: ['show', 'open', 'view', 'tell'],
    keywords: ['port\\s*solace', 'solace', 'voxel\\s*game', 'voxel\\s*city'],
    response: 'Opening Port Solace right here ~',
  },
] as const satisfies ReadonlyArray<{
  slug: ProjectSlug;
  summary: string;
  label: string;
  verbs: readonly string[];
  keywords: readonly string[];
  response: string;
}>;