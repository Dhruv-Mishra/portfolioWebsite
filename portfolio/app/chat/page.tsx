import type { Metadata } from 'next';
import ChatPage from '@/components/ChatPage';

export const metadata: Metadata = {
    title: 'Chat with Dhruv | Dhruv Mishra',
    description: 'Chat with Dhruv Mishra — ask about his work at Microsoft, projects, tech stack, competitive programming, or anything else. AI-powered sticky note chat.',
    openGraph: {
        title: 'Chat with Dhruv | Dhruv Mishra',
        description: 'Chat with Dhruv Mishra — ask about his work at Microsoft, projects, tech stack, and more.',
        url: 'https://whoisdhruv.com/chat',
    },
    alternates: {
        canonical: '/chat',
    },
};

export default function ChatPageWrapper() {
    return <ChatPage />;
}
