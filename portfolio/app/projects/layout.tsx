import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects | Dhruv Mishra',
  description: 'Explore projects by Dhruv Mishra — AI agents, voice AI, AI tooling, production web systems, recommender systems, research, and more.',
  alternates: {
    canonical: '/projects',
  },
  openGraph: {
    title: 'Projects | Dhruv Mishra',
    description: 'Explore projects by Dhruv Mishra — Jarvis voice agent, Cropio, AI tooling, production systems, and concurrent data-structure research.',
    url: 'https://whoisdhruv.com/projects',
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
