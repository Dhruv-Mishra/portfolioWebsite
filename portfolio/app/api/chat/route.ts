// app/api/chat/route.ts — Server-side proxy for LLM API (keeps API key secret)
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { NextRequest } from 'next/server';
import type { ActionExecution } from '@/lib/actions';
import { resolveChatIntent } from '@/lib/chatActionRouter';
import { selectRecentChatHistory, signAssistantMessage, verifyAssistantMessage } from '@/lib/chatHistory.server';
import { buildDhruvSystemPromptParts } from '@/lib/chatContext.server';
import { finalizeAssistantReplyText, sanitizeAssistantReplyText } from '@/lib/chatSanitization';
import { CHAT_CONFIG, getContextualFallback } from '@/lib/chatContext';
import {
  DEFAULT_CHAT_MODEL_ID,
  getChatModel,
  isBrowserChatModelId,
  isChatModelId,
  isLocalChatModelId,
  type ChatImageInputOrder,
  type ChatModelId,
} from '@/lib/chatModels';
import {
  CHAT_STREAM_CONTENT_TYPE,
  type ChatImage,
  type ChatReplyPayload,
  type ChatStreamEvent,
  type ClientChatMessage,
  type SanitizedChatMessage,
} from '@/lib/chatTransport';
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
import { getLocalAgentStatus } from '@/lib/localAgentStatus.server';
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
  | 'provider-busy'
  | 'provider-error'
  | 'provider-timeout'
  | 'request-aborted'
  | 'server-deadline-exceeded';

type FallbackReason =
  | 'all-providers-failed'
  | 'invalid-provider-response'
  | 'local-agent-unhealthy'
  | 'no-providers-configured'
  | 'provider-busy'
  | 'provider-timeout'
  | 'request-aborted'
  | 'server-deadline-exceeded';

const BUSY_FALLBACK_REPLY = "A lot of people are chatting with me right now, so my brain is in a queue. Give it a few seconds and ask again, or switch models in Settings for a quicker reply!";
// Small models otherwise read first-person facts in the user turn as the visitor talking about themselves.
const TURN_CONTEXT_HEADER = 'Your own notes for this reply (not written by the visitor; never mention them):';
const TURN_MESSAGE_HEADER = "Visitor's message:";
const LOCAL_MODEL_HISTORY_BUDGET = { maxMessages: 5, maxChars: 1_600 };
const LOCAL_HEALTH_REUSE_MS = 60_000;

const chatRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.chat, maxTrackedIPs: 500, cleanupInterval: 50 });
const MAX_CHAT_BODY_BYTES = 300_000;
const MAX_IMAGE_BYTES = 180 * 1024;
const INVALID_PROVIDER_RESPONSE_RETRY_TIMEOUT_MS = 20_000;
const MIN_INVALID_PROVIDER_RESPONSE_RETRY_MS = 2_000;

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

function withTurnContext(messages: SanitizedChatMessage[], context: string): SanitizedChatMessage[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'user') return messages;
  return [
    ...messages.slice(0, -1),
    { ...last, content: `${TURN_CONTEXT_HEADER}\n${context}\n\n${TURN_MESSAGE_HEADER}\n${last.content}` },
  ];
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

function createFallbackPayload(latestUserMessage: string, reason?: FallbackReason): ChatReplyPayload {
  const reply = finalizeAssistantReplyText(
    reason === 'provider-busy' ? BUSY_FALLBACK_REPLY : getContextualFallback(latestUserMessage),
  );
  return {
    reply,
    action: null,
    degraded: true,
    signature: signAssistantMessage(reply, null),
    ...(reason ? { fallbackReason: reason } : {}),
  };
}

function createFallbackResponse(
  latestUserMessage: string,
  reason?: FallbackReason,
) {
  return createReplyResponse(createFallbackPayload(latestUserMessage, reason));
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
  if (providerFailureCodes.length > 0 && providerFailureCodes.every((code) => code === 'provider-busy')) {
    return 'provider-busy';
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
  // A streamed reply outlives this handler, so the stream clears the deadline when it settles.
  let streamOwnsDeadline = false;
  const streamCancelController = new AbortController();
  const routeSignal = AbortSignal.any([request.signal, routeDeadlineController.signal, streamCancelController.signal]);

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

    let body: { messages?: unknown; model?: unknown; image?: unknown; stream?: unknown };
    try {
      body = await readBoundedJson<{ messages?: unknown; model?: unknown; image?: unknown; stream?: unknown }>(request, MAX_CHAT_BODY_BYTES, routeSignal);
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
    if (isBrowserChatModelId(selectedModelId)) {
      return Response.json({ error: 'The selected model runs in the browser' }, { status: 400 });
    }

    const selectedModel = getChatModel(selectedModelId);
    const isLocalModel = isLocalChatModelId(selectedModelId);
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
    // The CPU-hosted local model pays for every history token in prompt time, so it keeps two turns.
    const sanitized = selectRecentChatHistory(
      validMessages,
      isLocalModel ? LOCAL_MODEL_HISTORY_BUDGET : undefined,
    );

    if (sanitized.length === 0) {
      return Response.json({ error: 'At least one user message is required' }, { status: 400 });
    }

    const latestUserMessage = [...sanitized].reverse().find(message => message.role === 'user')?.content ?? '';
    const intent = resolveChatIntent(latestUserMessage);

    if (intent?.kind === 'action') {
      const reply = finalizeAssistantReplyText(intent.reply);
      return Response.json({
        reply,
        action: intent.action,
        signature: signAssistantMessage(reply, intent.action),
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (intent?.kind === 'project-info') {
      const reply = finalizeAssistantReplyText(intent.reply);
      return Response.json({
        reply,
        action: null,
        signature: signAssistantMessage(reply, null),
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
    // The CPU-hosted local model reuses its KV/recurrent state only from a checkpoint at a
    // message boundary, so it gets one fixed system message (rules + anchor facts) and the
    // per-turn context rides on the latest user message instead.
    const turnContextInUserMessage = isLocalModel;
    const { stable, conditional } = await buildDhruvSystemPromptParts(
      sanitized,
      turnContextInUserMessage ? { factLimit: 6, anchorsInStable: true } : { factLimit: 6 },
    );
    const normalizedConversation = normalizeProviderConversation(sanitized);
    if (normalizedConversation.length === 0) {
      return Response.json({ error: 'At least one user message is required' }, { status: 400 });
    }
    const providerConversation = turnContextInUserMessage && conditional
      ? withTurnContext(normalizedConversation, conditional)
      : normalizedConversation;
    const promptMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: stable },
      ...(conditional && !turnContextInUserMessage ? [{ role: 'system' as const, content: conditional }] : []),
    ];
    if (isLocalModel) {
      // A recent healthy check is enough; a dead agent still fails fast at the provider call.
      const localStatus = await getLocalAgentStatus({ maxHealthyAgeMs: LOCAL_HEALTH_REUSE_MS });
      const upstreamModel = selectedModel?.upstreamModel.toLowerCase();
      if (!localStatus.healthy || !localStatus.models.some((served) => served.toLowerCase() === upstreamModel)) {
        return createFallbackResponse(latestUserMessage, 'local-agent-unhealthy');
      }
    }

    const { primary, fallbacks } = getChatProviders(selectedModelId);
    const providers = getOrderedProviders(primary, fallbacks)
      .filter((provider) => !image || (provider.supportsImages && provider.imageInputOrder));

    if (providers.length === 0) {
      console.error('No LLM providers are configured; returning local fallback reply.');
      return createFallbackResponse(latestUserMessage, 'no-providers-configured');
    }

    const generateReply = async (onDelta?: (text: string) => void): Promise<ChatReplyPayload> => {
      let result: ProviderCallResult | null = null;
      let streamedAny = false;
      const emitDelta = onDelta && ((text: string) => {
        streamedAny = true;
        onDelta(text);
      });
      const providerErrors: string[] = [];
      const providerFailureCodes: ProviderFailureCode[] = [];

      const fallbackAttemptBudget = providers.length > 1
        ? Math.floor(LLM_PROVIDER_FALLBACK_RESERVE_MS / (providers.length - 1))
        : 0;

      providerLoop: for (let i = 0; i < providers.length; i += 1) {
        const provider = providers[i];
        const fallbackReserveMs = fallbackAttemptBudget * (providers.length - i - 1);
        const apiMessages = [
          ...promptMessages,
          ...toProviderMessages(
            providerConversation,
            image ?? undefined,
            provider.imageInputOrder,
          ),
        ];
        const providerBudgetDeadline = Date.now() + LLM_PROVIDER_TIMEOUT_MS;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          const remainingProviderBudgetMs = providerBudgetDeadline - Date.now();
          const remainingRouteBudgetMs = routeDeadlineAt - Date.now() - fallbackReserveMs;
          const allowedAttemptMs = Math.max(0, Math.min(remainingProviderBudgetMs, remainingRouteBudgetMs));
          const attemptTimeoutMs = Math.min(
            attempt === 0 ? LLM_PROVIDER_TIMEOUT_MS : INVALID_PROVIDER_RESPONSE_RETRY_TIMEOUT_MS,
            allowedAttemptMs,
          );

          if (routeSignal.aborted) break providerLoop;
          if (attemptTimeoutMs <= 0 || (attempt === 1 && attemptTimeoutMs < MIN_INVALID_PROVIDER_RESPONSE_RETRY_MS)) break;

          try {
            result = await callProvider(provider, apiMessages, routeSignal, attemptTimeoutMs, emitDelta);
            break providerLoop;
          } catch (err) {
            const code = getProviderFailureCode(err, request.signal, routeDeadlineController.signal);
            providerFailureCodes.push(code);
            providerErrors.push(`${provider.label}: ${code}`);
            console.warn('LLM provider failed', {
              provider: provider.label.replace(/[\r\n]+/g, ' ').slice(0, 120),
              code,
              errorName: err instanceof Error ? err.name : 'UnknownError',
            });

            // Text the visitor has already seen must not be followed by a different provider's reply.
            if (streamedAny) break providerLoop;
            if (code !== 'invalid-provider-response') break;
          }
        }
      }

      if (!result) {
        console.error('All LLM providers failed; returning local fallback reply.', {
          attempted: providers.map(p => p.label),
          errors: providerErrors,
        });
        return createFallbackPayload(
          latestUserMessage,
          getFallbackReason(providerFailureCodes, request.signal, routeDeadlineController.signal),
        );
      }

      return {
        reply: result.reply,
        action: result.action,
        signature: signAssistantMessage(result.reply, result.action),
        modelId: result.modelId,
      };
    };

    if (body.stream === true) {
      streamOwnsDeadline = true;
      return createStreamingResponse(generateReply, streamCancelController, () => clearTimeout(routeDeadlineTimeout));
    }

    return createReplyResponse(await generateReply());
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (!streamOwnsDeadline) clearTimeout(routeDeadlineTimeout);
  }
}

function createReplyResponse({ fallbackReason, ...payload }: ChatReplyPayload): Response {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Chat-Fallback': payload.degraded ? 'localStatic' : (payload.modelId ?? 'legacy'),
  };
  if (fallbackReason) {
    headers['X-Chat-Fallback-Reason'] = fallbackReason;
  }
  return Response.json(payload, { headers });
}

function createStreamingResponse(
  generate: (onDelta: (text: string) => void) => Promise<ChatReplyPayload>,
  cancelController: AbortController,
  onSettled: () => void,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        if (!cancelController.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const payload = await generate((text) => send({ type: 'delta', text }));
        send({ type: 'done', ...payload });
      } catch (error) {
        // The client treats a stream without `done` as a failed request.
        console.error('Chat stream error:', error);
      } finally {
        onSettled();
        if (!cancelController.signal.aborted) controller.close();
      }
    },
    cancel() {
      cancelController.abort('request-aborted');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': `${CHAT_STREAM_CONTENT_TYPE}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Call a single LLM provider and return the reply/action payload expected by
 * the client.
 */
async function callProvider(
  provider: LLMProvider,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  routeSignal: AbortSignal,
  timeoutMs: number,
  onDelta?: (text: string) => void,
): Promise<ProviderCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('provider-timeout'), timeoutMs);
  const signal = AbortSignal.any([routeSignal, controller.signal]);
  // NVIDIA always streams; the others stream only when the client asked for a streamed reply.
  const stream = provider.kind === 'nvidia' || onDelta !== undefined;

  try {
    let rawContent: string;

    if (provider.kind === 'groq') {
      const groq = new Groq({ apiKey: provider.apiKey, maxRetries: 0 });
      const params = {
        model: provider.model,
        messages: messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
        temperature: provider.sampling.temperature,
        ...(provider.sampling.topP !== undefined ? { top_p: provider.sampling.topP } : {}),
        ...(provider.sampling.maxCompletionTokens !== undefined ? { max_completion_tokens: provider.sampling.maxCompletionTokens } : {}),
        ...provider.sampling.extraBody,
      };
      if (stream) {
        rawContent = await readCompletionStream(await groq.chat.completions.create({ ...params, stream: true }, { signal }), signal, onDelta);
      } else {
        const completion = await groq.chat.completions.create({ ...params, stream: false }, { signal });
        rawContent = getDeltaText(completion.choices?.[0]?.message?.content);
      }
    } else {
      const collapsedMessages = provider.acceptsSystemMessages === false
        ? foldSystemMessagesIntoFirstUser(messages)
        : collapseLeadingSystemMessages(messages);
      const client = createProviderClient(provider);
      const params = {
        model: provider.model,
        messages: collapsedMessages,
        temperature: provider.sampling.temperature,
        ...(provider.sampling.topP !== undefined ? { top_p: provider.sampling.topP } : {}),
        ...(provider.sampling.maxTokens !== undefined ? { max_tokens: provider.sampling.maxTokens } : {}),
        ...provider.sampling.extraBody,
      };
      if (stream) {
        rawContent = await readCompletionStream(await client.chat.completions.create({ ...params, stream: true }, { signal }), signal, onDelta);
      } else {
        const completion = await client.chat.completions.create({ ...params, stream: false }, { signal });
        rawContent = getDeltaText(completion.choices?.[0]?.message?.content);
      }
    }

    const rawReply = stripThinkTags(rawContent);
    const reply = finalizeAssistantReplyText(rawReply);

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
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
  if (status === 429 || status === 503) {
    return 'provider-busy';
  }
  return 'provider-error';
}

async function readCompletionStream(
  chunks: AsyncIterable<{ choices?: Array<{ delta?: { content?: unknown } }> }>,
  signal: AbortSignal,
  onDelta?: (text: string) => void,
): Promise<string> {
  let raw = '';
  let shown = '';
  for await (const chunk of chunks) {
    if (signal.aborted) throw new OpenAI.APIUserAbortError();
    raw += getDeltaText(chunk.choices?.[0]?.delta?.content);
    if (!onDelta) continue;
    // Only forward text that extends what was already shown; the final `done` event corrects the rest.
    const preview = getStreamingPreview(raw);
    if (preview.length > shown.length && preview.startsWith(shown)) {
      onDelta(preview.slice(shown.length));
      shown = preview;
    }
  }
  if (signal.aborted) throw new OpenAI.APIUserAbortError();
  return raw;
}

function getStreamingPreview(raw: string): string {
  // Hide reasoning blocks, including one that is still open.
  return sanitizeAssistantReplyText(raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ''));
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
