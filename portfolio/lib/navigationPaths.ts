export const VALID_NAVIGATION_PATHS = ['/', '/about', '/projects', '/resume', '/chat', '/guestbook', '/stickers', '/settings'] as const;

export type NavigationPath = (typeof VALID_NAVIGATION_PATHS)[number];
