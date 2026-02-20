// lib/links.ts — Single source of truth for all personal/project links

/** Personal social and contact links */
export const PERSONAL_LINKS = {
  github: 'https://github.com/Dhruv-Mishra',
  linkedin: 'https://www.linkedin.com/in/dhruv-mishra-id/',
  codeforces: 'https://codeforces.com/profile/DhruvMishra',
  cpHistory: 'https://zibada.guru/gcj/profile/Dhruv985',
  email: 'mailto:dhruvmishra.id@gmail.com',
  phone: 'tel:+919599377944',
  resume: '/resources/resume.pdf',
} as const;

/** Project repository links */
export const PROJECT_LINKS = {
  fluentui: 'https://github.com/microsoft/fluentui-android',
  courseEvaluator: 'https://github.com/Dhruv-Mishra/Course-Similarity-Evaluator',
  ivc: 'https://github.com/Dhruv-Mishra/Instant-Vital-Checkup-IVC',
  portfolio: 'https://github.com/Dhruv-Mishra/portfolio-website',
  recommender: 'https://github.com/Dhruv-Mishra/Age-and-Context-Sensitive-Hybrid-Entertaintment-Recommender-System',
  atomvault: 'https://github.com/Dhruv-Mishra/AtomVault',
  bloomfilter: 'https://repository.iiitd.edu.in/jspui/handle/123456789/1613',
} as const;

/** Site metadata */
export const SITE = {
  url: 'https://whoisdhruv.com',
  name: 'Dhruv Mishra',
  title: "Dhruv's Sketchbook",
} as const;

/**
 * Flat link map used by the chat OPEN tag parser and terminal commands.
 * Keys are short identifiers used in [[OPEN:key]] tags.
 */
export const OPEN_LINK_KEYS: Record<string, string> = {
  github: PERSONAL_LINKS.github,
  linkedin: PERSONAL_LINKS.linkedin,
  codeforces: PERSONAL_LINKS.codeforces,
  cphistory: PERSONAL_LINKS.cpHistory,
  email: PERSONAL_LINKS.email,
  phone: PERSONAL_LINKS.phone,
  resume: PERSONAL_LINKS.resume,
  'project-fluentui': PROJECT_LINKS.fluentui,
  'project-courseevaluator': PROJECT_LINKS.courseEvaluator,
  'project-ivc': PROJECT_LINKS.ivc,
  'project-portfolio': PROJECT_LINKS.portfolio,
  'project-recommender': PROJECT_LINKS.recommender,
  'project-atomvault': PROJECT_LINKS.atomvault,
  'project-bloomfilter': PROJECT_LINKS.bloomfilter,
} as const;
