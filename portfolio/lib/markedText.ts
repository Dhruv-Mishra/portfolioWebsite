/**
 * Inline marks for short copy: `**strong**`, `==highlight==` (marker pen) and `~~wavy underline~~`.
 * Keeps project copy as plain strings, so it stays serializable and readable in data files.
 */
export type Mark = 'strong' | 'highlight' | 'wavy';

export interface MarkedSegment {
  text: string;
  mark: Mark | null;
}

const TOKEN = /(\*\*|==|~~)(.+?)\1/g;
const MARKS: Record<string, Mark> = { '**': 'strong', '==': 'highlight', '~~': 'wavy' };

export function parseMarks(source: string): MarkedSegment[] {
  const segments: MarkedSegment[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    if (match.index > last) segments.push({ text: source.slice(last, match.index), mark: null });
    segments.push({ text: match[2], mark: MARKS[match[1]] });
    last = match.index + match[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last), mark: null });
  return segments;
}

export function stripMarks(source: string): string {
  return source.replace(TOKEN, '$2');
}
