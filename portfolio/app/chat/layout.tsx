import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat | Dhruv Mishra',
  description: 'Chat with Dhruv Mishra — ask about his work at Microsoft, projects, tech stack, hobbies, and more through an AI-powered sticky note chat.',
  alternates: {
    canonical: '/chat',
  },
  openGraph: {
    title: 'Chat | Dhruv Mishra',
    description: 'Chat with Dhruv Mishra through an interactive AI-powered sticky note interface.',
    url: 'https://whoisdhruv.com/chat',
  },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
