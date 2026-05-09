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
    organization: 'Microsoft, M365 Shell Team',
    location: 'Noida, India',
    logo: {
      src: '/resources/logos/microsoft.svg',
      alt: 'Microsoft',
      width: 112,
      height: 24,
      sizes: '(max-width: 640px) 88px, 112px',
    },
    summary: 'Building high-scale Shell platform systems for identity, user data, Office encryption, and internal AI workflows.',
    impact: '$240K/year infrastructure savings, 7B+ daily backend hits supported, and 99% faster Excel Compose shimmer loading.',
    highlights: [
      'Enabled PDF encryption for Office documents across Word, Excel, and PowerPoint by sandboxing a C++ encryption SDK behind a secure C# proxy plus IPC architecture for Azure Rights Management Service calls.',
      'Optimized VM Scale Sets, log retention, replication, Redis, and Cosmos settings for a Shell backend handling more than 7B hits per day.',
      'Designed LLM, MCP, and REST API workflows for Microsoft Shell Platform Identity Management Service to speed up incident mitigation and bug resolution.',
      'Re-architected Excel Compose shimmer warmup, baseline profile, and XML/Compose interactions, cutting load time from 300ms to 3ms.',
      'Served as Sole Security Compliance Owner for Office Android Shared, reaching 100% S360 compliance.',
      'Owned Fluent UI Android releases and Fluent UI System Icons publishing pipelines for partner teams including Copilot, Office, Outlook, OneDrive, and Teams.',
    ],
    tools: ['C++', 'C#', 'Azure RMS', 'IPC', 'Redis', 'Cosmos', 'MCP', 'LLMs', 'Compose'],
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
    summary: 'Rebuilt a crop-classification workflow into a faster Python ML pipeline for agricultural intelligence.',
    impact: 'Improved crop classification accuracy from 80% to 93% while shrinking a manual Google Earth Engine workflow.',
    highlights: [
      'Replaced manual Google Earth Engine classification steps with a Python pipeline built around XGBoost and Random Forest models.',
      'Made the workflow faster and easier to iterate while improving model accuracy for crop classification.',
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
    summary: 'Built connection-management infrastructure for third-party integrations across Microsoft Loop and Power Platform.',
    impact: 'The service became the generic backend for third-party integrations, and the GitHub connectors are used across major Microsoft apps.',
    highlights: [
      'Architected a connection management service that synchronized state across Jira, Trello, and GitHub integrations.',
      'Integrated GitHub and Azure DevOps REST APIs into the Microsoft Power Platform Connector to enable automated workflows.',
    ],
    tools: ['REST APIs', 'GitHub APIs', 'Azure DevOps', 'Power Platform', 'Microsoft Loop'],
  },
  {
    id: 'iiit-delhi-education',
    category: 'education',
    dateLabel: 'Dec 2020 - Jun 2024',
    title: 'B.Tech, Computer Science and Applied Mathematics',
    organization: 'IIIT Delhi',
    location: 'Delhi, India',
    logo: {
      src: '/resources/logos/iiitd.png',
      alt: 'IIIT Delhi',
      width: 112,
      height: 50,
      sizes: '(max-width: 640px) 88px, 112px',
    },
    summary: 'Studied computer science and applied mathematics with a strong systems, ML, and engineering project spine.',
    impact: 'Graduated with Academic Honors and CGPA 8.96/10.0.',
    highlights: [
      'Built a Course Recommendation System engineering project under Prof. Dhruv Kumar.',
      'Focused coursework and projects across machine learning, deep learning, LLMs, computer science, and applied mathematics.',
    ],
    tools: ['Computer Science', 'Applied Mathematics', 'Machine Learning', 'Deep Learning', 'LLMs'],
  },
  {
    id: 'dcll-research',
    category: 'research',
    dateLabel: '2023 - 2024',
    title: 'Undergraduate Researcher',
    organization: 'DCLL, IIIT Delhi',
    location: 'Delhi, India',
    logo: {
      src: '/resources/logos/iiitd.png',
      alt: 'IIIT Delhi',
      width: 112,
      height: 50,
      sizes: '(max-width: 640px) 88px, 112px',
    },
    summary: 'Worked under Prof. Bapi Chatterjee on concurrent data-structure research for Counting Bloom Filters.',
    impact: 'Achieved a 300% throughput boost with minimal impact on false positive and false negative rates.',
    highlights: [
      'Explored relaxation and concurrency techniques for Counting Bloom Filters.',
      'Balanced throughput gains against correctness tradeoffs in probabilistic data structures.',
    ],
    tools: ['C++', 'Systems Research', 'Concurrency', 'Bloom Filters', 'Performance'],
  },
  {
    id: 'competitive-programming',
    category: 'achievement',
    dateLabel: '2022 - 2024',
    title: 'Competitive Programming + Awards',
    organization: 'Codeforces, CodeChef, Microsoft',
    location: 'Online + Microsoft',
    summary: 'Kept sharpening algorithmic problem solving through contests and workplace recognition.',
    impact: 'Codeforces Expert 1703, CodeChef 5-star 2003, Google Code Jam Farewell Round A global rank 291, and Microsoft E+D FHL Award.',
    highlights: [
      'Reached Codeforces Expert with peak rating 1703 under the handle DhruvMishra.',
      'Reached CodeChef 5-star with peak rating 2003.',
      'Placed global rank 353 in Google Kick Start 2022 Round H and rank 167 in Reply Code Challenge.',
      'Won the Microsoft E+D FHL Award in the Fundamental Category for WXP ActionEase.',
    ],
    tools: ['Algorithms', 'Data Structures', 'C++', 'Problem Solving', 'Performance Thinking'],
  },
];
