export const VALID_NAVIGATION_PATHS = ['/', '/about', '/projects', '/chat', '/guestbook', '/stickers', '/settings'] as const;

export type NavigationPath = (typeof VALID_NAVIGATION_PATHS)[number];

/** The resume is a note on the About pin board, not a page. */
export const RESUME_NOTE_PATH = '/about#resume';

// Action and tool targets; pathname-based route detection keeps using VALID_NAVIGATION_PATHS.
export const NAVIGATION_TARGETS = [...VALID_NAVIGATION_PATHS, RESUME_NOTE_PATH] as const;

export type NavigationTarget = (typeof NAVIGATION_TARGETS)[number];
