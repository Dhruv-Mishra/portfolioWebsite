import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Resume | Dhruv Mishra',
  description: 'View the resume of Dhruv Mishra — Software Engineer at Microsoft with expertise in C++, C#, distributed systems, and performance optimization.',
  alternates: {
    canonical: '/resume',
  },
  openGraph: {
    title: 'Resume | Dhruv Mishra',
    description: 'Resume of Dhruv Mishra — Software Engineer at Microsoft.',
    url: 'https://whoisdhruv.com/resume',
  },
};

export default function ResumeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
