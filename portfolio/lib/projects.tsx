import type { ComponentType, ReactNode } from 'react';
import { Activity, Database, Film, Globe, ScrollText, Scissors, Search, Smartphone } from 'lucide-react';
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
  fluentUI: 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4IBwAAABQAQCdASoIAAgABUB8JZQABDOAAP7uN/bvFwAA',
  courseEval: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4ICAAAAAwAQCdASoIAAgABUB8JZwAA3AA/u7J1N6Mc7LOBAAAAA==',
  ivc: 'data:image/webp;base64,UklGRmoAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4IBwAAAAwAQCdASoIAAgABwB8JZwAA3AA/u6WCQLPOBAA',
  portfolio: 'data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAACQAQCdASoIAAgABUB8JZwAAudZPNwA/t6YoJcA0BAAAA==',
  recommender: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4ICAAAAAwAQCdASoIAAgABUB8JZQAA3AA/uxjjE3P2PxDd6EAAA==',
  atomVault: 'data:image/webp;base64,UklGRmwAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4IB4AAAAwAQCdASoIAAgABUB8JZwAA3AA/u4CK3YKb4UQgAA=',
  bloom: 'data:image/webp;base64,UklGRm4AAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSCgAAAABJ6AgbQPGv+V2x0ZERAOHQbaRXmEKU5jC+Vu9Q0T/s0oV4B6A6rYBVlA4ICAAAACQAQCdASoIAAgABUB8JZQAAp1HJ1wA/udBgwKu8XAAAA==',
  cropio: 'data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAACwAQCdASoIAAgAAiBcJ6QAAueL+W5AAP14/5IM77pOBXw46E0Q80/owcgkyaUCAAA=',
} as const;

export const PROJECTS: ProjectRecord[] = [
  {
    slug: 'fluent-ui-android',
    name: 'Fluent UI Android',
    desc: (
      <>
        A <strong>comprehensive</strong> native Android library enabling developers to build <span className="underline decoration-wavy decoration-blue-400">uniform Microsoft 365</span> experiences. It offers a robust collection of <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">official Fluent design</span> tokens, <em>typography styles</em>, and custom controls, ensuring <span className="underline decoration-dotted decoration-gray-400">seamless integration</span> with the Microsoft ecosystem.
      </>
    ),
    lang: 'Kotlin / Java',
    link: 'https://github.com/microsoft/fluentui-android',
    colorClass: 'bg-note-yellow',
    image: '/resources/FluentUI.webp',
    blurDataURL: BLUR.fluentUI,
    icon: Smartphone,
    label: 'Android Lib',
    stack: ['Kotlin', 'Java', 'Android SDK', 'Design Systems', 'Clean Architecture', 'API Design'],
    role: 'Android',
    year: '2024',
    duration: '6 months',
    highlights: [
      'Contributed to the official Microsoft Fluent UI Android library used by 100M+ users',
      'Implemented custom Fluent design tokens and typography system',
      'Worked closely with designers on the Microsoft 365 design system',
    ],
  },
  {
    slug: 'course-evaluator',
    name: 'Course Evaluator',
    desc: (
      <>
        An <strong>intelligent Python tool</strong> designed to detect <span className="underline decoration-wavy decoration-orange-400">redundant course content</span> across university curriculums. By leveraging <span className="bg-yellow-200 dark:bg-yellow-800/50 px-1 rounded">fuzzy matching</span> and <span className="italic">text similarity algorithms</span>, it helps students and faculty identify overlapping modules, <span className="underline decoration-double decoration-amber-500">optimizing course selection</span>.
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
    slug: 'personal-portfolio',
    name: 'Personal Portfolio',
    desc: (
      <>
        A <strong>high-performance</strong> portfolio website built with <span className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-1.5 py-0.5 rounded text-sm">Next.js 16</span>. Features a custom <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">terminal interface</span>, <span className="underline decoration-wavy decoration-amber-400">AI-powered chat</span>, and a <span className="italic">hand-drawn aesthetic</span>. <span className="underline decoration-wavy decoration-indigo-400">Georedundant</span> — hosted on multiple VMs across the globe with a traffic manager and separate <span className="font-semibold">GitHub Actions</span> deployment pipelines. Runs on combined infrastructure from <span className="text-orange-600 dark:text-orange-400 font-semibold">Oracle Cloud</span>, <span className="text-blue-600 dark:text-blue-400 font-semibold">GCP</span>, and <span className="text-sky-600 dark:text-sky-400 font-semibold">Azure</span> — entirely free, only paying for the domain.
      </>
    ),
    lang: 'Next.js / TypeScript',
    link: 'https://github.com/Dhruv-Mishra/portfolio-website',
    colorClass: 'bg-note-blue',
    image: '/resources/PersonalPorfolio.webp',
    blurDataURL: BLUR.portfolio,
    icon: Globe,
    label: 'This Website',
    stack: ['Next.js', 'TypeScript', 'TailwindCSS', 'Framer Motion', 'Performance Optimization'],
    role: 'Full Stack',
    year: '2025',
    duration: 'Ongoing',
    highlights: [
      'Hand-drawn sketchbook aesthetic with custom pencil/chalk cursor',
      'AI-powered chat and interactive terminal built from scratch',
      'Georedundant deployment across Oracle Cloud, GCP, and Azure',
    ],
  },
  {
    slug: 'cropio',
    name: 'Cropio',
    desc: (
      <>
        A <strong>privacy-conscious AI portrait cropper</strong> built to turn raw photos into polished headshots. It blends <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">YOLO11 pose estimation</span>, a precise <em>interactive crop editor</em>, and <span className="underline decoration-wavy decoration-sky-400">semantic archive search</span> so users can upload, refine, and export professional crops with <span className="font-semibold">full-resolution rendering in the browser</span>.
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
    slug: 'hybrid-recommender',
    name: 'Hybrid Recommender',
    desc: (
      <>
        A smart <span className="underline decoration-wavy decoration-pink-400">movie recommendation engine</span> for <strong>family movie nights</strong>. It balances <em>individual preferences</em> with <span className="bg-purple-100 dark:bg-purple-900/50 px-1 rounded">group dynamics</span> and <span className="underline decoration-double decoration-purple-400">age-appropriateness ratings</span>, ensuring everyone finds something enjoyable together.
      </>
    ),
    lang: 'Python / ML',
    link: 'https://github.com/Dhruv-Mishra/Age-and-Context-Sensitive-Hybrid-Entertaintment-Recommender-System',
    colorClass: 'bg-note-purple',
    image: '/resources/HybridRecommender.webp',
    blurDataURL: BLUR.recommender,
    icon: Film,
    label: 'Movie Night',
    stack: ['Python', 'Scikit-Learn', 'Collaborative Filtering', 'ML System Design'],
    role: 'Machine Learning',
    year: '2023',
    duration: '3 months',
    highlights: [
      'Hybrid engine combining collaborative and content-based filtering',
      'Age-appropriateness scoring for family-safe recommendations',
      'Group preference balancing algorithm for multi-user sessions',
    ],
  },
  {
    slug: 'bloom-filter-research',
    name: 'Bloom Filter Research',
    desc: (
      <>
        Research at <strong>DCLL</strong> focusing on optimizing <span className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded border border-blue-200 dark:border-blue-700">Counting Bloom Filters</span> for <span className="underline decoration-wavy decoration-blue-400">high-concurrency systems</span>. Achieved a massive <span className="text-emerald-600 dark:text-emerald-400 font-bold underline decoration-double decoration-emerald-400">300% throughput increase</span> via <em>relaxed synchronization</em> techniques in C++.
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
      'Published at IIIT Delhi\'s DCLL research lab',
      '300% throughput improvement via relaxed synchronization',
      'Benchmarked against state-of-the-art concurrent filter implementations',
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