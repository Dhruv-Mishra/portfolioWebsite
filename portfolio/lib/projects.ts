import type { ProjectSlug } from '@/lib/projectCatalog';

export type ProjectAccent = 'emerald' | 'amber' | 'violet' | 'sky' | 'blue' | 'indigo' | 'rose' | 'orange' | 'green';

export interface ProjectRecord {
  slug: ProjectSlug;
  name: string;
  /** Two-line pitch for project tiles and the home carousel; `details` is the expanded story. */
  summary: string;
  /** The story, with `**strong**`, `==highlight==` and `~~wavy~~` marks (lib/markedText.ts). Cards clamp it to three lines. */
  details: string;
  /** Short kind badge on the card, e.g. "Voice Agent". */
  label: string;
  /** Main languages, underlined under the title. */
  lang: string;
  /** Highlighter and underline colour for the marks. */
  accent: ProjectAccent;
  demo?: string;
  link: string;
  linkLabel?: 'Source code' | 'Read the paper';
  /** The project's screenshot, shown as the still beside the video in the expanded note. */
  image: string;
  /** Placeholder for the card thumbnail (`getProjectThumbnail`); printed by scripts/build-project-thumbs.py. */
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
  fluentUI: 'data:image/webp;base64,UklGRjYAAABXRUJQVlA4ICoAAACwAQCdASoIAAUAAsBMJYwCdAD0h/pcAP7th9FRvHGycLFUZGGfsCgAAAA=',
  courseEval: 'data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoIAAUAAsBMJYwCdAEfbIkj2AD+7atvlt9Ch2gU+i0jVIMeUgAAAA==',
  ivc: 'data:image/webp;base64,UklGRj4AAABXRUJQVlA4IDIAAACwAQCdASoIAAUAAsBMJQBOgB6DodsAAP7uHPkVy4uxTcx5ngeCbaoss3g5WKKJ+AAAAA==',
  portfolio: 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAADQAQCdASoIAAUAAsBMJZQCdAD0QV+MYAD+7epj5VKK+Txe+teYEsAA',
  recommender: 'data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAACwAQCdASoIAAUAAsBMJQBOgBt9aioAAP7oTHGHAJF8Yl4ABOEYWoLd7liVETdgYAA=',
  atomVault: 'data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAACwAQCdASoIAAUAAsBMJYwCdADdDAUAAP7t36Gl6uR5VEQPBVgXWT9HPWAAAA==',
  bloom: 'data:image/webp;base64,UklGRjYAAABXRUJQVlA4ICoAAADQAQCdASoIAAUAAsBMJYwCdAD0l+wNQAD+7YQJP6oVUmMFPZ7SILQDAAA=',
  cropio: 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAADQAQCdASoIAAUAAsBMJYwCdAD6Ef4sAAD+66Z29CiNosXEBWWmlvQA',
  jarvis: 'data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoIAAUAAsBMJYwCdADdQ0vUAAD+6p4+gcuDxylqmssrMkYZ+rwAAA==',
  invoke: 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAADQAQCdASoIAAUAAsBMJYwCdAD6FDDQQAD+7aurRc71JSHV+T9HPWAA',
  portSolace: 'data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoIAAUAAsBMJQBOgBiccAAA/scmWSbFPffQfdz8//pLpchdk7xAAA==',
} as const;

export const FEATURED_PROJECT_SLUGS = [
  'jarvis-voice-agent', 'personal-portfolio', 'invoke', 'cropio', 'port-solace', 'fluent-ui-android',
] as const satisfies readonly ProjectSlug[];

export const PROJECTS: ProjectRecord[] = [
  {
    slug: 'jarvis-voice-agent',
    name: 'Jarvis',
    summary: 'Phone an AI dispatcher that haggles freight rates.',
    details: 'A **voice agent** for a demo logistics app. While you talk, it looks up loads, assigns carriers, ==negotiates freight rates== and submits quotes through **MCP tools**, with ~~RAG over load and carrier data~~. The call streams over one WebSocket and stays up as you move between pages.',
    label: 'Voice Agent',
    lang: 'JavaScript / Node.js',
    accent: 'emerald',
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
    summary: 'This site, with a voice agent you can interrupt.',
    details: 'A hand-drawn sketchbook with a **live voice agent** you can ~~interrupt mid-sentence~~. It has ==25+ tools== to switch pages, open projects, fill forms and run terminal commands. There\'s also a **RAG chatbot** with 5 LLMs (one self-hosted) and a retro terminal. Built on Next.js 16 and shipped as Docker images.',
    label: 'This Website',
    lang: 'Next.js / TypeScript',
    accent: 'amber',
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
    summary: 'Talk to coding agents that work in parallel.',
    details: 'A Windows **voice assistant for coding agents**. It answers simple requests itself and hands bigger tasks to ==GitHub Copilot CLI agents==, each in ~~its own Git worktree~~ so several can run at once. Speech-to-text, the LLM and text-to-speech all **run locally**; speculative decoding made generation 35% faster.',
    label: 'Coding Agents',
    lang: 'Electron / Node.js / Python',
    accent: 'violet',
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
    summary: 'Pose detection turns raw photos into headshots.',
    details: 'A **privacy-conscious portrait cropper**. ==YOLO11 pose estimation== and face-orientation detection suggest several headshot crops; an interactive editor lets you adjust them and export at full resolution in the browser. Saved sessions get AI descriptions and ~~semantic search~~.',
    label: 'AI Cropper',
    lang: 'Next.js / FastAPI',
    accent: 'sky',
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
    summary: 'Co-op voxel heists you can play in the browser.',
    details: 'A **voxel open-world game** in a harbour city where the lights never quite go out. Drive cars, fly planes, ride jet skis and pull a ==co-op heist== with up to four friends over ~~peer-to-peer WebRTC~~. A custom three.js streaming engine meshes in Web Workers so nothing stutters, on desktop and phones.',
    label: 'Voxel Game',
    lang: 'JavaScript / three.js',
    accent: 'amber',
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
    summary: 'Microsoft\'s Compose UI kit; I shipped 10 releases.',
    details: 'Microsoft\'s open-source **Jetpack Compose** component library for ~~Microsoft 365~~ Android apps. As its ==primary maintainer== I shipped 10 releases used by Copilot, Office, Outlook, OneDrive and Teams, and owned the library\'s security compliance.',
    label: 'Android Lib',
    lang: 'Kotlin / Java',
    accent: 'blue',
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
    summary: 'A lock-free Bloom filter with 3x the throughput.',
    details: 'Undergrad research at IIIT Delhi\'s **Distributed Computing Lab** under Prof. Bapi Chatterjee. My lock-free C++ counting Bloom filter relaxes synchronization to reach ==3x the baseline throughput== under ~~high contention~~, with error rates close to the strict version. Published in the IIIT Delhi repository.',
    label: 'Research Paper',
    lang: 'Research / C++',
    accent: 'indigo',
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
    summary: 'A camera kiosk that checks vitals hands-free.',
    details: 'A ==contactless== health-screening kiosk that ~~automates patient triage~~. One camera and an **OpenCV and MediaPipe** pipeline measure height, weight, BMI and pulse from a distance in real time, so patients spend less time waiting to be seen.',
    label: 'Vitals Scan',
    lang: 'Python / OpenCV',
    accent: 'green',
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
    summary: 'Movie picks that work even for brand-new users.',
    details: 'A context-aware ~~movie recommender~~ that blends **collaborative**, ==content-based== and demographic filtering. Combining the three tackles the **cold-start problem**, so new users still get useful picks, and tunes suggestions to each viewer\'s age and context.',
    label: 'Movie Night',
    lang: 'Python / ML',
    accent: 'rose',
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
    summary: 'Flags courses that teach the same material.',
    details: 'A Python tool that compares course syllabi across university curriculums. ==Fuzzy matching== and text similarity flag modules that cover ~~the same material~~, with adjustable thresholds, so students don\'t end up **taking the same course twice**.',
    label: 'Overlap Detector',
    lang: 'Python',
    accent: 'orange',
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
    summary: 'A banking database with rollback-safe transfers.',
    details: 'A banking database built for ~~reliable transactions~~. Every transfer is **ACID-compliant** with rollback and recovery, and ==role-based access control== separates what admins, tellers and customers can do. Built with Java, JDBC and MySQL.',
    label: 'Bank Vault',
    lang: 'Java / MySQL',
    accent: 'green',
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

const PROJECTS_BY_SLUG: Record<ProjectSlug, ProjectRecord> = Object.fromEntries(
  PROJECTS.map(project => [project.slug, project]),
) as Record<ProjectSlug, ProjectRecord>;

export function getProjectBySlug(slug: ProjectSlug): ProjectRecord {
  return PROJECTS_BY_SLUG[slug];
}

/** The last frame of the preview video (the finished page with its title), so cards match the clip they open. */
export function getProjectThumbnail(project: ProjectRecord): string {
  return project.video === null ? project.image : `/resources/video/${project.video ?? project.slug}.webp`;
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