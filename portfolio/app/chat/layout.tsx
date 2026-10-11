import { pageMetadata } from '@/lib/pageMetadata';

export const metadata = pageMetadata({
  title: 'Chat | Dhruv Mishra',
  description: 'Ask Dhruv Mishra about his work at Microsoft, his projects, tech stack, or hobbies. Answers come from a RAG chatbot grounded in facts about him.',
  path: '/chat',
});

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
