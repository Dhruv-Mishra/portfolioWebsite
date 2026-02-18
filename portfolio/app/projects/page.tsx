import type { Metadata } from 'next';
import ProjectsPage from '@/components/ProjectsPage';

export const metadata: Metadata = {
    title: 'Projects | Dhruv Mishra',
    description: 'Projects by Dhruv Mishra - Fluent UI Android, Course Evaluator, IVC, Portfolio Website, Hybrid Recommender, AtomVault, and Bloom Filter Research.',
    openGraph: {
        title: 'Projects | Dhruv Mishra',
        description: 'Projects by Dhruv Mishra - Fluent UI Android, Portfolio Website, and more.',
        url: 'https://whoisdhruv.com/projects',
    },
    alternates: {
        canonical: '/projects',
    },
};

export default function Projects() {
    return <ProjectsPage />;
}
