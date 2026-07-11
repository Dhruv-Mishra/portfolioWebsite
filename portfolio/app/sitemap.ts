import { MetadataRoute } from 'next'

export const dynamic = 'force-static'

// `lastModified` intentionally omitted: this sitemap is `force-static` and
// served behind a long Cloudflare cache, so a build-time `new Date()` would
// pin every entry to the deploy timestamp regardless of actual content
// changes. Google handles missing `lastModified` cleanly.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://whoisdhruv.com'

  return [
    { url: baseUrl, changeFrequency: 'monthly', priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/projects`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/resume`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/chat`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/guestbook`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${baseUrl}/stickers`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/settings`, changeFrequency: 'monthly', priority: 0.3 },
    // LLM/AI-crawler markdown surfaces (https://llmstxt.org). Listed in the
    // sitemap so traditional search crawlers also discover them — useful for
    // Google's AI Overviews and Bing's answer engine which both ingest .md.
    { url: `${baseUrl}/llms.txt`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/llms-full.txt`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/index.md`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/about.md`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/projects.md`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${baseUrl}/resume.md`, changeFrequency: 'monthly', priority: 0.4 },
  ]
}
