// app/api/chat/route.ts — Server-side proxy for LLM API (keeps API key secret)
import { NextRequest } from 'next/server';
import { DHRUV_SYSTEM_PROMPT } from '@/lib/chatContext.server';
import { CHAT_CONFIG } from '@/lib/chatContext';
import { searchWeb, type SearchResult } from '@/lib/webSearch';

export const runtime = 'nodejs';

// ─── Debug logging ──────────────────────────────────────────────────────
// Set LOG_RAW=true in .env.local to enable, LOG_RAW=false to disable.
// Defaults to ON in development, OFF in production.
const LOG_RAW = process.env.LOG_RAW
  ? process.env.LOG_RAW === 'true'
  : process.env.NODE_ENV !== 'production';

// ─── LLM provider config ───────────────────────────────────────────────
// TIMEOUT CHAIN (keep these consistent across all files!):
//   Classifier LLM:     4s  (CLASSIFIER_TIMEOUT_MS below)
//   DDG search total:   6s  (SEARCH_BUDGET_MS in webSearch.ts)
//   Main LLM provider: 45s  (LLM_TIMEOUT_MS env or default below)
//   Server worst case: 55s  (4 + 6 + 45)
//   Client abort:      60s  (CHAT_CONFIG.responseTimeoutMs in chatContext.ts)
//   Filler tiers:  2s → 55s (useStickyChat.ts — last tier at server max edge)
//
// Both providers are fired simultaneously (dual dispatch). First success wins.
// Timeouts are per-provider, configurable via LLM_TIMEOUT_MS / LLM_FALLBACK_TIMEOUT_MS.
interface LLMProvider {
  apiKey: string;
  baseURL: string;
  model: string;
  label: string;
  timeoutMs: number;
}

function getProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null } {
  const primary = (process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL)
    ? {
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL,
        model: process.env.LLM_MODEL,
        label: process.env.LLM_MODEL,
        timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 45_000,
      }
    : null;

  const fallback = (process.env.LLM_FALLBACK_API_KEY && process.env.LLM_FALLBACK_BASE_URL && process.env.LLM_FALLBACK_MODEL)
    ? {
        apiKey: process.env.LLM_FALLBACK_API_KEY,
        baseURL: process.env.LLM_FALLBACK_BASE_URL,
        model: process.env.LLM_FALLBACK_MODEL,
        label: process.env.LLM_FALLBACK_MODEL,
        timeoutMs: Number(process.env.LLM_FALLBACK_TIMEOUT_MS) || 45_000,
      }
    : null;

  return { primary, fallback };
}

// Server-side rate limiting (per-IP, simple in-memory)
const ipRequests = new Map<string, number[]>();
const RATE_LIMIT = { maxRequests: 20, windowMs: 300_000 }; // 20 per 5 min
const MAX_TRACKED_IPS = 500; // Cap to prevent unbounded memory growth on e2-micro
let requestsSinceCleanup = 0;

/** Evict expired entries from the rate-limit map to bound memory usage. */
function evictStaleEntries() {
  const cutoff = Date.now() - RATE_LIMIT.windowMs;
  for (const [ip, times] of ipRequests) {
    const valid = times.filter(t => t > cutoff);
    if (valid.length === 0) {
      ipRequests.delete(ip);
    } else {
      ipRequests.set(ip, valid);
    }
  }
}

function isRateLimited(ip: string): { limited: boolean; retryAfter: number } {
  // Periodic cleanup every 50 requests to prevent memory leak
  requestsSinceCleanup++;
  if (requestsSinceCleanup >= 50 || ipRequests.size > MAX_TRACKED_IPS) {
    requestsSinceCleanup = 0;
    evictStaleEntries();
  }

  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;
  let times = ipRequests.get(ip) || [];
  times = times.filter(t => t > windowStart);

  if (times.length >= RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((times[0] + RATE_LIMIT.windowMs - now) / 1000);
    return { limited: true, retryAfter };
  }

  times.push(now);
  ipRequests.set(ip, times);
  return { limited: false, retryAfter: 0 };
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    const { limited, retryAfter } = isRateLimited(ip);
    if (limited) {
      return Response.json(
        { error: `Rate limited. Try again in ${retryAfter} seconds.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const body = await request.json();
    const userMessages: { role: string; content: string }[] = body.messages;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return Response.json({ error: 'Messages are required' }, { status: 400 });
    }

    // Validate message format (only user/assistant roles from client)
    const sanitized = userMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 500) }))
      .slice(-12); // Only keep last 12 messages for context (server-side cap)

    if (sanitized.length === 0) {
      return Response.json({ error: 'At least one user message is required' }, { status: 400 });
    }

    // Count user messages — hard limit on conversation length
    const userMsgCount = sanitized.filter(m => m.role === 'user').length;
    if (userMsgCount > 25) {
      return Response.json(
        { error: 'Conversation is too long. Please clear and start a new chat.' },
        { status: 400 }
      );
    }

    const { primary, fallback } = getProviders();
    if (!primary) {
      console.error('Missing LLM environment variables (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL)');
      return Response.json({ error: 'Chat service is not configured' }, { status: 500 });
    }

    // ─── Search-first flow ───────────────────────────────────────────────
    // 1. Fast classifier LLM decides if a web search is needed (and what query)
    // 2. If search needed → DDG search runs in parallel with nothing blocking
    // 3. Main LLM gets ONE call with search results pre-injected (no re-query)
    const searchResults = await classifyAndSearch(sanitized);
    let systemPrompt = DHRUV_SYSTEM_PROMPT;
    if (searchResults) {
      systemPrompt += `\n\nWEB_SEARCH_RESULTS (use these to inform your answer — do NOT output [[SEARCH:]] tags, results are already here):\n${searchResults}`;
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...sanitized,
    ];

    // Dual dispatch: fire both providers simultaneously, first success wins.
    // If only primary is configured, call it directly.
    let result = fallback
      ? await dualDispatch(primary, fallback, apiMessages)
      : await callProvider(primary, apiMessages);

    // Safety net: if main LLM still emits [[SEARCH:]] tags (shouldn't happen), strip them
    SEARCH_TAG_RE.lastIndex = 0;
    result = { reply: result.reply.replace(SEARCH_TAG_RE, '').trim() };

    if (LOG_RAW) {
      console.log(`\n════ FINAL REPLY (sent to client) ══════`);
      console.log(result.reply);
      console.log('════════════════════════════════════════\n');
    }

    return Response.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Search-first: classifier + DDG search ─────────────────────────────
const SEARCH_TAG_RE = /\[\[SEARCH:([^\]]{1,100})\]\]/gi;
const MAX_SEARCH_QUERIES = 2;
const CLASSIFIER_TIMEOUT_MS = 4_000;

// Search classifier system prompt — kept minimal for fast/cheap models
const SEARCH_CLASSIFIER_PROMPT = `You decide if a web search is needed to answer the user's latest message in a chat with Dhruv Mishra (SWE @ Microsoft).

SEARCH when: user asks about current events, recent tech news, specific facts not in the chat, weather, scores, releases, updates.
DO NOT SEARCH when: user asks about Dhruv himself, his work, projects, hobbies (already in chat context), greetings, opinions, navigation requests, theme/action requests.

If search is needed, respond with ONLY the search query (1 line, <80 chars, search-engine friendly).
If no search needed, respond with exactly: NO_SEARCH

Examples:
User: "What's new in Rust 2025?" → Rust 2025 edition new features
User: "Tell me about your PC build" → NO_SEARCH
User: "What's the weather in Delhi?" → Delhi weather today
User: "Take me to projects page" → NO_SEARCH
User: "Latest NVIDIA GPU news" → NVIDIA GPU latest news 2026`;

/**
 * Use a fast/cheap LLM to classify if a search is needed, then perform DDG search.
 * Returns formatted search results string, or null if no search needed.
 */
async function classifyAndSearch(
  userMessages: { role: string; content: string }[],
): Promise<string | null> {
  // Get classifier model config — reuses suggestions model (fast/cheap)
  const apiKey = process.env.LLM_SUGGESTIONS_API_KEY || process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_SUGGESTIONS_BASE_URL || process.env.LLM_BASE_URL;
  const model = process.env.LLM_SUGGESTIONS_MODEL || process.env.LLM_MODEL;

  if (!apiKey || !baseURL || !model) return null;

  // Only send last 2 messages for context (classifier just needs the latest exchange)
  const recentMessages = userMessages.slice(-2);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SEARCH_CLASSIFIER_PROMPT },
          ...recentMessages,
        ],
        temperature: 0.1, // Low temp — deterministic classification
        max_tokens: 80,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!response.ok) return null;

    const data = await response.json();
    let raw = (data.choices?.[0]?.message?.content || '').trim();

    // Strip <think> tags if classifier model uses them
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    raw = raw.replace(/<think>[\s\S]*/gi, '').trim();

    if (LOG_RAW) {
      console.log(`\n🔍 SEARCH CLASSIFIER [${model}]: "${raw}"`);
    }

    // Check if classifier said no search needed
    if (!raw || /^no.?search$/i.test(raw)) {
      if (LOG_RAW) console.log('   → No search needed\n');
      return null;
    }

    // Extract query — take first line, strip any prefix
    const query = raw.split('\n')[0].replace(/^(search|query):?\s*/i, '').trim().slice(0, 80);
    if (!query || query.length < 3) return null;

    if (LOG_RAW) console.log(`   → Searching: "${query}"`);

    // Perform DDG search
    const results: SearchResult[][] = await Promise.all(
      [query].slice(0, MAX_SEARCH_QUERIES).map(q => searchWeb(q))
    );

    const hasAnyResults = results.some(r => r.length > 0);
    if (!hasAnyResults) {
      if (LOG_RAW) console.log('   → No search results found\n');
      return null;
    }

    // Format results for LLM context
    const resultsText = results
      .map((searchRes, i) => {
        const q = [query][i];
        if (searchRes.length === 0) return `"${q}": no results found`;
        return `"${q}":\n${searchRes.map(r => `- [${r.title}](${r.url})\n  ${r.snippet}`).join('\n')}`;
      })
      .join('\n\n');

    if (LOG_RAW) {
      console.log(`   → ${results.flat().length} results found`);
      console.log(resultsText.slice(0, 300));
      console.log('\n');
    }

    return resultsText;
  } catch (err) {
    if (LOG_RAW) console.warn('Search classifier failed:', (err as Error)?.message);
    return null; // Graceful degradation — chat works without search
  }
}

/**
 * Dual dispatch: fire both providers simultaneously, resolve with the first
 * successful response, abort the slower one to save resources.
 */
async function dualDispatch(
  primary: LLMProvider,
  fallback: LLMProvider,
  messages: { role: string; content: string }[],
): Promise<{ reply: string }> {
  const primaryAC = new AbortController();
  const fallbackAC = new AbortController();

  return new Promise<{ reply: string }>((resolve, reject) => {
    let resolved = false;
    let primaryDone = false;
    let fallbackDone = false;

    callProvider(primary, messages, primaryAC.signal)
      .then(result => {
        primaryDone = true;
        if (!resolved) {
          resolved = true;
          fallbackAC.abort();
          resolve(result);
        }
      })
      .catch(err => {
        primaryDone = true;
        console.warn(`Primary (${primary.label}) failed: ${err?.message}`);
        if (fallbackDone && !resolved) {
          reject(new Error('All LLM providers failed'));
        }
      });

    callProvider(fallback, messages, fallbackAC.signal)
      .then(result => {
        fallbackDone = true;
        if (!resolved) {
          resolved = true;
          primaryAC.abort();
          resolve(result);
        }
      })
      .catch(err => {
        fallbackDone = true;
        console.warn(`Fallback (${fallback.label}) failed: ${err?.message}`);
        if (primaryDone && !resolved) {
          reject(new Error('All LLM providers failed'));
        }
      });
  });
}

/**
 * Call a single LLM provider and return the complete response.
 * Non-streaming: simpler, fewer resources, client typewriters the buffered result.
 * Accepts an optional external AbortSignal for dual-dispatch cancellation.
 */
async function callProvider(
  provider: LLMProvider,
  messages: { role: string; content: string }[],
  externalSignal?: AbortSignal,
): Promise<{ reply: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);

  // Forward external abort (from dualDispatch winner) to our controller
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeout);
      throw new Error('Aborted before start');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    // Build request body — add model-specific params
    const body: Record<string, unknown> = {
      model: provider.model,
      messages,
      temperature: CHAT_CONFIG.temperature,
      top_p: CHAT_CONFIG.topP,
      max_tokens: CHAT_CONFIG.maxTokens,
      stream: false,
    };

    // GLM5 thinking mode: include chain-of-thought but keep it in response
    if (/glm/i.test(provider.model)) {
      body.chat_template_kwargs = { enable_thinking: true, clear_thinking: false };
    }

    const llmResponse = await fetch(`${provider.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);

    if (!llmResponse.ok) {
      const errText = await llmResponse.text().catch(() => 'Unknown upstream error');
      throw new Error(`${provider.label} responded ${llmResponse.status}: ${errText}`);
    }

    const data = await llmResponse.json();

    if (LOG_RAW) {
      // Log full response structure to debug empty/unexpected responses
      const msg = data.choices?.[0]?.message;
      console.log(`\n──── RAW LLM [${provider.label}] ────`);
      console.log('content:', JSON.stringify(msg?.content ?? null));
      if (msg?.reasoning_content) console.log('reasoning_content:', JSON.stringify(msg.reasoning_content.slice(0, 200)));
      if (msg?.reasoning) console.log('reasoning:', JSON.stringify(msg.reasoning.slice(0, 200)));
      console.log('────────────────────────────────────\n');
    }

    // Extract reply: prefer content, fall back to reasoning_content for models that split them
    let reply = data.choices?.[0]?.message?.content || '';

    // Strip <think>...</think> blocks (Nemotron, Qwen, DeepSeek thinking output)
    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Handle unclosed <think> (model hit token limit mid-thought)
    reply = reply.replace(/<think>[\s\S]*/gi, '').trim();

    return { reply };
  } catch (err) {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
    throw err;
  }
}
