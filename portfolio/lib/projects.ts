import type { ProjectSlug } from '@/lib/projectCatalog';

export interface ProjectRecord {
  slug: ProjectSlug;
  name: string;
  summary: string;
  details: string;
  demo?: string;
  link: string;
  linkLabel?: 'Source code' | 'Read the paper';
  image: string;
  blurDataURL: string;
  /** File stem under /resources/video; defaults to the slug, null for no preview. Rename on replacement: /resources is cached immutably. */
  video?: string | null;
  role: string;
  year: string;
  duration: string;
  highlights: string[];
  stack: string[];
}

const BLUR = {
  fluentUI: 'data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoIAAgAA4BaJYwCdADds1bF/gAA/peEjhzbvyuojaMVonSEd20TBtXOgAA=',
  courseEval: 'data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAADQAQCdASoIAAgAA4BaJYwCdAEOuwWOAAD+1xSvMf+TJKMRyfAAAA==',
  ivc: 'data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAABwAQCdASoIAAgAA4BaJYwCdAFAAAD+7PiO2VQTrA1BeCn66YLfsH3QBF4rGvLAAAA=',
  portfolio: 'data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAABwAQCdASoIAAgAA4BaJYwCdAFAAAD+7YdLgWmPNxIIcX0OS9vYAA==',
  recommender: 'data:image/webp;base64,UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoIAAgAA4BaJZQCdAFAAAD+7Ex/2rFueRag3YAA',
  atomVault: 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAADwAQCdASoIAAgAA4BaJYwCdAEO/ZqEUAAA/sgWgM5iS5SM8O9bAAAA',
  bloom: 'data:image/webp;base64,UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoIAAgABwBaJYwCdAFAAAD+7GIwcDJji+dtKgAA',
  cropio: 'data:image/webp;base64,UklGRjYAAABXRUJQVlA4ICoAAACwAQCdASoIAAgAA4BaJQBOgB5QDXsAAP6w3JgPqIX1RsNkiMiKH6vAAAA=',
  jarvis: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAABwAQCdASoIAAgAA4BaJYwCdAFAAAD+6MGt8PCbJcRSgfhep/X66H/9aWT9wGazr3lJSAAA',
  invoke: 'data:image/webp;base64,UklGRkIAAABXRUJQVlA4IDYAAACwAQCdASoIAAgAA4BaJQBOgBtkKPgcAP6YLfHR8LVVMCKXTBrZntLWmsvXXMR274kwhG9AAAA=',
  portSolace: 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACwAQCdASoIAAgABUB8JYwAAp25DspYAP6f65uYVmPxtLnADcN5Xi4A',
} as const;

export const FEATURED_PROJECT_SLUGS = [
  'jarvis-voice-agent', 'personal-portfolio', 'invoke', 'cropio', 'port-solace', 'fluent-ui-android',
] as const satisfies readonly ProjectSlug[];

export const PROJECTS: ProjectRecord[] = [
  {
    slug: 'jarvis-voice-agent',
    name: 'Jarvis',
    summary: 'Call an AI freight dispatcher. It finds loads, assigns carriers and haggles over rates.',
    details: 'A voice agent for a demo logistics app. While you talk, it looks up loads, assigns carriers, negotiates freight rates and submits quotes through MCP tools, with RAG over load and carrier data. The call streams over one WebSocket and stays up as you move between pages.',
    demo: 'https://jarvis.whoisdhruv.com',
    link: 'https://github.com/Dhruv-Mishra/AudioControlledAgenticWebsite',
    image: '/resources/audioAgent.webp',
    blurDataURL: BLUR.jarvis,
    stack: ['Voice AI', 'MCP', 'RAG', 'Tool Calling', 'WebSockets', 'Node.js', 'AudioWorklet'],
    role: 'Full stack and voice AI',
    year: '2026',
    duration: 'Ongoing',
    highlights: [
      'Takes real actions in the app through tool calls: load lookups, carrier assignment, rate negotiation, and quotes',
      'Phone-call UX with barge-in, personas, and phone-line audio filtering; the call survives page changes',
    ],
  },
  {
    slug: 'personal-portfolio',
    name: 'This portfolio',
    summary: 'The site you\'re on. Talk to its voice agent, interrupt it, and let it open pages for you.',
    details: 'A hand-drawn sketchbook with a live voice agent you can interrupt mid-sentence. It has 25+ tools to switch pages, open projects, fill forms and run terminal commands. There\'s also a RAG chatbot with 5 LLMs (one self-hosted) and a retro terminal. Built on Next.js 16 and shipped as Docker images.',
    link: 'https://github.com/Dhruv-Mishra/portfolioWebsite',
    image: '/resources/PersonalPortfolio.webp',
    blurDataURL: BLUR.portfolio,
    stack: ['Next.js', 'React', 'TypeScript', 'Gemini Live', 'RAG', 'Docker', 'GitHub Actions'],
    role: 'Full stack and voice AI',
    year: '2025',
    duration: 'Ongoing',
    highlights: [
      'Full-duplex voice agent with 25+ site tools that can navigate, fill forms, and run commands',
      'RAG chatbot over a curated fact base with 5 selectable LLMs, one of them self-hosted',
      'Docker images built and deployed by GitHub Actions to Linux VMs behind Nginx and Cloudflare',
    ],
  },
  {
    slug: 'invoke',
    name: 'Invoke',
    summary: 'Speak a coding task and Copilot CLI agents take it on, each in its own Git worktree.',
    details: 'A Windows voice assistant for coding agents. It answers simple requests itself and hands bigger tasks to GitHub Copilot CLI agents, each in its own Git worktree so several can run at once. Speech-to-text, the LLM and text-to-speech all run locally; speculative decoding made generation 35% faster.',
    link: 'https://github.com/Dhruv-Mishra/Invoke-Voice',
    image: '/resources/Invoke.webp',
    blurDataURL: BLUR.invoke,
    stack: ['Electron', 'Node.js', 'Python', 'llama.cpp', 'MCP', 'Copilot CLI'],
    role: 'AI agents and desktop',
    year: '2026',
    duration: 'Ongoing',
    highlights: [
      'Delegates coding and research tasks to GitHub Copilot CLI agents, each coding task in an isolated Git worktree',
      'Runs speech recognition, the language model, and speech synthesis locally with Parakeet, llama.cpp, and Kokoro',
      'A benchmark harness picked a speech model with 57% fewer errors than Whisper Small at 5x the speed',
    ],
  },
  {
    slug: 'cropio',
    name: 'Cropio',
    summary: 'Turns a raw photo into clean headshots. Pose detection picks the crops, you fine-tune.',
    details: 'A privacy-conscious portrait cropper. YOLO11 pose estimation and face-orientation detection suggest several headshot crops; an interactive editor lets you adjust them and export at full resolution in the browser. Saved sessions get AI descriptions and semantic search.',
    demo: 'https://cropio.whoisdhruv.com',
    link: 'https://github.com/Dhruv-Mishra/Cropio-ImageEditor',
    image: '/resources/Cropio.webp',
    blurDataURL: BLUR.cropio,
    stack: ['Next.js', 'TypeScript', 'FastAPI', 'YOLO11 Pose', 'IndexedDB', 'NVIDIA APIs'],
    role: 'Full stack and AI',
    year: '2026',
    duration: 'Ongoing',
    highlights: [
      'Generates multiple portrait crop suggestions with pose detection and deterministic fallbacks',
      'Supports drag-resize editing, aspect ratio presets, and full-resolution browser exports',
      'Adds AI descriptions and semantic search over saved sessions via local IndexedDB embeddings',
    ],
  },
  {
    slug: 'port-solace',
    name: 'Port Solace',
    summary: 'A voxel open-world game in your browser. Drive, fly and pull a co-op heist with friends.',
    details: 'A voxel open-world game in a harbour city where the lights never quite go out. Drive cars, fly planes, ride jet skis and pull a co-op heist with up to four friends over peer-to-peer WebRTC. A custom three.js streaming engine meshes in Web Workers so nothing stutters, on desktop and phones.',
    demo: 'https://port-solace.vercel.app',
    link: 'https://github.com/Dhruv-Mishra/VoxelGame',
    image: '/resources/PortSolace.webp',
    blurDataURL: BLUR.portSolace,
    stack: ['JavaScript', 'three.js', 'WebGL', 'WebRTC', 'Web Workers', 'Cloudflare Workers', 'Web Audio'],
    role: 'Game dev and graphics',
    year: '2026',
    duration: 'Ongoing',
    highlights: [
      'Co-op for up to four players over WebRTC data channels, with a Cloudflare Worker that only brokers the join',
      'Streams a voxel city and an outland four times its size, meshed in Web Workers with dithered LOD cross-fades',
      'Shaders are compiled ahead of time so no program links during play; per-frame code allocates nothing',
    ],
  },
  {
    slug: 'fluent-ui-android',
    name: 'Fluent UI Android',
    summary: 'Microsoft\'s open-source Compose library for 365 apps. I shipped 10 releases as maintainer.',
    details: 'Microsoft\'s open-source Jetpack Compose component library for Microsoft 365 Android apps. As its primary maintainer I shipped 10 releases used by Copilot, Office, Outlook, OneDrive and Teams, and owned the library\'s security compliance.',
    link: 'https://github.com/microsoft/fluentui-android',
    image: '/resources/FluentUI.webp',
    blurDataURL: BLUR.fluentUI,
    stack: ['Kotlin', 'Java', 'Android SDK', 'Jetpack Compose', 'XML', 'Gradle', 'Maven'],
    role: 'Android',
    year: '2024',
    duration: '6 months',
    highlights: [
      'Primary maintainer, shipped 10 releases',
      'Used by Copilot, Office, Outlook, OneDrive, and Teams',
      'Owned the library\'s security compliance',
    ],
  },
  {
    slug: 'bloom-filter-research',
    name: 'Bloom filter research',
    summary: 'A lock-free counting Bloom filter in C++ with 3x the baseline throughput under contention.',
    details: 'Undergrad research at IIIT Delhi\'s Distributed Computing Lab under Prof. Bapi Chatterjee. My lock-free C++ counting Bloom filter relaxes synchronization to reach 3x the baseline throughput under high contention, with error rates close to the strict version. Published in the IIIT Delhi repository.',
    link: 'https://repository.iiitd.edu.in/jspui/handle/123456789/1613',
    linkLabel: 'Read the paper',
    image: '/resources/BloomFilter.webp',
    blurDataURL: BLUR.bloom,
    stack: ['C++', 'Bloom Filters', 'Concurrency', 'Optimization', 'Data Structures'],
    role: 'Algorithms and systems',
    year: '2024',
    duration: '8 months',
    highlights: [
      'Published in the IIIT Delhi research repository',
      'Lock-free design with 3x baseline throughput under high contention',
      'Benchmarked against existing concurrent filter implementations',
    ],
  },
  {
    slug: 'ivc-vital-checkup',
    name: 'IVC Vital Checkup',
    summary: 'A camera kiosk that measures height, weight, BMI and pulse without touching anyone.',
    details: 'A contactless health-screening kiosk that automates patient triage. One camera and an OpenCV and MediaPipe pipeline measure height, weight, BMI and pulse from a distance in real time, so patients spend less time waiting to be seen.',
    link: 'https://github.com/Dhruv-Mishra/Instant-Vital-Checkup-IVC',
    image: '/resources/InstantVitalCheckup.webp',
    blurDataURL: BLUR.ivc,
    stack: ['Python', 'OpenCV', 'Computer Vision', 'HealthTech', 'Real-time Processing'],
    role: 'Computer vision',
    year: '2023',
    duration: '4 months',
    highlights: [
      'Contactless measurement of height, weight, BMI, and pulse with a single camera',
      'Real-time computer vision pipeline using OpenCV and MediaPipe',
    ],
  },
  {
    slug: 'hybrid-recommender',
    name: 'Hybrid Recommender',
    summary: 'Movie picks that work even for brand-new users, by blending three filtering methods.',
    details: 'A context-aware movie recommender that blends collaborative, content-based and demographic filtering. Combining the three tackles the cold-start problem, so new users still get useful picks, and tunes suggestions to each viewer\'s age and context.',
    link: 'https://github.com/Dhruv-Mishra/Age-and-Context-Sensitive-Hybrid-Entertaintment-Recommender-System',
    image: '/resources/HybridRecommender.webp',
    blurDataURL: BLUR.recommender,
    stack: ['Python', 'Scikit-Learn', 'Pandas', 'SVD', 'TensorFlow'],
    role: 'Machine learning',
    year: '2023',
    duration: '3 months',
    highlights: [
      'Hybrid engine combining collaborative, content-based, and demographic filtering',
      'Designed to solve the cold-start problem in recommendation systems',
      'Personalizes content for diverse user groups',
    ],
  },
  {
    slug: 'course-evaluator',
    name: 'Course Evaluator',
    summary: 'Spots university courses that teach the same thing, so nobody takes one twice.',
    details: 'A Python tool that compares course syllabi across university curriculums. Fuzzy matching and text similarity flag modules that cover the same material, with adjustable thresholds, so students don\'t end up taking the same course twice.',
    link: 'https://github.com/Dhruv-Mishra/Course-Similarity-Evaluator',
    image: '/resources/CourseEvaluator.webp',
    blurDataURL: BLUR.courseEval,
    stack: ['Python', 'Fuzzy Logic', 'NLP', 'Data Analysis', 'Algorithm Design'],
    role: 'Algorithms and ML',
    year: '2023',
    duration: '2 months',
    highlights: [
      'Built fuzzy matching pipeline to compare course syllabi across universities',
      'Identifies redundant modules with configurable similarity thresholds',
      'Helps students avoid retaking equivalent coursework',
    ],
  },
  {
    slug: 'atomvault',
    name: 'AtomVault',
    summary: 'A Java and MySQL banking database with rollback-safe transfers and role-based access.',
    details: 'A banking database built for reliable transactions. Every transfer is ACID-compliant with rollback and recovery, and role-based access control separates what admins, tellers and customers can do. Built with Java, JDBC and MySQL.',
    link: 'https://github.com/Dhruv-Mishra/AtomVault',
    image: '/resources/AtomVault.webp',
    blurDataURL: BLUR.atomVault,
    stack: ['Java', 'MySQL', 'JDBC', 'OOP', 'ACID Compliance'],
    role: 'Full stack',
    year: '2022',
    duration: '2 months',
    highlights: [
      'Full ACID compliance with transaction rollback and recovery',
      'Role-based access control with admin, teller, and customer roles',
    ],
  },
];

export const PROJECTS_BY_SLUG: Record<ProjectSlug, ProjectRecord> = Object.fromEntries(
  PROJECTS.map(project => [project.slug, project]),
) as Record<ProjectSlug, ProjectRecord>;

export function getProjectBySlug(slug: ProjectSlug): ProjectRecord {
  return PROJECTS_BY_SLUG[slug];
}

/** AV1 first; browsers without an AV1 decoder (older Safari) fall back to H.264. */
export function getProjectVideoSources(project: ProjectRecord) {
  if (project.video === null) return null;
  const stem = `/resources/video/${project.video ?? project.slug}`;
  return [
    { src: `${stem}.av1.mp4`, type: 'video/mp4; codecs="av01.0.04M.08, opus"' },
    { src: `${stem}.mp4`, type: 'video/mp4' },
  ] as const;
}