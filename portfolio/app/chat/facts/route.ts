import path from 'node:path';

import type { BrowserChatFact } from '@/lib/browserChatPrompt';
import { loadFacts } from '@/lib/factLoader';

export const dynamic = 'force-static';

export function GET() {
  const facts: BrowserChatFact[] = loadFacts(path.resolve(process.cwd(), 'content', 'facts'))
    .map(({ id, text, tags, priority, anchor }) => ({ id, text, tags, priority, anchor }));

  return Response.json({ facts }, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
