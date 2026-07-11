export const TTS_LLM_RULES = `Speech-safe reply text:
- Write plain prose that also sounds natural when read aloud by the local voice engine.
- Prefer short, speech-safe replies; keep sentences compact so streaming audio starts quickly.
- Avoid raw URLs, markdown tables, code fences, emoji, symbol-heavy shorthand, and decorative punctuation.
- Expand tech names naturally when useful, e.g. Next.js as Next J S, Node.js as Node J S, C++ as C plus plus.`;

export const TTS_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDhruv\s+Mishra\b/gi, 'Dhroove. Misshra.'],
  [/\bDhruv\b/gi, 'Dhroove'],
  [/\bMishra\b/gi, 'Misshra'],
  [/\bNext\.js\b/gi, 'Next J S'],
  [/\bNode\.js\b/gi, 'Node J S'],
  [/\bReact\.js\b/gi, 'React J S'],
  [/C\+\+/g, 'C plus plus'],
  [/C#/g, 'C sharp'],
  [/\bTypeScript\b/g, 'Type Script'],
  [/\bJavaScript\b/g, 'Java Script'],
  [/\bAPI\b/g, 'A P I'],
  [/\bLLM\b/g, 'L L M'],
  [/\bTTS\b/g, 'T T S'],
  [/\bUI\b/g, 'U I'],
  [/\bUX\b/g, 'U X'],
  [/\bCLI\b/g, 'C L I'],
  [/\bVM\b/g, 'V M'],
  [/\bCPU\b/g, 'C P U'],
  [/\bGPU\b/g, 'G P U'],
];

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code omitted ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' image omitted ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[>*_~]/g, ' ');
}

function simplifyLinks(text: string): string {
  return text
    .replace(/https?:\/\/(?:www\.)?([^/\s)]+)[^\s)]*/gi, (_match, host: string) => ` link to ${String(host)} `)
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, ' email address ');
}

export function adaptTextForSpeech(text: string): string {
  let spoken = simplifyLinks(stripMarkdown(text));

  for (const [pattern, replacement] of TTS_REPLACEMENTS) {
    spoken = spoken.replace(pattern, replacement);
  }

  return spoken
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ')
    .replace(/[→←↑↓⇒]/g, ' ')
    .replace(/[{}[\]|<>]/g, ' ')
    .replace(/[\/\\]/g, ' ')
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}
