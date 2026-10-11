import { pageMetadata } from '@/lib/pageMetadata';

export const metadata = pageMetadata({
  title: 'About | Dhruv Mishra',
  description: 'About Dhruv Mishra, a software engineer at Microsoft who builds production AI agents and Azure backend services. Career timeline, education, and what he works on.',
  path: '/about',
  socialDescription: 'Software engineer at Microsoft building production AI agents and Azure backend services.',
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
