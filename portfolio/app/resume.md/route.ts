import { buildResumeMarkdown } from '@/lib/llmContent.server';

export const dynamic = 'force-static';

export function GET() {
  return new Response(buildResumeMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-Robots-Tag': 'index, follow',
      'Link': '<https://whoisdhruv.com/resume>; rel="canonical"',
    },
  });
}
