import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects | Dhruv Mishra',
  description: 'Explore projects by Dhruv Mishra — Jarvis voice agent, Fluent UI Android, Cropio, Course Evaluator, IVC, AtomVault, Bloom Filter research, and more.',
  alternates: {
    canonical: '/projects',
  },
  openGraph: {
    title: 'Projects | Dhruv Mishra',
    description: 'Explore projects by Dhruv Mishra — Jarvis voice agent, Fluent UI Android, Cropio, and research in concurrent data structures.',
    url: 'https://whoisdhruv.com/projects',
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
