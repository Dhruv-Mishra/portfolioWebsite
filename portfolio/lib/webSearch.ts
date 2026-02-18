// lib/webSearch.ts - DuckDuckGo web search for chat enrichment
// Uses DuckDuckGo Instant Answer JSON API (fastest) with Lite HTML fallback.
// Returns empty array on any failure - graceful degradation, never blocks chat.

const SEARCH_TIMEOUT_MS = 3_000;
const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 2;

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Search DuckDuckGo and return top results.
 * Tries Instant Answer JSON API first (fastest), falls back to Lite HTML scraper.
 * Returns [] on any failure (timeout, parse error, blocked, captcha, etc).
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return [];

  // Try instant answer API first - returns JSON, much faster than HTML
  const instant = await searchInstantAnswer(trimmed);
  if (instant.length > 0) return instant.slice(0, MAX_RESULTS);

  // Fallback to Lite HTML scraper
  return searchLite(trimmed).then((r) => r.slice(0, MAX_RESULTS));
}

/** DuckDuckGo Instant Answer API - JSON response, sub-second typical. */
async function searchInstantAnswer(query: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const endpoint =
      'https://api.duckduckgo.com/?q=' +
      encodeURIComponent(query) +
      '&format=json&no_html=1&skip_disambig=1&no_redirect=1';
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DhruvChat/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = await res.json();
    const results: SearchResult[] = [];

    // Abstract (main answer)
    if (data.Abstract && data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText.slice(0, 300),
        url: data.AbstractURL || '',
      });
    }

    // Related topics
    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= MAX_RESULTS) break;
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0]?.slice(0, 100) || query,
            snippet: topic.Text.slice(0, 300),
            url: topic.FirstURL,
          });
        }
        // Nested subtopics
        if (Array.isArray(topic.Topics)) {
          for (const sub of topic.Topics) {
            if (results.length >= MAX_RESULTS) break;
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.split(' - ')[0]?.slice(0, 100) || query,
                snippet: sub.Text.slice(0, 300),
                url: sub.FirstURL,
              });
            }
          }
        }
      }
    }

    return results;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/** DuckDuckGo Lite HTML fallback - scrapes lite.duckduckgo.com. */
async function searchLite(query: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; DhruvChat/1.0)',
      },
      body: 'q=' + encodeURIComponent(query),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return [];

    const html = await res.text();
    return parseLiteResults(html);
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/** Parse DuckDuckGo Lite table-based HTML for search results. */
function parseLiteResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Extract result links
  const linkBlockRe = new RegExp(
    '<a\\b[^>]*class=[\'"]result-link[\'"][^>]*>([\\s\\S]*?)</a>',
    'gi',
  );
  const hrefRe = /href=['"]([^'"]+)['"]/i;
  const links: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = linkBlockRe.exec(html)) !== null) {
    const fullTag = m[0];
    const title = strip(m[1]);
    const hrefMatch = fullTag.match(hrefRe);
    if (hrefMatch && title) {
      links.push({ url: resolveUrl(hrefMatch[1]), title });
    }
  }

  // Extract snippets
  const snippetRe = new RegExp(
    '<td[^>]*class=[\'"]result-snippet[\'"][^>]*>([\\s\\S]*?)</td>',
    'gi',
  );
  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) !== null) {
    const text = strip(m[1]);
    if (text) snippets.push(text);
  }

  // Pair links with snippets
  for (let i = 0; i < Math.min(links.length, snippets.length); i++) {
    if (links[i].title && snippets[i]) {
      results.push({
        title: links[i].title,
        snippet: snippets[i],
        url: links[i].url,
      });
    }
  }

  return results;
}

/** Resolve DDG redirect URLs (//duckduckgo.com/l/?uddg=REAL_URL) to actual destination. */
function resolveUrl(raw: string): string {
  try {
    if (raw.includes('duckduckgo.com/l/?')) {
      const parsed = new URL(raw, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) return uddg;
    }
  } catch {
    // ignore malformed URLs
  }
  if (raw.startsWith('//')) return 'https:' + raw;
  return raw;
}

/** Strip HTML tags and decode common entities. */
function strip(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
