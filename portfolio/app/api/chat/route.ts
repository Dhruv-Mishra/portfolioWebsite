// app/api/chat/route.ts — Server-side proxy for LLM API (keeps API key secret)
import { NextRequest } from 'next/server';
import { DHRUV_SYSTEM_PROMPT } from '@/lib/chatContext.server';
import { CHAT_CONFIG } from '@/lib/chatContext';
import { LLM_PROVIDER_TIMEOUT_MS, RATE_LIMIT_CONFIG, isRawLogEnabled, stripThinkTags } from '@/lib/llmConfig';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';

export const runtime = 'nodejs';

// ─── LLM provider config ───────────────────────────────────────────────
// Primary provider is tried first. If it fails or times out, fallback is used.
// To swap which is primary, just rename the env vars.
interface LLMProvider {
  apiKey: string;
  baseURL: string;
  model: string;
  label: string;
}

function getProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null } {
  const primary = (process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL)
    ? {
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL,
        model: process.env.LLM_MODEL,
        label: process.env.LLM_MODEL,
      }
    : null;

  const fallback = (process.env.LLM_FALLBACK_API_KEY && process.env.LLM_FALLBACK_BASE_URL && process.env.LLM_FALLBACK_MODEL)
    ? {
        apiKey: process.env.LLM_FALLBACK_API_KEY,
        baseURL: process.env.LLM_FALLBACK_BASE_URL,
        model: process.env.LLM_FALLBACK_MODEL,
        label: process.env.LLM_FALLBACK_MODEL,
      }
    : null;

  return { primary, fallback };
}


const chatRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.chat, maxTrackedIPs: 500, cleanupInterval: 50 });

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = getClientIP(request);

    const { limited, retryAfter } = chatRateLimiter.check(ip);
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

    // Build full message array with system prompt (server-side only!)
    const apiMessages = [
      { role: 'system', content: DHRUV_SYSTEM_PROMPT },
      ...sanitized,
    ];

    const { primary, fallback } = getProviders();
    if (!primary) {
      console.error('Missing LLM environment variables (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL)');
      return Response.json({ error: 'Chat service is not configured' }, { status: 500 });
    }

    // Try primary provider, fall back if it errors or takes too long
    const result = await callProvider(primary, apiMessages)
      .catch(async (err) => {
        if (fallback) {
          console.warn(`Primary LLM failed (${err?.message}), trying fallback...`);
          return callProvider(fallback, apiMessages);
        }
        throw err;
      });

    return Response.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Call a single LLM provider and return the complete response.
 * Non-streaming: simpler, fewer resources, client typewriters the buffered result.
 */
async function callProvider(
  provider: LLMProvider,
  messages: { role: string; content: string }[],
): Promise<{ reply: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_PROVIDER_TIMEOUT_MS);

  try {
    const llmResponse = await fetch(`${provider.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: CHAT_CONFIG.temperature,
        top_p: CHAT_CONFIG.topP,
        max_tokens: CHAT_CONFIG.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!llmResponse.ok) {
      const errText = await llmResponse.text().catch(() => 'Unknown upstream error');
      throw new Error(`${provider.label} responded ${llmResponse.status}: ${errText}`);
    }

    const data = await llmResponse.json();
    const reply = data.choices?.[0]?.message?.content || '';
    const cleanReply = stripThinkTags(reply);

    if (isRawLogEnabled()) {
      console.log('[LLM RAW]', { model: provider.model, raw: reply, clean: cleanReply });
    }

    return { reply: cleanReply };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
