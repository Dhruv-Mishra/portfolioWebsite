export type ExperienceTimelineCategory = 'work' | 'internship' | 'research' | 'education' | 'achievement';

export interface ExperienceTimelineLogo {
  src: string;
  darkSrc?: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className?: string;
  darkClassName?: string;
  variant?: 'growindigo-wordmark';
}

export interface ExperienceTimelineEntry {
  id: string;
  category: ExperienceTimelineCategory;
  dateLabel: string;
  title: string;
  organization: string;
  location: string;
  logo?: ExperienceTimelineLogo;
  summary: string;
  impact: string;
  highlights: readonly string[];
  tools: readonly string[];
}

export const experienceTimelineEntries: readonly ExperienceTimelineEntry[] = [
  {
    id: 'microsoft-current',
    category: 'work',
    dateLabel: 'Jun 2024 - Present',
    title: 'Software Engineer',
    organization: 'Microsoft',
    location: 'Noida, India',
    logo: {
      src: '/resources/logos/microsoft.svg',
      alt: 'Microsoft',
      width: 112,
      height: 24,
      sizes: '(max-width: 640px) 88px, 112px',
    },
    summary: 'Building production AI agents and the Azure backend services they run on.',
    impact: 'Incident-triage agents that cut manual on-call triage by 40%, and $240K/year in Azure savings on a backend serving 7B+ requests a day.',
    highlights: [
      'Built and shipped LLM incident-triage agents for on-call engineers. MCP servers give the agent Kusto, service-health, and config tools, with fallback logic and human escalation. Manual low/mid-severity triage dropped 40%, measured by replaying resolved incidents.',
      'Cut Azure spend by $240K a year (15%) on a 7B+ requests/day Service Fabric backend by raising the Redis cache hit ratio from 31% to 80%, tuning Cosmos DB and log retention, and retuning autoscaling across 12+ VM Scale Sets, all within the 99.99% availability target.',
      'Shipped PDF encryption for Word, Excel, and PowerPoint in Office for the web by sandboxing a C++ encryption SDK and routing its Azure RMS calls through a C# proxy over IPC.',
      'Cut Office Android cold-start and file-open latency by about 500ms with custom baseline profiles, and Excel\'s loading shimmer from 300ms to 3ms.',
      'Primary maintainer of Fluent UI Android, Microsoft\'s open-source Jetpack Compose library: 10 releases used by Copilot, Office, Outlook, OneDrive, and Teams, plus its security compliance.',
    ],
    tools: ['C#', 'TypeScript', 'Python', 'C++', 'Kotlin', 'MCP', 'Kusto', 'Service Fabric', 'Redis', 'Cosmos DB', 'VM Scale Sets', 'Jetpack Compose'],
  },
  {
    id: 'growindigo',
    category: 'work',
    dateLabel: 'Feb 2024 - Jun 2024',
    title: 'Machine Learning Engineer',
    organization: 'growIndigo',
    location: 'Delhi, India',
    logo: {
      src: '/resources/logos/growindigo.png',
      alt: 'growIndigo',
      width: 112,
      height: 50,
      sizes: '(max-width: 640px) 88px, 112px',
      variant: 'growindigo-wordmark',
    },
    summary: 'Replaced a manual crop-classification workflow with a Python ML pipeline.',
    impact: 'Classification accuracy went from 80% to 93%.',
    highlights: [
      'Replaced a manual Google Earth Engine crop-classification workflow with a Python pipeline built on XGBoost and Random Forest.',
    ],
    tools: ['Python', 'XGBoost', 'Random Forest', 'Google Earth Engine', 'Scikit-Learn'],
  },
  {
    id: 'microsoft-intern',
    category: 'internship',
    dateLabel: 'May 2023 - Jul 2023',
    title: 'Software Engineering Intern',
    organization: 'Microsoft Loop',
    location: 'Noida, India',
    logo: {
      src: '/resources/logos/microsoft-loop.svg',
      alt: 'Microsoft Loop',
      width: 112,
      height: 28,
      sizes: '(max-width: 640px) 88px, 112px',
    },
    summary: 'Built the connection-management backend for Microsoft Loop third-party integrations.',
    impact: 'The backend was later reused as the shared service for all Loop third-party integrations.',
    highlights: [
      'Built a TypeScript connection-management backend that syncs Jira, Trello, and GitHub connection state for Microsoft Loop.',
      'Integrated the GitHub and Azure DevOps REST APIs into the Microsoft Power Platform Connector and raised module test coverage to over 60%.',
    ],
    tools: ['TypeScript', 'REST APIs', 'GitHub APIs', 'Azure DevOps', 'Power Platform', 'Microsoft Loop'],
  },
  {
    id: 'iiit-delhi-education',
    category: 'education',
    dateLabel: 'Dec 2020 - May 2024',
    title: 'B.Tech (Honors), Computer Science and Applied Mathematics',
    organization: 'IIIT Delhi',
    location: 'Delhi, India',
    logo: {
      src: '/resources/logos/iiitd.png',
      alt: 'IIIT Delhi',
      width: 128,
      height: 26,
      sizes: '(max-width: 640px) 88px, 112px',
    },
    summary: 'Computer science and applied math, with research in concurrent data structures.',
    impact: 'Graduated with Honors and a CGPA of 8.96/10.0.',
    highlights: [
      'Built a Course Recommendation System, a Python NLP similarity-scoring recommender, under Prof. Dhruv Kumar.',
      'Coursework and projects across machine learning, deep learning, LLMs, systems, and applied mathematics.',
    ],
    tools: ['Computer Science', 'Applied Mathematics', 'Machine Learning', 'Deep Learning', 'LLMs'],
  },
  {
    id: 'dcll-research',
    category: 'research',
    dateLabel: '2023 - 2024',
    title: 'Undergraduate Researcher',
    organization: 'Distributed Computing Lab, IIIT Delhi',
    location: 'Delhi, India',
    logo: {
      src: '/resources/logos/iiitd.png',
      alt: 'IIIT Delhi',
      width: 128,
      height: 26,
      sizes: '(max-width: 640px) 88px, 112px',
    },
    summary: 'Relaxed concurrent Counting Bloom Filters, under Prof. Bapi Chatterjee.',
    impact: 'Built a lock-free C++ Counting Bloom Filter with 3x the baseline throughput under high contention.',
    highlights: [
      'Used relaxed synchronization to trade a little strictness for much higher throughput.',
      'Kept false positive and false negative rates close to the strict baseline.',
    ],
    tools: ['C++', 'Lock-free', 'Concurrency', 'Bloom Filters', 'Benchmarking'],
  },
  {
    id: 'competitive-programming',
    category: 'achievement',
    dateLabel: '2022 - 2026',
    title: 'Competitive Programming, Hackathons + Leadership',
    organization: 'Codeforces, CodeChef, Google, Microsoft',
    location: 'Online + Microsoft',
    summary: 'Contest results, hackathon wins, and teaching other engineers to work with AI agents.',
    impact: 'Codeforces Expert (1703), CodeChef 5-star (2003), and Most Voted at Microsoft Hackathon 2026.',
    highlights: [
      'Codeforces Expert with peak rating 1703 and CodeChef 5-star with peak rating 2003.',
      'Global rank 291 in Google Code Jam 2023 Round A and rank 353 in Google Kick Start 2022 Round H.',
      'Microsoft Hackathon 2026 Most Voted for "Shell Assistant", an incident-response agent, and Microsoft Hackathon 2025 Fundamental Category for "WXP ActionEase".',
      'AI Champ on the Microsoft AI Productivity team; ran workshops on multi-agent engineering and LLM automation.',
    ],
    tools: ['Algorithms', 'Data Structures', 'C++', 'AI Agents', 'Teaching'],
  },
];
