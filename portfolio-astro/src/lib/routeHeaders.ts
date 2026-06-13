export const MARKDOWN_RESPONSE_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  'X-Robots-Tag': 'index, follow',
} as const;

export function markdownHeaders(canonicalPath?: string) {
  return canonicalPath
    ? { ...MARKDOWN_RESPONSE_HEADERS, Link: `<https://whoisdhruv.com${canonicalPath}>; rel="canonical"` }
    : MARKDOWN_RESPONSE_HEADERS;
}