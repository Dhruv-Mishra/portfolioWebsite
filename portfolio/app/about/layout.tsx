import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | Dhruv Mishra',
  description: 'Learn about Dhruv Mishra — Software Engineer at Microsoft working on Office Android performance, Fluent UI Android, infrastructure optimization, and competitive programming.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About | Dhruv Mishra',
    description: 'Learn about Dhruv Mishra — Software Engineer at Microsoft working on Office Android performance and Fluent UI Android.',
    url: 'https://whoisdhruv.com/about',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
