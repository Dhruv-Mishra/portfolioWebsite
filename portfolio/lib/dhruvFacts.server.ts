import 'server-only';
import type { ProjectSlug } from '@/lib/projectCatalog';

interface FactEntry {
  id: string;
  text: string;
  tags: readonly string[];
  priority?: number;
}

const CORE_FACTS: FactEntry[] = [
  {
    id: 'work-shell',
    text: 'Software Engineer at Microsoft on the M365 Shell Team. Works with C++ and C# on enterprise encryption flows for identity and user-data services handling 7B+ hits per day. Cut infrastructure COGS by $240K annually and pushed adoption of AI workflows.',
    tags: ['microsoft', 'm365', 'shell', 'work', 'job', 'encryption', 'c++', 'c#', 'infra', 'cost', 'identity'],
    priority: 10,
  },
  {
    id: 'work-fluentui',
    text: 'Previously worked on Fluent UI Android, the Kotlin/Compose design-system library used in Outlook, Teams, and other Microsoft 365 apps. Won a Microsoft FHL hackathon for a build-performance improvement.',
    tags: ['fluent', 'fluentui', 'android', 'kotlin', 'compose', 'outlook', 'teams', 'hackathon'],
    priority: 9,
  },
  {
    id: 'education',
    text: 'B.Tech Honors in Computer Science and Applied Mathematics from IIIT Delhi, GPA 8.96. Studied machine learning and deep learning deeply enough to understand how LLMs work under the hood.',
    tags: ['iiit', 'iiitd', 'college', 'education', 'degree', 'gpa', 'machine learning', 'deep learning', 'llm'],
    priority: 8,
  },
  {
    id: 'cp',
    text: 'Competitive programming: Codeforces Expert with max rating 1703 as DhruvMishra, plus Global Rank 291 in the Google Code Jam Farewell Round.',
    tags: ['codeforces', 'competitive programming', 'cp', 'algorithms', 'rating', 'code jam'],
    priority: 7,
  },
  {
    id: 'research',
    text: 'Research at IIIT Delhi DCLL lab on counting Bloom filters in C++. Used relaxed synchronization to improve throughput by 300 percent. Published in the IIIT Delhi repository.',
    tags: ['research', 'bloom filter', 'bloom filters', 'concurrency', 'c++', 'throughput', 'dcll'],
    priority: 7,
  },
  {
    id: 'stack',
    text: 'Favorite language is C++. Main stack spans C++, C#, Python, TypeScript, Java, Next.js, React, Tailwind, Node.js, MySQL, Azure, CI/CD, and past Kotlin/Android work with Hilt and profilers.',
    tags: ['stack', 'tech stack', 'favorite language', 'react', 'next', 'nextjs', 'typescript', 'python', 'java', 'azure', 'mysql', 'kotlin'],
    priority: 7,
  },
  {
    id: 'site',
    text: 'This portfolio is a sketchbook-themed Next.js 16, React 19, Tailwind v4, and Framer Motion site with AI chat and an interactive terminal. It is georedundant across Oracle Cloud, GCP, and Azure with separate GitHub Actions deployment pipelines.',
    tags: ['portfolio', 'website', 'site', 'terminal', 'chat', 'deployment', 'oracle cloud', 'gcp', 'azure', 'github actions'],
    priority: 6,
  },
];

const PROJECT_FACTS: FactEntry[] = [
  {
    id: 'project-cropio',
    text: 'Cropio is a privacy-conscious AI portrait cropper built with Next.js and FastAPI. It uses YOLO11 pose estimation, an interactive crop editor, full-resolution browser exports, and semantic session search over local IndexedDB embeddings.',
    tags: ['cropio', 'crop', 'cropping', 'headshot', 'portrait', 'yolo', 'fastapi', 'indexeddb', 'embeddings', 'ai cropper'],
    priority: 10,
  },
  {
    id: 'project-courseeval',
    text: 'Course Similarity Evaluator compares courses using NLP and fuzzy matching with Python and scikit-learn.',
    tags: ['course similarity', 'course evaluator', 'nlp', 'scikit', 'scikit-learn'],
    priority: 5,
  },
  {
    id: 'project-ivc',
    text: 'Instant Vital Checkup is a contactless computer-vision health screening project using Python and OpenCV to estimate height, weight, BMI, and pulse from a single camera.',
    tags: ['ivc', 'instant vital checkup', 'opencv', 'computer vision', 'health'],
    priority: 5,
  },
  {
    id: 'project-recommender',
    text: 'Hybrid Entertainment Recommender is an age-aware, context-sensitive movie recommendation system built with Python and scikit-learn.',
    tags: ['recommender', 'movie', 'recommendation', 'hybrid', 'scikit-learn'],
    priority: 4,
  },
  {
    id: 'project-atomvault',
    text: 'AtomVault is an ACID-compliant banking database project built with Java and MySQL and designed with role-based security.',
    tags: ['atomvault', 'database', 'mysql', 'java', 'banking'],
    priority: 4,
  },
];

const PROJECT_FACT_TEXT_BY_SLUG: Partial<Record<ProjectSlug, string>> = {
  'cropio': 'Cropio is a privacy-conscious AI portrait cropper built with Next.js and FastAPI. It uses YOLO11 pose estimation, an interactive crop editor, full-resolution browser exports, and semantic session search over local IndexedDB embeddings.',
  'course-evaluator': 'Course Similarity Evaluator compares courses using NLP and fuzzy matching with Python and scikit-learn.',
  'ivc-vital-checkup': 'Instant Vital Checkup is a contactless computer-vision health screening project using Python and OpenCV to estimate height, weight, BMI, and pulse from a single camera.',
  'hybrid-recommender': 'Hybrid Entertainment Recommender is an age-aware, context-sensitive movie recommendation system built with Python and scikit-learn.',
  'atomvault': 'AtomVault is an ACID-compliant banking database project built with Java and MySQL and designed with role-based security.',
  'bloom-filter-research': 'My Bloom filter research at IIIT Delhi focused on counting Bloom filters in C++ and improved throughput by 300 percent through relaxed synchronization.',
};

const PERSONAL_FACTS: FactEntry[] = [
  {
    id: 'hobbies',
    text: 'Main hobbies are gym and strength training, chess, gaming, travel, PC hardware overclocking, and longevity research.',
    tags: ['hobbies', 'gym', 'chess', 'gaming', 'travel', 'pc', 'overclocking', 'longevity'],
    priority: 5,
  },
  {
    id: 'pc-build',
    text: 'PC build: RTX 3080 Ti, i5-13600KF overclocked to 5.5 GHz on P-cores, and DDR5 Hynix M-die tuned from 5200 to 6400 CL32 with tight secondary timings.',
    tags: ['pc', 'build', 'hardware', '3080', '13600kf', 'ddr5', 'overclock', 'ram'],
    priority: 5,
  },
  {
    id: 'games',
    text: 'Favorite games include Witcher 3, Metal Gear Solid V, and the Horizon games. Reached Immortal 2 in Valorant and plays modded Minecraft on an Azure-hosted server.',
    tags: ['games', 'gaming', 'witcher', 'metal gear', 'valorant', 'minecraft', 'horizon'],
    priority: 4,
  },
  {
    id: 'travel',
    text: 'Based in India and has traveled to the EU, Singapore, Vietnam, many places across India, and the US including Las Vegas, Los Angeles, New York City, and Seattle.',
    tags: ['travel', 'india', 'europe', 'singapore', 'vietnam', 'usa', 'seattle'],
    priority: 3,
  },
];

const SITE_FACTS: FactEntry[] = [
  {
    id: 'site-pages',
    text: 'Site pages: home with retro terminal, about, projects, resume, and chat. Terminal commands include help, about, projects, contact, socials, ls, cat, open, skills, resume, chat, joke, init, whoami, date, feedback, and clear.',
    tags: ['home', 'about page', 'projects page', 'resume', 'chat page', 'terminal commands', 'help', 'cat', 'open'],
    priority: 4,
  },
  {
    id: 'growindigo',
    text: 'Past internship at growIndigo focused on building an ML model for crop prediction.',
    tags: ['growindigo', 'internship', 'crop prediction', 'ml model'],
    priority: 3,
  },
];

const FACT_BANK: FactEntry[] = [
  ...CORE_FACTS,
  ...PROJECT_FACTS,
  ...PERSONAL_FACTS,
  ...SITE_FACTS,
];

const ALWAYS_INCLUDE_IDS = ['work-shell', 'stack', 'site'];

function getMatchScore(fact: FactEntry, query: string): number {
  let score = fact.priority ?? 0;
  for (const tag of fact.tags) {
    if (query.includes(tag)) {
      score += tag.length >= 6 ? 6 : 3;
    }
  }
  if (fact.text.toLowerCase().includes(query.trim()) && query.trim().length >= 5) {
    score += 4;
  }
  return score;
}

export function getRelevantDhruvFacts(messages: { role: string; content: string }[], limit = 8): string {
  const query = messages
    .filter((message) => message.role === 'user')
    .slice(-4)
    .map((message) => message.content.toLowerCase())
    .join(' ')
    .trim();

  const alwaysIncluded = FACT_BANK.filter((fact) => ALWAYS_INCLUDE_IDS.includes(fact.id));
  const ranked = FACT_BANK
    .filter((fact) => !ALWAYS_INCLUDE_IDS.includes(fact.id))
    .map((fact) => ({ fact, score: query ? getMatchScore(fact, query) : (fact.priority ?? 0) }))
    .sort((left, right) => right.score - left.score)
    .filter(({ score }) => score > 0)
    .slice(0, Math.max(0, limit - alwaysIncluded.length))
    .map(({ fact }) => fact);

  const facts = [...alwaysIncluded, ...ranked].slice(0, limit);
  return facts.map((fact) => `- ${fact.text}`).join('\n');
}

export function getProjectFactText(slug: ProjectSlug): string | null {
  return PROJECT_FACT_TEXT_BY_SLUG[slug] ?? null;
}