import { PERSONAL_LINKS, SITE } from '@/lib/links';

export interface PageMetadata {
  title: string;
  description: string;
  canonical: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  robots?: string;
}

export const DEFAULT_METADATA: PageMetadata = {
  title: 'Dhruv Mishra | AI & Software Engineer',
  description: 'Software Engineer at Microsoft working across AI-forward software engineering, high-performance systems, and production infrastructure. Builds voice agents, AI tools, distributed backends, and reliable cloud systems.',
  canonical: '/',
  openGraphTitle: 'Dhruv Mishra | AI & Software Engineer',
  openGraphDescription: 'Software Engineer at Microsoft working across AI-forward software engineering, production systems, and reliable cloud infrastructure.',
};

export const PAGE_METADATA = {
  '/': DEFAULT_METADATA,
  '/about': {
    title: 'About | Dhruv Mishra',
    description: 'Learn about Dhruv Mishra - Software Engineer at Microsoft working across AI-forward software engineering, production systems, infrastructure optimization, and competitive programming.',
    canonical: '/about',
    openGraphTitle: 'About | Dhruv Mishra',
    openGraphDescription: 'Learn about Dhruv Mishra - Software Engineer at Microsoft working across AI and software engineering.',
  },
  '/projects': {
    title: 'Projects | Dhruv Mishra',
    description: 'Explore projects by Dhruv Mishra - AI agents, voice AI, AI tooling, production web systems, recommender systems, research, and more.',
    canonical: '/projects',
    openGraphTitle: 'Projects | Dhruv Mishra',
    openGraphDescription: 'Explore projects by Dhruv Mishra - Jarvis voice agent, Cropio, AI tooling, production systems, and concurrent data-structure research.',
  },
  '/resume': {
    title: 'Resume | Dhruv Mishra',
    description: 'View the resume of Dhruv Mishra - Software Engineer at Microsoft focused on AI-forward software engineering, production systems, distributed systems, and infrastructure optimization.',
    canonical: '/resume',
    openGraphTitle: 'Resume | Dhruv Mishra',
    openGraphDescription: 'Resume of Dhruv Mishra - AI-forward Software Engineer at Microsoft.',
  },
  '/chat': {
    title: 'Chat | Dhruv Mishra',
    description: 'Chat with Dhruv Mishra - ask about his work at Microsoft, projects, tech stack, hobbies, and more through an AI-powered sticky note chat.',
    canonical: '/chat',
    openGraphTitle: 'Chat | Dhruv Mishra',
    openGraphDescription: 'Chat with Dhruv Mishra through an interactive AI-powered sticky note interface.',
  },
  '/stickers': {
    title: "Sticker Drawer - Dhruv's Sketchbook",
    description: "Browse unlocked stickers and hidden achievements from Dhruv's interactive sketchbook portfolio.",
    canonical: '/stickers',
    openGraphTitle: "Sticker Drawer - Dhruv's Sketchbook",
    openGraphDescription: 'A playful achievement album for portfolio easter eggs, terminal discoveries, and hidden sketchbook moments.',
  },
  '/guestbook': {
    title: 'Guestbook | Dhruv Mishra',
    description: "Leave your mark on the wall - sign Dhruv's sketchbook guestbook and see notes from other visitors.",
    canonical: '/guestbook',
    openGraphTitle: 'Guestbook | Dhruv Mishra',
    openGraphDescription: 'Leave a note on the wall and see what others have written.',
  },
  '/admin': {
    title: '404 Not Found | Dhruv Mishra',
    description: 'Page not found.',
    canonical: '/admin',
    openGraphTitle: '404 Not Found | Dhruv Mishra',
    openGraphDescription: 'Page not found.',
    robots: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
  },
  '/matrix-notes': {
    title: '404 Not Found | Dhruv Mishra',
    description: 'Page not found.',
    canonical: '/matrix-notes',
    openGraphTitle: '404 Not Found | Dhruv Mishra',
    openGraphDescription: 'Page not found.',
    robots: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
  },
  '/404': {
    title: '404 Not Found | Dhruv Mishra',
    description: 'Page not found.',
    canonical: '/404',
    openGraphTitle: '404 Not Found | Dhruv Mishra',
    openGraphDescription: 'Page not found.',
    robots: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
  },
} satisfies Record<string, PageMetadata>;

export const STRUCTURED_DATA_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE.url}/#website`,
      url: SITE.url,
      name: 'Dhruv Mishra Portfolio',
      description: 'AI-forward software engineer at Microsoft building practical AI tools, high-performance systems, and reliable production infrastructure.',
      publisher: { '@id': 'https://whoisdhruv.com/#person' },
    },
    {
      '@type': 'Person',
      '@id': `${SITE.url}/#person`,
      name: SITE.name,
      url: SITE.url,
      jobTitle: 'Software Engineer',
      worksFor: { '@type': 'Organization', name: 'Microsoft' },
      description: 'Software Engineer at Microsoft working across AI-forward software engineering, production systems, and performance-critical infrastructure.',
      knowsAbout: ['AI agents', 'LLM tooling', 'voice AI', 'production systems', 'distributed systems', 'performance optimization', 'cloud infrastructure'],
      sameAs: [PERSONAL_LINKS.linkedin, PERSONAL_LINKS.github],
    },
  ],
});

export function getPageMetadata(pathname: string): PageMetadata {
  return PAGE_METADATA[pathname as keyof typeof PAGE_METADATA] ?? DEFAULT_METADATA;
}