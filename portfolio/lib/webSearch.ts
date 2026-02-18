// lib/webSearch.ts - DuckDuckGo web search for chat enrichment
// Uses DuckDuckGo Instant Answer JSON API (fastest) → HTML → Lite fallback chain.
// Returns empty array on any failure — graceful degradation, never blocks chat.
//
// TIMEOUT BUDGET (see also route.ts CLASSIFIER_TIMEOUT_MS and chatContext.ts responseTimeoutMs):
//   Per-request cap : 3s  (SEARCH_TIMEOUT_MS — applied to each DDG tier)
//   Total DDG budget: 6s  (SEARCH_BUDGET_MS — hard cap across all tiers)
//   This keeps worst-case server time = 4s classifier + 6s DDG + 45s LLM = 55s
//   Client abort at 60s leaves a 5s buffer.

const SEARCH_TIMEOUT_MS = 3_000;  // Per-request timeout for each DDG tier
const SEARCH_BUDGET_MS = 6_000;   // Total time budget across all DDG tiers
const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 5;

// Debug logging — mirrors route.ts LOG_RAW flag
const LOG_SEARCH = process.env.LOG_RAW
  ? process.env.LOG_RAW === 'true'
  : process.env.NODE_ENV !== 'production';

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

  if (LOG_SEARCH) console.log(`  [DDG] Searching: "${trimmed}"`);
  const start = Date.now();
  const elapsed = () => Date.now() - start;

  // Tier 1: Instant Answer JSON API (fastest, sub-second typical)
  const instant = await searchInstantAnswer(trimmed);
  if (instant.length > 0) {
    if (LOG_SEARCH) console.log(`  [DDG] Instant Answer: ${instant.length} results (${elapsed()}ms)`);
    return instant.slice(0, MAX_RESULTS);
  }

  // Budget check before HTML fallback
  if (elapsed() >= SEARCH_BUDGET_MS) {
    if (LOG_SEARCH) console.log(`  [DDG] Budget exhausted after Instant Answer (${elapsed()}ms)`);
    return [];
  }

  // Tier 2: HTML search (richer snippets)
  const htmlResults = await searchHtml(trimmed);
  if (htmlResults.length > 0) {
    if (LOG_SEARCH) console.log(`  [DDG] HTML fallback: ${htmlResults.length} results (${elapsed()}ms)`);
    return htmlResults.slice(0, MAX_RESULTS);
  }

  // Budget check before Lite fallback
  if (elapsed() >= SEARCH_BUDGET_MS) {
    if (LOG_SEARCH) console.log(`  [DDG] Budget exhausted after HTML (${elapsed()}ms)`);
    return [];
  }

  // Tier 3: Lite HTML scraper (last resort)
  const lite = await searchLite(trimmed);
  if (LOG_SEARCH) console.log(`  [DDG] Lite fallback: ${lite.length} results (${elapsed()}ms)`);
  return lite.slice(0, MAX_RESULTS);
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
        snippet: data.AbstractText.slice(0, 500),
        url: data.AbstractURL || '',
      });
    }

    // Infobox — structured facts (born, occupation, etc.)
    if (data.Infobox?.content && Array.isArray(data.Infobox.content)) {
      const facts = data.Infobox.content
        .filter((f: { label?: string; value?: string }) => f.label && f.value)
        .map((f: { label: string; value: string }) => `${f.label}: ${f.value}`)
        .slice(0, 6)
        .join('; ');
      if (facts && results.length > 0) {
        results[0].snippet += ` | Facts: ${facts}`;
      }
    }

    // Related topics
    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= MAX_RESULTS) break;
        if (topic.Text && topic.FirstURL) {
          // Split "Title - Description" format common in DDG topics
          const dashIdx = topic.Text.indexOf(' - ');
          const title = dashIdx > 0 ? topic.Text.slice(0, dashIdx).slice(0, 120) : (topic.Text.slice(0, 120) || query);
          const snippet = dashIdx > 0 ? topic.Text.slice(dashIdx + 3).slice(0, 500) : topic.Text.slice(0, 500);
          results.push({ title, snippet, url: topic.FirstURL });
        }
        // Nested subtopics
        if (Array.isArray(topic.Topics)) {
          for (const sub of topic.Topics) {
            if (results.length >= MAX_RESULTS) break;
            if (sub.Text && sub.FirstURL) {
              const dIdx = sub.Text.indexOf(' - ');
              const title = dIdx > 0 ? sub.Text.slice(0, dIdx).slice(0, 120) : (sub.Text.slice(0, 120) || query);
              const snippet = dIdx > 0 ? sub.Text.slice(dIdx + 3).slice(0, 500) : sub.Text.slice(0, 500);
              results.push({ title, snippet, url: sub.FirstURL });
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

/**
 * DuckDuckGo HTML search — better snippets than Lite for many queries.
 * Uses html.duckduckgo.com which returns richer result cards.
 */
async function searchHtml(query: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: 'q=' + encodeURIComponent(query) + '&b=',
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return [];

    const html = await res.text();
    return parseHtmlResults(html);
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/** Parse html.duckduckgo.com result page. */
function parseHtmlResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Title: <a class="result__a" href="...">Title</a>
  // Snippet: <a class="result__snippet" href="...">Snippet text</a>
  const titleRe = /<a[^>]*class=['"]result__a['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class=['"]result__snippet['"][^>]*>([\s\S]*?)<\/a>/gi;

  const titles: { url: string; title: string }[] = [];
  const snippets: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = titleRe.exec(html)) !== null) {
    const url = resolveUrl(m[1]);
    const title = strip(m[2]);
    if (url && title) titles.push({ url, title });
  }

  while ((m = snippetRe.exec(html)) !== null) {
    const text = strip(m[1]);
    if (text) snippets.push(text);
  }

  for (let i = 0; i < Math.min(titles.length, snippets.length, MAX_RESULTS); i++) {
    if (titles[i].title && snippets[i]) {
      results.push({
        title: titles[i].title.slice(0, 150),
        snippet: snippets[i].slice(0, 500),
        url: titles[i].url,
      });
    }
  }

  return results;
}

/** Parse DuckDuckGo Lite table-based HTML for search results (last resort). */
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
  for (let i = 0; i < Math.min(links.length, snippets.length, MAX_RESULTS); i++) {
    if (links[i].title && snippets[i]) {
      results.push({
        title: links[i].title,
        snippet: snippets[i].slice(0, 500),
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
