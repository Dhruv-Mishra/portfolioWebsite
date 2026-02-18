import type { Metadata } from 'next';
import AboutPage from '@/components/AboutPage';

export const metadata: Metadata = {
    title: 'About | Dhruv Mishra',
    description: 'Software Engineer at Microsoft on the M365 Shell Team. Building high-performance systems handling 7B+ hits/day. Expert in C++, C#, TypeScript, and distributed systems.',
    openGraph: {
        title: 'About | Dhruv Mishra',
        description: 'Software Engineer at Microsoft on the M365 Shell Team. Building high-performance systems handling 7B+ hits/day.',
        url: 'https://whoisdhruv.com/about',
    },
    alternates: {
        canonical: '/about',
    },
};

export default function About() {
    return <AboutPage />;
}
