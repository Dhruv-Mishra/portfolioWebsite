import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects | Dhruv Mishra',
  description: 'Explore projects by Dhruv Mishra — Fluent UI Android, Course Evaluator, IVC, AtomVault, Bloom Filter research, and more.',
  alternates: {
    canonical: '/projects',
  },
  openGraph: {
    title: 'Projects | Dhruv Mishra',
    description: 'Explore projects by Dhruv Mishra — from Microsoft Fluent UI to research in concurrent data structures.',
    url: 'https://whoisdhruv.com/projects',
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
