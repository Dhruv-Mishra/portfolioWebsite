import type { APIRoute } from 'astro';
import type OpenAI from 'openai';
import Groq from 'groq-sdk';
import type { ActionExecution } from '@/lib/actions';
import { resolveChatIntent } from '@/lib/chatActionRouter';
import { signAssistantMessage, verifyAssistantMessage } from '@/lib/chatHistory.server';
import { buildDhruvSystemPromptParts } from '@/lib/chatContext.server';
import { sanitizeAssistantReplyText } from '@/lib/chatSanitization';
import { CHAT_CONFIG, getContextualFallback } from '@/lib/chatContext';
import type { ClientChatMessage, SanitizedChatMessage } from '@/lib/chatTransport';
import { LLM_PROVIDER_TIMEOUT_MS, RATE_LIMIT_CONFIG, isRawLogEnabled, stripThinkTags } from '@/lib/llmConfig';
import { createProviderClient, getChatProviders, type LLMProvider } from '@/lib/llmProviders.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';
import { isClientChatMessage } from '@/lib/chatMessageSchema';

export const prerender = false;

interface ProviderCallResult {
  reply: string;
  action: ActionExecution | null;
}

const chatRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.chat, maxTrackedIPs: 500, cleanupInterval: 50 });
const MAX_CHAT_BODY_BYTES = 24_000;
const MAX_CONTEXT_CHARS = 5_000;

const GROQ_SAMPLING: {
  temperature: number;
  topP: number;
  maxCompletionTokens: number;
  stop: string[];
} = {
  temperature: 0.7,
  topP: 0.9,
  maxCompletionTokens: 400,
  stop: ['\n\n\n', '\nUser:', '\nAssistant:'],
};

function getContentLength(request: Request): number | null {
  const header = request.headers.get('content-length');
  if (!header) return null;
  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeConversation(messages: ClientChatMessage[]): SanitizedChatMessage[] {
  const sanitized: SanitizedChatMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      sanitized.push({ role: 'user', content: String(message.content).slice(0, CHAT_CONFIG.maxUserMessageLength) });
      continue;
    }

    const verified = verifyAssistantMessage({
      role: 'assistant',
      content: String(message.content),
      signature: message.signature,
      action: message.action ?? null,
    });
    if (!verified) continue;
    sanitized.push({ ...verified, content: verified.content.slice(0, 700) });
  }
  return sanitized;
}

function toProviderMessages(messages: SanitizedChatMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

function getOrderedProviders(primary: LLMProvider | null, fallback: LLMProvider | null): LLMProvider[] {
  const seen = new Set<string>();
  return [primary, fallback]
    .filter((provider): provider is LLMProvider => provider !== null)
    .filter((provider) => {
      const key = `${provider.baseURL}::${provider.model}::${provider.apiKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function createFallbackResponse(latestUserMessage: string, reason?: string) {
  const reply = getContextualFallback(latestUserMessage);
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Chat-Fallback': 'localStatic',
  };
  if (reason) headers['X-Chat-Fallback-Reason'] = reason.replace(/[\r\n]+/g, ' ').slice(0, 300);
  return Response.json({ reply, action: null, degraded: true, signature: signAssistantMessage(reply, null) }, { headers });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const originError = validateOrigin(request, { requireOrigin: true });
    if (originError) return originError;

    const ip = getClientIP(request);
    const { limited, retryAfter } = chatRateLimiter.check(ip);
    if (limited) return Response.json({ error: `Rate limited. Try again in ${retryAfter} seconds.` }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });

    const contentLength = getContentLength(request);
    if (contentLength === null) return Response.json({ error: 'Content-Length header required' }, { status: 411 });
    if (contentLength > MAX_CHAT_BODY_BYTES) return Response.json({ error: 'Request body is too large' }, { status: 413 });

    let body: { messages?: ClientChatMessage[] };
    try {
      body = await request.json() as { messages?: ClientChatMessage[] };
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const userMessages = body.messages;
    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return Response.json({ error: 'Messages are required' }, { status: 400 });
    }

    const validMessages = sanitizeConversation(userMessages.filter(isClientChatMessage));
    const userMsgCount = validMessages.filter((message) => message.role === 'user').length;
    if (userMsgCount > 25) return Response.json({ error: 'Conversation is too long. Please clear and start a new chat.' }, { status: 400 });

    const sanitized = validMessages.slice(-12);
    const totalChars = sanitized.reduce((count, message) => count + message.content.length, 0);
    if (totalChars > MAX_CONTEXT_CHARS) return Response.json({ error: 'Conversation context is too large. Please start a new chat.' }, { status: 400 });
    if (sanitized.length === 0) return Response.json({ error: 'At least one user message is required' }, { status: 400 });

    const latestUserMessage = [...sanitized].reverse().find((message) => message.role === 'user')?.content ?? '';
    const intent = resolveChatIntent(latestUserMessage);

    if (intent?.kind === 'action') {
      return Response.json({ reply: intent.reply, action: intent.action, signature: signAssistantMessage(intent.reply, intent.action) }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (intent?.kind === 'project-info') {
      return Response.json({ reply: intent.reply, action: null, signature: signAssistantMessage(intent.reply, null) }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { stable, conditional } = await buildDhruvSystemPromptParts(sanitized, { factLimit: 6 });
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: stable },
      ...(conditional ? [{ role: 'system' as const, content: conditional }] : []),
      ...toProviderMessages(sanitized),
    ];

    const { primary, fallback } = getChatProviders();
    const providers = getOrderedProviders(primary, fallback);
    if (providers.length === 0) {
      console.error('No LLM providers are configured; returning local fallback reply.');
      return createFallbackResponse(latestUserMessage, 'no-providers-configured');
    }

    let result: ProviderCallResult | null = null;
    let succeededTier: 'primaryOnline' | 'fallbackOnline' | null = null;
    const providerErrors: string[] = [];

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];
      try {
        result = await callProvider(provider, apiMessages);
        succeededTier = index === 0 ? 'primaryOnline' : 'fallbackOnline';
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider failure';
        providerErrors.push(`${provider.label}: ${message}`);
        console.warn(`LLM provider failed (${provider.label}): ${message}`);
      }
    }

    if (!result) {
      console.error('All LLM providers failed; returning local fallback reply.', { attempted: providers.map((provider) => provider.label), errors: providerErrors });
      return createFallbackResponse(latestUserMessage, `all-providers-failed; tried=${providers.map((provider) => provider.label).join(',')}; ${providerErrors.join(' | ')}`);
    }

    return Response.json({ reply: result.reply, action: result.action, signature: signAssistantMessage(result.reply, result.action) }, {
      headers: { 'Cache-Control': 'no-store', 'X-Chat-Fallback': succeededTier ?? 'primaryOnline' },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
};

async function callProvider(provider: LLMProvider, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<ProviderCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_PROVIDER_TIMEOUT_MS);

  try {
    let rawContent: unknown;
    if (provider.kind === 'groq') {
      const groq = new Groq({ apiKey: provider.apiKey, maxRetries: 0 });
      const completion = await groq.chat.completions.create({
        model: provider.model,
        messages: messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
        temperature: GROQ_SAMPLING.temperature,
        top_p: GROQ_SAMPLING.topP,
        max_completion_tokens: GROQ_SAMPLING.maxCompletionTokens,
        stop: GROQ_SAMPLING.stop,
        stream: false,
      }, { signal: controller.signal });
      rawContent = completion.choices?.[0]?.message?.content;
    } else {
      const collapsedMessages = collapseLeadingSystemMessages(messages);
      const client = createProviderClient(provider);
      const completion = await client.chat.completions.create({
        model: provider.model,
        messages: collapsedMessages,
        temperature: CHAT_CONFIG.temperature,
        top_p: CHAT_CONFIG.topP,
        max_tokens: CHAT_CONFIG.maxTokens,
        stop: GROQ_SAMPLING.stop,
        stream: false,
      }, { signal: controller.signal });
      rawContent = completion.choices?.[0]?.message?.content;
    }

    clearTimeout(timeout);
    const rawReply = stripThinkTags(getDeltaText(rawContent));
    const reply = sanitizeAssistantReplyText(rawReply);
    if (!reply) throw new Error('Provider returned an empty or invalid reply');

    if (isRawLogEnabled()) console.log('[LLM RAW]', { provider: provider.label, model: provider.model, raw: rawReply, clean: reply });
    return { reply, action: null };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function getDeltaText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => typeof part === 'object' && part !== null)
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function collapseLeadingSystemMessages(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  let splitIndex = 0;
  while (splitIndex < messages.length && messages[splitIndex].role === 'system') splitIndex += 1;
  if (splitIndex <= 1) return messages;

  const systemContent = messages
    .slice(0, splitIndex)
    .map((message) => (typeof message.content === 'string' ? message.content : ''))
    .filter(Boolean)
    .join('\n\n');

  return [{ role: 'system', content: systemContent }, ...messages.slice(splitIndex)];
}