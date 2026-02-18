import type { Metadata } from 'next';
import ResumePage from '@/components/ResumePage';

export const metadata: Metadata = {
    title: 'Resume | Dhruv Mishra',
    description: 'Resume of Dhruv Mishra - Software Engineer at Microsoft. Experience in high-performance systems, Android development, and distributed infrastructure.',
    openGraph: {
        title: 'Resume | Dhruv Mishra',
        description: 'Resume of Dhruv Mishra - Software Engineer at Microsoft. Experience in high-performance systems and distributed infrastructure.',
        url: 'https://whoisdhruv.com/resume',
    },
    alternates: {
        canonical: '/resume',
    },
};

export default function ResumePageWrapper() {
    return <ResumePage />;
}
