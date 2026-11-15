export type ExperienceTimelineCategory = 'work' | 'internship' | 'research' | 'education' | 'achievement';

export interface ExperienceTimelineEntry {
  id: string;
  category: ExperienceTimelineCategory;
  dateLabel: string;
  title: string;
  organization: string;
  location: string;
  impact: string;
  highlights: readonly string[];
  tools: readonly string[];
}

export const experienceTimelineEntries: readonly ExperienceTimelineEntry[] = [
  {
    id: 'microsoft-current',
    category: 'work',
    dateLabel: 'Jun 2024 – now',
    title: 'Software Engineer, Microsoft',
    organization: 'Microsoft',
    location: 'Noida, India',
    impact: 'Triage agents cut manual on-call triage 40%. Saved $240K a year on Azure.',
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
    dateLabel: 'Feb – Jun 2024',
    title: 'ML Engineer, growIndigo',
    organization: 'growIndigo',
    location: 'Delhi, India',
    impact: 'Took crop-classification accuracy from 80% to 93%.',
    highlights: [
      'Replaced a manual Google Earth Engine crop-classification workflow with a Python pipeline built on XGBoost and Random Forest.',
    ],
    tools: ['Python', 'XGBoost', 'Random Forest', 'Google Earth Engine', 'Scikit-Learn'],
  },
  {
    id: 'microsoft-intern',
    category: 'internship',
    dateLabel: 'May – Jul 2023',
    title: 'SWE Intern, Microsoft Loop',
    organization: 'Microsoft Loop',
    location: 'Noida, India',
    impact: 'Built the backend later shared by all Loop third-party integrations.',
    highlights: [
      'Built a TypeScript connection-management backend that syncs Jira, Trello, and GitHub connection state for Microsoft Loop.',
      'Integrated the GitHub and Azure DevOps REST APIs into the Microsoft Power Platform Connector and raised module test coverage to over 60%.',
    ],
    tools: ['TypeScript', 'REST APIs', 'GitHub APIs', 'Azure DevOps', 'Power Platform', 'Microsoft Loop'],
  },
  {
    id: 'dcll-research',
    category: 'research',
    dateLabel: '2023 – 2024',
    title: 'Undergrad Researcher, IIIT Delhi',
    organization: 'Distributed Computing Lab, IIIT Delhi',
    location: 'Delhi, India',
    impact: 'Lock-free counting Bloom filter with 3x the baseline throughput.',
    highlights: [
      'Used relaxed synchronization to trade a little strictness for much higher throughput.',
      'Kept false positive and false negative rates close to the strict baseline.',
    ],
    tools: ['C++', 'Lock-free', 'Concurrency', 'Bloom Filters', 'Benchmarking'],
  },
  {
    id: 'competitive-programming',
    category: 'achievement',
    dateLabel: '2022 – now',
    title: 'Competitive programming',
    organization: 'Codeforces, CodeChef, Google, Microsoft',
    location: 'Online + Microsoft',
    impact: 'Codeforces Expert, CodeChef 5-star, Most Voted at Microsoft Hackathon 2026.',
    highlights: [
      'Codeforces Expert with peak rating 1703 and CodeChef 5-star with peak rating 2003.',
      'Global rank 291 in Google Code Jam 2023 Round A and rank 353 in Google Kick Start 2022 Round H.',
      'Microsoft Hackathon 2026 Most Voted for "Shell Assistant", an incident-response agent, and Microsoft Hackathon 2025 Fundamental Category for "WXP ActionEase".',
      'AI Champ on the Microsoft AI Productivity team; ran workshops on multi-agent engineering and LLM automation.',
    ],
    tools: ['Algorithms', 'Data Structures', 'C++', 'AI Agents', 'Teaching'],
  },
  {
    id: 'iiit-delhi-education',
    category: 'education',
    dateLabel: 'Dec 2020 – May 2024',
    title: 'B.Tech, IIIT Delhi',
    organization: 'IIIT Delhi',
    location: 'Delhi, India',
    impact: 'Honors in CS and Applied Math, CGPA 8.96.',
    highlights: [
      'Built a Course Recommendation System, a Python NLP similarity-scoring recommender, under Prof. Dhruv Kumar.',
      'Coursework and projects across machine learning, deep learning, LLMs, systems, and applied mathematics.',
    ],
    tools: ['Computer Science', 'Applied Mathematics', 'Machine Learning', 'Deep Learning', 'LLMs'],
  },
];
