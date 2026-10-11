import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/Loading';
import { pageMetadata } from '@/lib/pageMetadata';

export const metadata = pageMetadata({
  title: 'Projects | Dhruv Mishra',
  description: 'Projects by Dhruv Mishra: Invoke (voice-controlled coding agents), Jarvis (a voice dispatch agent), this site\'s live voice agent, Fluent UI Android, and concurrency research.',
  path: '/projects',
});

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading projects..." />}>
      {children}
    </Suspense>
  );
}
