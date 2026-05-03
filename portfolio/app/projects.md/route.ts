import { buildProjectsMarkdown } from '@/lib/llmContent.server';

export const dynamic = 'force-static';

export function GET() {
  return new Response(buildProjectsMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-Robots-Tag': 'index, follow',
      'Link': '<https://whoisdhruv.com/projects>; rel="canonical"',
    },
  });
}
