import { parseMarks } from '@/lib/markedText';

const MARK_CLASS = { strong: 'mark-strong', highlight: 'mark-highlight', wavy: 'mark-wavy' } as const;

/** Renders `**strong**`, `==highlight==` and `~~wavy~~` marks; styles live with the surface that uses them. */
export function MarkedText({ text }: { text: string }) {
  return parseMarks(text).map((segment, index) => (
    segment.mark
      ? <span key={index} className={MARK_CLASS[segment.mark]}>{segment.text}</span>
      : segment.text
  ));
}
