import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | Dhruv Mishra',
  description: 'Learn about Dhruv Mishra — Software Engineer at Microsoft working across AI-forward software engineering, production systems, infrastructure optimization, and competitive programming.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About | Dhruv Mishra',
    description: 'Learn about Dhruv Mishra — Software Engineer at Microsoft working across AI and software engineering.',
    url: 'https://whoisdhruv.com/about',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
