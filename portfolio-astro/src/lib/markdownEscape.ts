// lib/markdownEscape.ts — Shared markdown-injection escaper.
// Used by routes that embed user-supplied text into a GitHub issue body
// (feedback, guestbook, matrix-notes) so a single fix benefits all surfaces.

/** Escape markdown-injection characters by backslash-prefixing them. */
export function sanitizeMarkdown(str: string): string {
  return str.replace(/[\[\]()@`|#*_!<>]/g, (ch) => `\\${ch}`);
}
