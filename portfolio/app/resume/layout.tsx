import { pageMetadata } from '@/lib/pageMetadata';

export const metadata = pageMetadata({
  title: 'Resume | Dhruv Mishra',
  description: 'Resume of Dhruv Mishra, Software Engineer at Microsoft: production AI agents, MCP tooling, Azure backend services, and Office performance work. View or download the PDF.',
  path: '/resume',
  socialDescription: 'Resume of Dhruv Mishra, Software Engineer at Microsoft working on AI agents and Azure backend services.',
});

export default function ResumeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
