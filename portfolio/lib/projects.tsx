import type { ComponentType, ReactNode } from 'react';
import { Activity, Bot, Database, Film, Globe, Mic, ScrollText, Scissors, Search, Smartphone } from 'lucide-react';
import type { ProjectSlug } from '@/lib/projectCatalog';

export interface ProjectRecord {
  slug: ProjectSlug;
  name: string;
  desc: ReactNode;
  lang: string;
  link: string;
  colorClass: string;
  image: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  imageClassName?: string;
  stack: string[];
  blurDataURL: string;
  video?: string | null;
  role: string;
  year: string;
  duration: string;
  highlights: string[];
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
} as const;

export const PROJECTS: ProjectRecord[] = [
  {
    slug: 'invoke',
    name: 'Invoke — Voice Coding Agents',
    desc: (
      <>
        A Windows <strong>voice assistant for running coding agents</strong>. It handles simple requests itself and hands bigger coding tasks to <span className="bg-violet-100 dark:bg-violet-900/50 px-1 rounded">GitHub Copilot CLI agents</span>, each working in <span className="underline decoration-wavy decoration-violet-400">its own Git worktree</span> so several can run at once. Speech-to-text, the LLM, and text-to-speech all <strong>run locally</strong> (Parakeet, quantized Gemma/Qwen on llama.cpp, and Kokoro). <span className="font-semibold">Speculative decoding</span> with a draft model made generation 35% faster.
      </>
    ),
    lang: 'Electron / Node.js / Python',
    link: 'https://github.com/Dhruv-Mishra/Invoke-Voice',
    colorClass: 'bg-note-purple',
    image: '/resources/Invoke.webp',
    blurDataURL: BLUR.invoke,
    video: null,
    icon: Bot,
    label: 'Coding Agents',
    stack: ['Electron', 'Node.js', 'Python', 'llama.cpp', 'MCP', 'Copilot CLI'],
    role: 'AI Agents + Desktop',
    year: '2026',
    duration: 'Ongoing',
    highlights: [
      'Delegates coding and research tasks to GitHub Copilot CLI agents, each coding task in an isolated Git worktree',
      'Runs speech recognition, the language model, and speech synthesis locally with Parakeet, llama.cpp, and Kokoro',
      'A benchmark harness picked a speech model with 57% fewer errors than Whisper Small at 5x the speed',
    ],
  },
  {
    slug: 'jarvis-voice-agent',
    name: 'Jarvis — Voice Dispatch Agent',
    desc: (
      <>
        A <strong>voice AI dispatch agent</strong> for a demo logistics app. Place a call and it looks up loads, assigns carriers, <span className="bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">negotiates freight rates</span>, and submits quotes while you talk to it. It uses an <strong>LLM planner with MCP tools</strong> and <span className="underline decoration-wavy decoration-emerald-400">RAG over load and carrier data</span>, streams audio over a long-lived WebSocket, and keeps the call alive as you move between pages. Live demo at <a href="https://jarvis.whoisdhruv.com" target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded ring-1 ring-emerald-300/60 dark:ring-emerald-700/60 transition-colors hover:bg-emerald-200 dark:hover:bg-emerald-800/70 hover:ring-emerald-500 hover:text-emerald-900 dark:hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">jarvis.whoisdhruv.com&nbsp;↗</a>.
      </>
    ),
    lang: 'JavaScript / Node.js',
    link: 'https://github.com/Dhruv-Mishra/AudioControlledAgenticWebsite',
    colorClass: 'bg-note-green',
    image: '/resources/audioAgent.webp',
    blurDataURL: BLUR.jarvis,
    video: '/resources/audioAgent.mp4',
    icon: Mic,
    label: 'Voice Agent',
    stack: ['Voice AI', 'MCP', 'RAG', 'Tool Calling', 'WebSockets', 'Node.js', 'AudioWorklet'],
    role: 'Full Stack + Voice AI',
    year: '2026',
    duration: 'Ongoing',
    highlights: [
      'Takes real actions in the app through tool calls: load lookups, carrier assignment, rate negotiation, and quotes',
      'Phone-call UX with barge-in, personas, and phone-line audio filtering; the call survives page changes',
      'Try it live at jarvis.whoisdhruv.com',
    ],
  },
  {
    slug: 'personal-portfolio',
    name: 'This Portfolio',
    desc: (
      <>
        The site you&apos;re on. Its main feature is a <strong>live voice agent</strong> you can talk to and <span className="underline decoration-wavy decoration-amber-400">interrupt mid-sentence</span>: full-duplex audio over a WebSocket, with <span className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">25+ tools</span> to navigate pages, open projects, fill forms, and run terminal commands for you. There&apos;s also a <strong>RAG chatbot</strong> with 5 selectable LLMs, one of them self-hosted, a <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">retro terminal</span>, and a hand-drawn sketchbook look. Built with <span className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-1.5 py-0.5 rounded text-sm">Next.js 16</span> and deployed as Docker images through GitHub Actions. Live at <a href="https://whoisdhruv.com" target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded ring-1 ring-indigo-300/60 dark:ring-indigo-700/60 transition-colors hover:bg-indigo-200 dark:hover:bg-indigo-800/70 hover:ring-indigo-500 hover:text-indigo-900 dark:hover:text-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">whoisdhruv.com&nbsp;↗</a>.
      </>
    ),
    lang: 'Next.js / TypeScript',
    link: 'https://github.com/Dhruv-Mishra/portfolioWebsite',
    colorClass: 'bg-note-blue',
    image: '/resources/PersonalPortfolio.webp',
    blurDataURL: BLUR.portfolio,
    icon: Globe,
    label: 'This Website',
    stack: ['Next.js', 'React', 'TypeScript', 'Gemini Live', 'RAG', 'Docker', 'GitHub Actions'],
    role: 'Full Stack + Voice AI',
    year: '2025',
    duration: 'Ongoing',
    highlights: [
      'Full-duplex voice agent with 25+ site tools that can navigate, fill forms, and run commands',
      'RAG chatbot over a curated fact base with 5 selectable LLMs, one of them self-hosted',
      'Docker images built and deployed by GitHub Actions to Linux VMs behind Nginx and Cloudflare',
    ],
  },
  {
    slug: 'cropio',
    name: 'Cropio',
    desc: (
      <>
        A <strong>privacy-conscious AI portrait cropper</strong> built to turn raw photos into polished headshots. It blends <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">YOLO11 pose estimation</span> with <span className="bg-sky-100 dark:bg-sky-900/50 px-1 rounded">face-orientation detection</span> to capture <em>different angles of the face</em> and generate multiple headshot crops, plus a precise <em>interactive crop editor</em> and <span className="underline decoration-wavy decoration-sky-400">semantic archive search</span> so users can upload, refine, and export professional crops with <span className="font-semibold">full-resolution rendering in the browser</span>. Live at <a href="https://cropio.whoisdhruv.com" target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/50 px-1.5 py-0.5 rounded ring-1 ring-sky-300/60 dark:ring-sky-700/60 transition-colors hover:bg-sky-200 dark:hover:bg-sky-800/70 hover:ring-sky-500 hover:text-sky-900 dark:hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">cropio.whoisdhruv.com&nbsp;↗</a>.
      </>
    ),
    lang: 'Next.js / FastAPI',
    link: 'https://github.com/Dhruv-Mishra/Cropio-ImageEditor',
    colorClass: 'bg-note-green',
    image: '/resources/Cropio.webp',
    blurDataURL: BLUR.cropio,
    video: '/resources/Cropio.mp4',
    icon: Scissors,
    label: 'AI Cropper',
    stack: ['Next.js', 'TypeScript', 'FastAPI', 'YOLO11 Pose', 'IndexedDB', 'NVIDIA APIs'],
    role: 'Full Stack + AI',
    year: '2026',
    duration: 'Ongoing',
    highlights: [
      'Generates multiple portrait crop suggestions with pose detection and deterministic fallbacks',
      'Supports drag-resize editing, aspect ratio presets, and full-resolution browser exports',
      'Adds AI descriptions and semantic search over saved sessions via local IndexedDB embeddings',
    ],
  },
  {
    slug: 'fluent-ui-android',
    name: 'Fluent UI Android',
    desc: (
      <>
        Microsoft&apos;s open-source <strong>Jetpack Compose</strong> component library for building <span className="underline decoration-wavy decoration-blue-400">Microsoft 365</span> Android apps. As its <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">primary maintainer</span> I shipped 10 releases used by Copilot, Office, Outlook, OneDrive, and Teams, and owned the library&apos;s security compliance.
      </>
    ),
    lang: 'Kotlin / Java',
    link: 'https://github.com/microsoft/fluentui-android',
    colorClass: 'bg-note-yellow',
    image: '/resources/FluentUI.webp',
    blurDataURL: BLUR.fluentUI,
    icon: Smartphone,
    label: 'Android Lib',
    stack: ['Kotlin', 'Java', 'Android SDK', 'Jetpack Compose', 'XML', 'Gradle', 'Maven'],
    role: 'Android',
    year: '2024',
    duration: '6 months',
    highlights: [
      'Primary maintainer; shipped 10 releases',
      'Used by Copilot, Office, Outlook, OneDrive, and Teams',
      'Owned the library\'s security compliance',
    ],
  },
  {
    slug: 'hybrid-recommender',
    name: 'Hybrid Recommender',
    desc: (
      <>
        A context-aware <span className="underline decoration-wavy decoration-pink-400">movie recommendation engine</span> that integrates <strong>collaborative</strong>, <span className="bg-purple-100 dark:bg-purple-900/50 px-1 rounded">content-based</span>, and demographic filtering to solve the <em>cold-start problem</em> and personalize content for diverse user groups.
      </>
    ),
    lang: 'Python / ML',
    link: 'https://github.com/Dhruv-Mishra/Age-and-Context-Sensitive-Hybrid-Entertaintment-Recommender-System',
    colorClass: 'bg-note-purple',
    image: '/resources/HybridRecommender.webp',
    blurDataURL: BLUR.recommender,
    icon: Film,
    label: 'Movie Night',
    stack: ['Python', 'Scikit-Learn', 'Pandas', 'SVD', 'TensorFlow'],
    role: 'Machine Learning',
    year: '2023',
    duration: '3 months',
    highlights: [
      'Hybrid engine combining collaborative, content-based, and demographic filtering',
      'Designed to solve the cold-start problem in recommendation systems',
      'Personalizes content for diverse user groups',
    ],
  },
  {
    slug: 'bloom-filter-research',
    name: 'Bloom Filter Research',
    desc: (
      <>
        Undergraduate research at IIIT Delhi&apos;s <strong>Distributed Computing Lab</strong> on <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded border border-blue-200 dark:border-blue-700">Counting Bloom Filters</span> under <span className="underline decoration-wavy decoration-blue-400">high contention</span>. I built a lock-free C++ filter with <em>relaxed synchronization</em> that reached <span className="text-emerald-600 dark:text-emerald-400 font-bold underline decoration-double decoration-emerald-400">3x the baseline throughput</span>.
      </>
    ),
    lang: 'Research / C++',
    link: 'https://repository.iiitd.edu.in/jspui/handle/123456789/1613',
    colorClass: 'bg-note-gray',
    image: '/resources/BloomFilter.webp',
    blurDataURL: BLUR.bloom,
    icon: ScrollText,
    label: 'Research Paper',
    stack: ['C++', 'Bloom Filters', 'Concurrency', 'Optimization', 'Data Structures'],
    role: 'Algorithms and Systems',
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
    name: 'IVC - Vital Checkup',
    desc: (
      <>
        A <span className="bg-green-100 dark:bg-green-900/50 px-1 rounded">contactless</span>, <strong>computer-vision powered</strong> health screening kiosk that <span className="underline decoration-wavy decoration-teal-400">automates patient triage</span>. Using <span className="font-mono text-sm bg-teal-100 dark:bg-teal-900/50 px-1 rounded border border-teal-200 dark:border-teal-700">OpenCV</span>, it calculates <em>height, weight, BMI, and pulse</em> from a distance, <span className="text-red-600 dark:text-red-400 font-bold underline decoration-wavy decoration-red-300">drastically reducing wait times</span>.
      </>
    ),
    lang: 'Python / OpenCV',
    link: 'https://github.com/Dhruv-Mishra/Instant-Vital-Checkup-IVC',
    colorClass: 'bg-note-green',
    image: '/resources/InstantVitalCheckup.webp',
    blurDataURL: BLUR.ivc,
    icon: Activity,
    label: 'Vitals Scan',
    stack: ['Python', 'OpenCV', 'Computer Vision', 'HealthTech', 'Real-time Processing'],
    role: 'Computer Vision',
    year: '2023',
    duration: '4 months',
    highlights: [
      'Contactless measurement of height, weight, BMI, and pulse via single camera',
      'Real-time computer vision pipeline using OpenCV and MediaPipe',
    ],
  },
  {
    slug: 'course-evaluator',
    name: 'Course Evaluator',
    desc: (
      <>
        A Python tool that finds <span className="underline decoration-wavy decoration-orange-400">overlapping course content</span> across university curriculums. It uses <span className="bg-yellow-200 dark:bg-yellow-800/50 px-1 rounded">fuzzy matching</span> and <span className="italic">text similarity</span> to flag modules that cover the same material, so students don&apos;t end up <span className="underline decoration-double decoration-amber-500">taking the same course twice</span>.
      </>
    ),
    lang: 'Python',
    link: 'https://github.com/Dhruv-Mishra/Course-Similarity-Evaluator',
    colorClass: 'bg-note-orange',
    image: '/resources/CourseEvaluator.webp',
    blurDataURL: BLUR.courseEval,
    icon: Search,
    label: 'Overlap Detector',
    stack: ['Python', 'Fuzzy Logic', 'NLP', 'Data Analysis', 'Algorithm Design'],
    role: 'Algorithms and Machine Learning',
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
    desc: (
      <>
        A secure, <strong className="text-blue-700 dark:text-blue-400">ACID-compliant</strong> banking database built for <span className="underline decoration-wavy decoration-green-400">high-reliability transactions</span>. Features <span className="italic">multi-user architecture</span> with strict <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">role-based security</span>.
      </>
    ),
    lang: 'Java / MySQL',
    link: 'https://github.com/Dhruv-Mishra/AtomVault',
    colorClass: 'bg-note-blue',
    image: '/resources/AtomVault.webp',
    blurDataURL: BLUR.atomVault,
    icon: Database,
    label: 'Bank Vault',
    stack: ['Java', 'MySQL', 'JDBC', 'OOP', 'ACID Compliance'],
    role: 'Full Stack',
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