export type SiteAskPage =
  | 'home'
  | 'about'
  | 'projects'
  | 'resume'
  | 'chat'
  | 'guestbook'
  | 'stickers'
  | 'settings';

const GREETINGS: Record<SiteAskPage, readonly string[]> = {
  home: [
    "I see you're on the sketchbook cover — what do you wanna know?",
    'Want a tour of the sketchbook?',
    'What should I show you first?',
  ],
  about: [
    "I see you're looking at my story — what do you wanna know?",
    'Want the story behind one of these pages?',
    'Curious how I got here?',
  ],
  projects: [
    "I see you're looking at my projects — what do you wanna know?",
    "Pick a project and I'll walk you through it.",
    'Want the short version or the technical deep dive?',
  ],
  resume: [
    "I see you're looking at my resume, what do you wanna know?",
    'Want me to unpack any part of my experience?',
    'Ask me about a role, a stack, or anything on that page.',
  ],
  chat: [
    'You can ask me directly here.',
    'Want to talk this through?',
  ],
  guestbook: [
    'Want to know who signed the page?',
    'Have something you want to leave behind?',
  ],
  stickers: [
    'Want the story behind one of these stickers?',
    'Which sticker caught your eye?',
  ],
  settings: [
    'Need a hand with sound, theme, or how the site works?',
    'Want me to tweak volume or walk you through a setting?',
  ],
};

const PATH_TO_PAGE: Record<string, SiteAskPage> = {
  '/': 'home',
  '/about': 'about',
  '/projects': 'projects',
  '/resume': 'resume',
  '/chat': 'chat',
  '/guestbook': 'guestbook',
  '/stickers': 'stickers',
  '/settings': 'settings',
};

export function askPageFromPathname(pathname: string | null | undefined): SiteAskPage {
  if (!pathname) return 'home';
  return PATH_TO_PAGE[pathname] ?? 'home';
}

export function pickAskGreeting(
  page: SiteAskPage,
  random: () => number = Math.random,
): string {
  const pool = GREETINGS[page];
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index];
}
