// app/api/chat/route.ts — Server-side proxy for LLM API (keeps API key secret)
import { NextRequest } from 'next/server';
import { DHRUV_SYSTEM_PROMPT, CHAT_CONFIG } from '@/lib/chatContext';

export const runtime = 'nodejs';

// Server-side rate limiting (per-IP, simple in-memory)
const ipRequests = new Map<string, number[]>();
const RATE_LIMIT = { maxRequests: 20, windowMs: 300_000 }; // 20 per 5 min

function isRateLimited(ip: string): { limited: boolean; retryAfter: number } {
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
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

    if (sanitized.length === 0) {
      return Response.json({ error: 'At least one user message is required' }, { status: 400 });
    }

    // Build full message array with system prompt (server-side only!)
    const apiMessages = [
      { role: 'system', content: DHRUV_SYSTEM_PROMPT },
      ...sanitized,
    ];

    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL;
    const model = process.env.LLM_MODEL;

    if (!apiKey || !baseURL || !model) {
      console.error('Missing LLM environment variables');
      return Response.json({ error: 'Chat service is not configured' }, { status: 500 });
    }

    // Proxy to NVIDIA/LLM API
    const llmResponse = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: CHAT_CONFIG.temperature,
        top_p: CHAT_CONFIG.topP,
        max_tokens: CHAT_CONFIG.maxTokens,
        stream: true,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text().catch(() => 'Unknown upstream error');
      console.error(`LLM API error (${llmResponse.status}):`, errText);
      return Response.json(
        { error: 'Failed to get a response. Please try again.' },
        { status: 502 }
      );
    }

    if (!llmResponse.body) {
      return Response.json({ error: 'No response stream' }, { status: 502 });
    }

    // Stream the SSE response back to the client
    return new Response(llmResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
