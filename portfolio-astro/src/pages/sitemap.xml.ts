import type { APIRoute } from 'astro';

export const prerender = true;

const BASE_URL = 'https://whoisdhruv.com';

const entries = [
  { path: '', changeFrequency: 'monthly', priority: '1.0' },
  { path: '/about', changeFrequency: 'monthly', priority: '0.8' },
  { path: '/projects', changeFrequency: 'weekly', priority: '0.9' },
  { path: '/resume', changeFrequency: 'monthly', priority: '0.7' },
  { path: '/chat', changeFrequency: 'weekly', priority: '0.6' },
  { path: '/guestbook', changeFrequency: 'daily', priority: '0.5' },
  { path: '/stickers', changeFrequency: 'monthly', priority: '0.3' },
  { path: '/llms.txt', changeFrequency: 'monthly', priority: '0.4' },
  { path: '/llms-full.txt', changeFrequency: 'monthly', priority: '0.4' },
  { path: '/index.md', changeFrequency: 'monthly', priority: '0.4' },
  { path: '/about.md', changeFrequency: 'monthly', priority: '0.4' },
  { path: '/projects.md', changeFrequency: 'weekly', priority: '0.4' },
  { path: '/resume.md', changeFrequency: 'monthly', priority: '0.4' },
] as const;

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] ?? character);
}

export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url>
    <loc>${escapeXml(`${BASE_URL}${entry.path}`)}</loc>
    <changefreq>${entry.changeFrequency}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-Robots-Tag': 'index, follow',
    },
  });
};