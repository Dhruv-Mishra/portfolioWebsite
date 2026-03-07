// app/api/chat/route.ts — Server-side proxy for LLM API (keeps API key secret)
import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import type { ActionExecution } from '@/lib/actions';
import { resolveChatIntent } from '@/lib/chatActionRouter';
import { signAssistantMessage, verifyAssistantMessage } from '@/lib/chatHistory.server';
import { buildDhruvSystemPrompt } from '@/lib/chatContext.server';
import { sanitizeAssistantReplyText } from '@/lib/chatSanitization';
import { CHAT_CONFIG, getContextualFallback } from '@/lib/chatContext';
import type { ClientChatMessage, SanitizedChatMessage } from '@/lib/chatTransport';
import { LLM_PROVIDER_TIMEOUT_MS, RATE_LIMIT_CONFIG, isRawLogEnabled, stripThinkTags } from '@/lib/llmConfig';
import { createProviderClient, getChatProviders, type LLMProvider } from '@/lib/llmProviders.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

interface ProviderCallResult {
  reply: string;
  action: ActionExecution | null;
}


const chatRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.chat, maxTrackedIPs: 500, cleanupInterval: 50 });
const MAX_CHAT_BODY_BYTES = 24_000;
const MAX_CONTEXT_CHARS = 5_000;

function isClientChatMessage(
  message: { role?: unknown; content?: unknown; signature?: unknown; action?: unknown },
): message is ClientChatMessage {
  return (message.role === 'user' || message.role === 'assistant') && typeof message.content !== 'undefined';
}

function getContentLength(request: NextRequest): number | null {
  const header = request.headers.get('content-length');
  if (!header) {
    return null;
  }

  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeConversation(messages: ClientChatMessage[]): SanitizedChatMessage[] {
  const sanitized: SanitizedChatMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      sanitized.push({
        role: 'user',
        content: String(message.content).slice(0, CHAT_CONFIG.maxUserMessageLength),
      });
      continue;
    }

    const verified = verifyAssistantMessage({
      role: 'assistant',
      content: String(message.content),
      signature: message.signature,
      action: message.action ?? null,
    });

    if (!verified) {
      continue;
    }

    sanitized.push({
      ...verified,
      content: verified.content.slice(0, 700),
    });
  }

  return sanitized;
}

function getOrderedProviders(primary: LLMProvider | null, fallback: LLMProvider | null): LLMProvider[] {
  const seen = new Set<string>();

  return [primary, fallback]
    .filter((provider): provider is LLMProvider => provider !== null)
    .filter((provider) => {
      const key = `${provider.baseURL}::${provider.model}::${provider.apiKey}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function createFallbackResponse(latestUserMessage: string) {
  const reply = getContextualFallback(latestUserMessage);
  return Response.json({
    reply,
    action: null,
    degraded: true,
    signature: signAssistantMessage(reply, null),
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Chat-Fallback': 'local',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Block cross-origin requests (prevents LLM credit abuse from other sites)
    const originError = validateOrigin(request);
    if (originError) return originError;

    // Get client IP for rate limiting
    const ip = getClientIP(request);

    const { limited, retryAfter } = chatRateLimiter.check(ip);
    if (limited) {
      return Response.json(
        { error: `Rate limited. Try again in ${retryAfter} seconds.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const contentLength = getContentLength(request);
    if (contentLength !== null && contentLength > MAX_CHAT_BODY_BYTES) {
      return Response.json({ error: 'Request body is too large' }, { status: 413 });
    }

    const body = await request.json() as { messages?: ClientChatMessage[] };
    const userMessages = body.messages;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return Response.json({ error: 'Messages are required' }, { status: 400 });
    }

    const validMessages = sanitizeConversation(userMessages.filter(isClientChatMessage));

    const userMsgCount = validMessages.filter(m => m.role === 'user').length;
    if (userMsgCount > 25) {
      return Response.json(
        { error: 'Conversation is too long. Please clear and start a new chat.' },
        { status: 400 }
      );
    }

    // Validate message format (only user/assistant roles from client)
    const sanitized: ClientChatMessage[] = validMessages.slice(-12); // Only keep last 12 messages for context (server-side cap)

    const totalChars = sanitized.reduce((count, message) => count + message.content.length, 0);
    if (totalChars > MAX_CONTEXT_CHARS) {
      return Response.json({ error: 'Conversation context is too large. Please start a new chat.' }, { status: 400 });
    }

    if (sanitized.length === 0) {
      return Response.json({ error: 'At least one user message is required' }, { status: 400 });
    }

    const latestUserMessage = [...sanitized].reverse().find(message => message.role === 'user')?.content ?? '';
    const intent = resolveChatIntent(latestUserMessage);

    if (intent?.kind === 'action') {
      return Response.json({
        reply: intent.reply,
        action: intent.action,
        signature: signAssistantMessage(intent.reply, intent.action),
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (intent?.kind === 'project-info') {
      return Response.json({
        reply: intent.reply,
        action: null,
        signature: signAssistantMessage(intent.reply, null),
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Build full message array with system prompt (server-side only!)
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildDhruvSystemPrompt(sanitized) },
      ...sanitized,
    ];

    const { primary, fallback } = getChatProviders();
    const providers = getOrderedProviders(primary, fallback);

    if (providers.length === 0) {
      console.error('No LLM providers are configured; returning local fallback reply.');
      return createFallbackResponse(latestUserMessage);
    }

    let result: ProviderCallResult | null = null;
    const providerErrors: string[] = [];

    for (const provider of providers) {
      try {
        result = await callProvider(provider, apiMessages);
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown provider failure';
        providerErrors.push(`${provider.label}: ${message}`);
        console.warn(`LLM provider failed (${provider.label}): ${message}`);
      }
    }

    if (!result) {
      console.error('All LLM providers failed; returning local fallback reply.', providerErrors);
      return createFallbackResponse(latestUserMessage);
    }

    return Response.json({
      reply: result.reply,
      action: result.action,
      signature: signAssistantMessage(result.reply, result.action),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Call a single LLM provider, stream the upstream completion server-side,
 * and return the aggregated reply/action payload expected by the client.
 */
async function callProvider(
  provider: import('@/lib/llmProviders.server').LLMProvider,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<ProviderCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_PROVIDER_TIMEOUT_MS);

  try {
    const client = createProviderClient(provider);
    const completion = await client.chat.completions.create({
      model: provider.model,
      messages,
      temperature: CHAT_CONFIG.temperature,
      top_p: CHAT_CONFIG.topP,
      max_tokens: CHAT_CONFIG.maxTokens,
      stream: false,
    }, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const rawReply = stripThinkTags(getDeltaText(completion.choices?.[0]?.message?.content));
    const reply = sanitizeAssistantReplyText(rawReply);

    if (!reply) {
      throw new Error('Provider returned an empty or invalid reply');
    }

    if (isRawLogEnabled()) {
      console.log('[LLM RAW]', {
        model: provider.model,
        raw: rawReply,
        clean: reply,
      });
    }

    return {
      reply,
      action: null,
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function getDeltaText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter(part => typeof part === 'object' && part !== null)
    .map(part => {
      if ('text' in part && typeof part.text === 'string') {
        return part.text;
      }

      return '';
    })
    .join('');
}
