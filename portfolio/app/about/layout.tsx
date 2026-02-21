import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | Dhruv Mishra',
  description: 'Learn about Dhruv Mishra — Software Engineer at Microsoft on the M365 Shell Team. Background in high-performance systems, Android development, and competitive programming.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About | Dhruv Mishra',
    description: 'Learn about Dhruv Mishra — Software Engineer at Microsoft on the M365 Shell Team.',
    url: 'https://whoisdhruv.com/about',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
