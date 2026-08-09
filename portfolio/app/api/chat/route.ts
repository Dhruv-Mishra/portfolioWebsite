// app/api/chat/route.ts — Server-side proxy for LLM API (keeps API key secret)
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { NextRequest } from 'next/server';
import type { ActionExecution } from '@/lib/actions';
import { resolveChatIntent } from '@/lib/chatActionRouter';
import { selectRecentChatHistory, signAssistantMessage, verifyAssistantMessage } from '@/lib/chatHistory.server';
import { buildDhruvSystemPromptParts } from '@/lib/chatContext.server';
import { sanitizeAssistantReplyText } from '@/lib/chatSanitization';
import { CHAT_CONFIG, getContextualFallback } from '@/lib/chatContext';
import {
  DEFAULT_CHAT_MODEL_ID,
  getChatModel,
  isChatModelId,
  type ChatImageInputOrder,
  type ChatModelId,
} from '@/lib/chatModels';
import type { ChatImage, ClientChatMessage, SanitizedChatMessage } from '@/lib/chatTransport';
import { BoundedJsonError, getBoundedJsonErrorMessage, readBoundedJson } from '@/lib/boundedJson.server';
import {
  LLM_MAIN_RESPONSE_TIMEOUT_MS,
  LLM_PROVIDER_FALLBACK_RESERVE_MS,
  LLM_PROVIDER_TIMEOUT_MS,
  RATE_LIMIT_CONFIG,
  isRawLogEnabled,
  stripThinkTags,
} from '@/lib/llmConfig';
import { createProviderClient, getChatProviders, type LLMProvider } from '@/lib/llmProviders.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';
import { isClientChatMessage } from '@/lib/chatMessageSchema';

export const runtime = 'nodejs';

interface ProviderCallResult {
  reply: string;
  action: ActionExecution | null;
  modelId: ChatModelId | 'legacy';
}

type ProviderFailureCode =
  | 'invalid-provider-response'
  | 'provider-error'
  | 'provider-timeout'
  | 'request-aborted'
  | 'server-deadline-exceeded';

type FallbackReason =
  | 'all-providers-failed'
  | 'invalid-provider-response'
  | 'no-providers-configured'
  | 'provider-timeout'
  | 'request-aborted'
  | 'server-deadline-exceeded';

const chatRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.chat, maxTrackedIPs: 500, cleanupInterval: 50 });
const MAX_CHAT_BODY_BYTES = 300_000;
const MAX_IMAGE_BYTES = 180 * 1024;

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

function toProviderMessages(
  messages: SanitizedChatMessage[],
  image: ChatImage | undefined,
  imageInputOrder: ChatImageInputOrder | undefined,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const latestUserIndex = image
    ? messages.reduce((latest, message, index) => (message.role === 'user' ? index : latest), -1)
    : -1;

  return messages.map(({ role, content }, index) => {
    if (index !== latestUserIndex) return { role, content };

    return {
      role: 'user',
      content: imageInputOrder === 'image-first' ? [
        { type: 'image_url', image_url: { url: image!.dataUrl } },
        { type: 'text', text: content },
      ] : [
        { type: 'text', text: content },
        { type: 'image_url', image_url: { url: image!.dataUrl } },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
  });
}

function normalizeProviderConversation(messages: SanitizedChatMessage[]): SanitizedChatMessage[] {
  const normalized: SanitizedChatMessage[] = [];

  for (const message of messages) {
    if (message.role === 'assistant' && normalized.length === 0) {
      continue;
    }

    const previous = normalized.at(-1);
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
      continue;
    }

    normalized.push({ ...message });
  }

  while (normalized.at(-1)?.role === 'assistant') {
    normalized.pop();
  }

  return normalized;
}

function getValidatedImage(value: unknown): ChatImage | null | 'invalid' {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { dataUrl?: unknown }).dataUrl !== 'string') {
    return 'invalid';
  }

  const dataUrl = (value as { dataUrl: string }).dataUrl;
  const match = /^data:image\/(?:jpeg|png|webp);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(dataUrl);
  if (!match || !match[1]) return 'invalid';

  const decodedBytes = Buffer.from(match[1], 'base64');
  if (decodedBytes.byteLength > MAX_IMAGE_BYTES) return 'invalid';

  return { dataUrl };
}

function getOrderedProviders(
  primary: LLMProvider | null,
  fallbacks: LLMProvider[],
): LLMProvider[] {
  const seen = new Set<string>();

  return [primary, ...fallbacks]
    .filter((provider): provider is LLMProvider => provider != null)
    .filter((provider) => {
      const key = `${provider.baseURL}::${provider.model}::${provider.apiKey}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function createFallbackResponse(
  latestUserMessage: string,
  reason?: FallbackReason,
) {
  const reply = getContextualFallback(latestUserMessage);
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Chat-Fallback': 'localStatic',
  };
  if (reason) {
    headers['X-Chat-Fallback-Reason'] = reason;
  }
  return Response.json({
    reply,
    action: null,
    degraded: true,
    signature: signAssistantMessage(reply, null),
  }, { headers });
}

function getFallbackReason(
  providerFailureCodes: ProviderFailureCode[],
  requestSignal: AbortSignal,
  routeDeadlineSignal: AbortSignal,
): FallbackReason {
  if (requestSignal.aborted) return 'request-aborted';
  if (routeDeadlineSignal.aborted) return 'server-deadline-exceeded';
  if (providerFailureCodes.length > 0 && providerFailureCodes.every((code) => code === 'provider-timeout')) {
    return 'provider-timeout';
  }
  if (providerFailureCodes.length > 0 && providerFailureCodes.every((code) => code === 'invalid-provider-response')) {
    return 'invalid-provider-response';
  }
  return 'all-providers-failed';
}

export async function POST(request: NextRequest) {
  const routeDeadlineController = new AbortController();
  const routeDeadlineAt = Date.now() + LLM_MAIN_RESPONSE_TIMEOUT_MS;
  const routeDeadlineTimeout = setTimeout(
    () => routeDeadlineController.abort('server-deadline-exceeded'),
    LLM_MAIN_RESPONSE_TIMEOUT_MS,
  );
  const routeSignal = AbortSignal.any([request.signal, routeDeadlineController.signal]);

  try {
    // Block cross-origin requests (prevents LLM credit abuse from other sites)
    const originError = validateOrigin(request, { requireOrigin: true });
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

    let body: { messages?: unknown; model?: unknown; image?: unknown };
    try {
      body = await readBoundedJson<{ messages?: unknown; model?: unknown; image?: unknown }>(request, MAX_CHAT_BODY_BYTES, routeSignal);
    } catch (error) {
      if (error instanceof BoundedJsonError) {
        return Response.json({ error: getBoundedJsonErrorMessage(error) }, { status: error.status });
      }
      throw error;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const selectedModelId = body.model === undefined
      ? DEFAULT_CHAT_MODEL_ID
      : isChatModelId(body.model)
        ? body.model
        : null;
    if (!selectedModelId) {
      return Response.json({ error: 'Unsupported chat model' }, { status: 400 });
    }

    const selectedModel = getChatModel(selectedModelId);
    const image = getValidatedImage(body.image);
    if (image === 'invalid') {
      return Response.json({ error: 'Image must be a JPEG, PNG, or WebP data URL under 180 KB' }, { status: 400 });
    }
    if (image && !selectedModel?.supportsImages) {
      return Response.json({ error: 'The selected model does not support images' }, { status: 400 });
    }

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

    // Select a signed, bounded recent history after assistant verification.
    const sanitized = selectRecentChatHistory(validMessages);

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

    // Build system prompt as two parts so the stable identity/style/grounding
    // prefix is byte-identical across turns. This makes it the longest cacheable
    // prefix on Groq's automatic prompt caching, reducing TTFT on warm hits.
    // The conditional block (off-topic / UI / terminal / matrix overrides,
    // recent UI actions, retrieved facts) is emitted as a separate system
    // message, and only when non-empty.
    const { stable, conditional } = await buildDhruvSystemPromptParts(sanitized, { factLimit: 6 });
    const providerConversation = normalizeProviderConversation(sanitized);
    if (providerConversation.length === 0) {
      return Response.json({ error: 'At least one user message is required' }, { status: 400 });
    }
    const promptMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: stable },
      ...(conditional ? [{ role: 'system' as const, content: conditional }] : []),
    ];

    const { primary, fallbacks } = getChatProviders(selectedModelId);
    const providers = getOrderedProviders(primary, fallbacks)
      .filter((provider) => !image || (provider.supportsImages && provider.imageInputOrder));

    if (providers.length === 0) {
      console.error('No LLM providers are configured; returning local fallback reply.');
      return createFallbackResponse(latestUserMessage, 'no-providers-configured');
    }

    let result: ProviderCallResult | null = null;
    let succeededTier: 'primaryOnline' | 'fallbackOnline' | null = null;
    const providerErrors: string[] = [];
    const providerFailureCodes: ProviderFailureCode[] = [];

    const fallbackAttemptBudget = providers.length > 1
      ? Math.floor(LLM_PROVIDER_FALLBACK_RESERVE_MS / (providers.length - 1))
      : 0;

    for (let i = 0; i < providers.length; i += 1) {
      const provider = providers[i];
      const remainingMs = routeDeadlineAt - Date.now();
      const fallbackReserveMs = fallbackAttemptBudget * (providers.length - i - 1);
      const attemptTimeoutMs = Math.min(
        LLM_PROVIDER_TIMEOUT_MS,
        Math.max(0, remainingMs - fallbackReserveMs),
      );
      if (routeSignal.aborted) break;
      if (attemptTimeoutMs <= 0) continue;

      try {
        const apiMessages = [
          ...promptMessages,
          ...toProviderMessages(
            providerConversation,
            image ?? undefined,
            provider.imageInputOrder,
          ),
        ];
        result = await callProvider(provider, apiMessages, routeSignal, attemptTimeoutMs);
        succeededTier = i === 0 ? 'primaryOnline' : 'fallbackOnline';
        break;
      } catch (err) {
        const code = getProviderFailureCode(err, request.signal, routeDeadlineController.signal);
        providerFailureCodes.push(code);
        providerErrors.push(`${provider.label}: ${code}`);
        console.warn('LLM provider failed', {
          provider: provider.label.replace(/[\r\n]+/g, ' ').slice(0, 120),
          code,
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
      }
    }

    if (!result) {
      console.error('All LLM providers failed; returning local fallback reply.', {
        attempted: providers.map(p => p.label),
        errors: providerErrors,
      });
      return createFallbackResponse(
        latestUserMessage,
        getFallbackReason(providerFailureCodes, request.signal, routeDeadlineController.signal),
      );
    }

    return Response.json({
      reply: result.reply,
      action: result.action,
      signature: signAssistantMessage(result.reply, result.action),
      modelId: result.modelId,
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Chat-Fallback': succeededTier ?? 'primaryOnline',
      },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    clearTimeout(routeDeadlineTimeout);
  }
}

/**
 * Call a single LLM provider, stream the upstream completion server-side,
 * and return the aggregated reply/action payload expected by the client.
 */
async function callProvider(
  provider: import('@/lib/llmProviders.server').LLMProvider,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  routeSignal: AbortSignal,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('provider-timeout'), timeoutMs);
  const signal = AbortSignal.any([routeSignal, controller.signal]);

  try {
    let rawContent: unknown;

    if (provider.kind === 'groq') {
      const groq = new Groq({ apiKey: provider.apiKey, maxRetries: 0 });
      const completion = await groq.chat.completions.create({
        model: provider.model,
        messages: messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
        temperature: provider.sampling.temperature,
        ...(provider.sampling.topP !== undefined ? { top_p: provider.sampling.topP } : {}),
        ...(provider.sampling.maxCompletionTokens !== undefined ? { max_completion_tokens: provider.sampling.maxCompletionTokens } : {}),
        ...provider.sampling.extraBody,
        stream: false,
      }, {
        signal,
      });
      rawContent = completion.choices?.[0]?.message?.content;
    } else if (provider.kind === 'nvidia') {
      const collapsedMessages = provider.acceptsSystemMessages === false
        ? foldSystemMessagesIntoFirstUser(messages)
        : collapseLeadingSystemMessages(messages);
      const client = createProviderClient(provider);
      const completion = await client.chat.completions.create({
        model: provider.model,
        messages: collapsedMessages,
        temperature: provider.sampling.temperature,
        ...(provider.sampling.topP !== undefined ? { top_p: provider.sampling.topP } : {}),
        ...(provider.sampling.maxTokens !== undefined ? { max_tokens: provider.sampling.maxTokens } : {}),
        ...provider.sampling.extraBody,
        stream: true,
      }, {
        signal,
      });
      let streamedContent = '';
      for await (const chunk of completion) {
        if (signal.aborted) {
          throw new OpenAI.APIUserAbortError();
        }
        streamedContent += getDeltaText(chunk.choices?.[0]?.delta?.content);
      }
      if (signal.aborted) {
        throw new OpenAI.APIUserAbortError();
      }
      rawContent = streamedContent;
    } else {
      const collapsedMessages = provider.acceptsSystemMessages === false
        ? foldSystemMessagesIntoFirstUser(messages)
        : collapseLeadingSystemMessages(messages);
      const client = createProviderClient(provider);
      const completion = await client.chat.completions.create({
        model: provider.model,
        messages: collapsedMessages,
        temperature: provider.sampling.temperature,
        ...(provider.sampling.topP !== undefined ? { top_p: provider.sampling.topP } : {}),
        ...(provider.sampling.maxTokens !== undefined ? { max_tokens: provider.sampling.maxTokens } : {}),
        ...provider.sampling.extraBody,
        stream: false,
      }, {
        signal,
      });
      rawContent = completion.choices?.[0]?.message?.content;
    }

    const rawReply = stripThinkTags(getDeltaText(rawContent));
    const reply = sanitizeAssistantReplyText(rawReply);

    if (!reply) {
      throw new Error('Provider returned an empty or invalid reply');
    }

    if (isRawLogEnabled()) {
      console.log('[LLM RAW]', {
        provider: provider.label,
        model: provider.model,
        raw: rawReply,
        clean: reply,
      });
    }

    return {
      reply,
      action: null,
      modelId: provider.modelId ?? 'legacy',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderFailureCode(
  error: unknown,
  requestSignal: AbortSignal,
  routeDeadlineSignal: AbortSignal,
): ProviderFailureCode {
  if (requestSignal.aborted) return 'request-aborted';
  if (routeDeadlineSignal.aborted) return 'server-deadline-exceeded';
  if (error instanceof Error && error.message === 'Provider returned an empty or invalid reply') {
    return 'invalid-provider-response';
  }
  if (error instanceof OpenAI.APIUserAbortError || (error instanceof Error && error.name === 'AbortError')) {
    return 'provider-timeout';
  }
  return 'provider-error';
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

/**
 * Merge consecutive leading `system` messages into a single one (joined by
 * a blank line) and leave the rest of the conversation untouched. Required
 * for OpenAI-compatible providers that only accept one system message at
 * the start of the conversation.
 */
function collapseLeadingSystemMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  let splitIdx = 0;
  while (splitIdx < messages.length && messages[splitIdx].role === 'system') {
    splitIdx += 1;
  }
  if (splitIdx <= 1) return messages;

  const systemContent = messages
    .slice(0, splitIdx)
    .map(m => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n\n');

  return [
    { role: 'system', content: systemContent },
    ...messages.slice(splitIdx),
  ];
}

function foldSystemMessagesIntoFirstUser(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const collapsed = collapseLeadingSystemMessages(messages);
  const systemMessage = collapsed[0];
  if (!systemMessage || systemMessage.role !== 'system' || typeof systemMessage.content !== 'string') {
    return collapsed;
  }

  const remaining = collapsed.slice(1);
  const firstUserIndex = remaining.findIndex((message) => message.role === 'user');
  if (firstUserIndex === -1) return remaining;

  const firstUser = remaining[firstUserIndex];
  if (typeof firstUser.content === 'string') {
    remaining[firstUserIndex] = {
      role: 'user',
      content: `${systemMessage.content}\n\n${firstUser.content}`,
    };
  } else if (Array.isArray(firstUser.content)) {
    const textParts = firstUser.content.filter(
      (part): part is OpenAI.Chat.Completions.ChatCompletionContentPartText => part.type === 'text',
    );
    const mediaParts = firstUser.content.filter((part) => part.type !== 'text');
    const userText = textParts.map(part => part.text).join('\n');
    remaining[firstUserIndex] = {
      role: 'user',
      content: [
        ...mediaParts,
        { type: 'text', text: `${systemMessage.content}\n\n${userText}` },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
  }

  return remaining;
}
