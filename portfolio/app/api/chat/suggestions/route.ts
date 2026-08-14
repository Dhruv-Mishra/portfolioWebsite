// app/api/chat/suggestions/route.ts — Generate contextual follow-up suggestions via LLM
import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { BoundedJsonError, readBoundedJson } from '@/lib/boundedJson.server';
import { parseSuggestionResponse } from '@/lib/chatSanitization';
import {
  LLM_SUGGESTIONS_FALLBACK_RESERVE_MS,
  LLM_SUGGESTIONS_PARAMS,
  LLM_SUGGESTIONS_PROVIDER_TIMEOUT_MS,
  LLM_SUGGESTIONS_TIMEOUT_MS,
  RATE_LIMIT_CONFIG,
  isRawLogEnabled,
  stripThinkTags,
} from '@/lib/llmConfig';
import { createProviderClient, getSuggestionsProviders, type LLMProvider } from '@/lib/llmProviders.server';
import { createServerRateLimiter, getClientIP } from '@/lib/serverRateLimit';
import { validateOrigin } from '@/lib/validateOrigin';
import { isClientChatMessage } from '@/lib/chatMessageSchema';
import { verifyAssistantMessage } from '@/lib/chatHistory.server';
import { SUGGESTIONS_SYSTEM_PROMPT } from '@/lib/chatSuggestionsPrompt.server';

export const runtime = 'nodejs';

const suggestionsRateLimiter = createServerRateLimiter({ ...RATE_LIMIT_CONFIG.suggestions, maxTrackedIPs: 500, cleanupInterval: 50 });
const MAX_SUGGESTIONS_BODY_BYTES = 8_000;

type SuggestionMessage = { role: 'user' | 'assistant'; content: string };

function normalizeSuggestionContext(messages: SuggestionMessage[]): SuggestionMessage[] {
  const normalized: SuggestionMessage[] = [];

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

  return normalized;
}

export async function POST(request: NextRequest) {
  const routeDeadlineController = new AbortController();
  const routeDeadlineAt = Date.now() + LLM_SUGGESTIONS_TIMEOUT_MS;
  const routeDeadlineTimeout = setTimeout(
    () => routeDeadlineController.abort('server-deadline-exceeded'),
    LLM_SUGGESTIONS_TIMEOUT_MS,
  );
  const routeSignal = AbortSignal.any([request.signal, routeDeadlineController.signal]);

  try {
    // Block cross-origin requests
    const originError = validateOrigin(request, { requireOrigin: true });
    if (originError) return originError;

    const ip = getClientIP(request);
    const { limited, retryAfter } = suggestionsRateLimiter.check(ip);
    if (limited) {
      return Response.json({ suggestions: [] }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
    }

    let body: { messages?: unknown };
    try {
      body = await readBoundedJson<{ messages?: unknown }>(request, MAX_SUGGESTIONS_BODY_BYTES, routeSignal);
    } catch (error) {
      if (error instanceof BoundedJsonError) {
        return Response.json({ suggestions: [] }, { status: error.status });
      }
      throw error;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ suggestions: [] }, { status: 400 });
    }

    // Validate messages shape: must be an array of {role: 'user'|'assistant', content}.
    // System/tool roles are blocked here so a hostile caller cannot inject
    // prompt-system context through the suggestions endpoint (P1-6).
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: SuggestionMessage[] = [];
    for (const raw of rawMessages) {
      if (typeof raw !== 'object' || raw === null || !isClientChatMessage(raw as { role?: unknown; content?: unknown })) {
        continue;
      }

      const message = raw as { role: 'user' | 'assistant'; content: unknown; signature?: unknown; action?: unknown };
      if (message.role === 'user') {
        messages.push({ role: 'user', content: String(message.content) });
        continue;
      }

      const verified = verifyAssistantMessage({
        role: 'assistant',
        content: String(message.content),
        signature: typeof message.signature === 'string' ? message.signature : undefined,
        action: message.action ?? null,
      });
      if (verified) {
        messages.push({ role: 'assistant', content: verified.content });
      }
    }

    // Take last 4 messages for context (lightweight)
    const context = normalizeSuggestionContext(messages
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 300) }))
      .slice(-4));

    const recentUserMessage = [...context].reverse().find(message => message.role === 'user')?.content;
    const recentAssistantMessage = [...context].reverse().find(message => message.role === 'assistant')?.content;

    const { primary, fallback, legacyFallback } = getSuggestionsProviders();
    const providers = [primary, fallback, legacyFallback].filter((provider): provider is LLMProvider => provider != null);
    const fallbackAttemptBudget = providers.length > 1
      ? Math.floor(LLM_SUGGESTIONS_FALLBACK_RESERVE_MS / (providers.length - 1))
      : 0;
    let suggestions: string[] = [];

    for (let i = 0; i < providers.length; i += 1) {
      const remainingMs = routeDeadlineAt - Date.now();
      const fallbackReserveMs = fallbackAttemptBudget * (providers.length - i - 1);
      const attemptTimeoutMs = Math.min(
        LLM_SUGGESTIONS_PROVIDER_TIMEOUT_MS,
        Math.max(0, remainingMs - fallbackReserveMs),
      );
      if (routeSignal.aborted) break;
      if (attemptTimeoutMs <= 0) continue;

      try {
        suggestions = await callSuggestionsProvider(
          providers[i],
          context,
          routeSignal,
          attemptTimeoutMs,
          recentUserMessage,
          recentAssistantMessage,
        );
        break;
      } catch (error) {
        console.warn('Suggestions provider failed', {
          provider: providers[i].label.replace(/[\r\n]+/g, ' ').slice(0, 120),
          code: routeDeadlineController.signal.aborted
            ? 'server-deadline-exceeded'
            : request.signal.aborted
              ? 'request-aborted'
              : error instanceof Error && error.name === 'AbortError'
                ? 'provider-timeout'
                : 'provider-error',
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    return Response.json({ suggestions }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ suggestions: [] });
  } finally {
    clearTimeout(routeDeadlineTimeout);
  }
}

async function callSuggestionsProvider(
  provider: LLMProvider,
  context: SuggestionMessage[],
  routeSignal: AbortSignal,
  timeoutMs: number,
  recentUserMessage?: string,
  recentAssistantMessage?: string,
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('provider-timeout'), timeoutMs);
  const signal = AbortSignal.any([routeSignal, controller.signal]);

  try {
    const client = createProviderClient(provider);
    const suggestionMaxTokens = Math.min(
      provider.sampling.maxTokens
        ?? provider.sampling.maxCompletionTokens
        ?? LLM_SUGGESTIONS_PARAMS.maxTokens,
      LLM_SUGGESTIONS_PARAMS.maxTokens,
    );
    const completionTokenLimit = provider.kind === 'groq'
      ? {
          max_completion_tokens: Math.min(
            provider.sampling.maxCompletionTokens ?? suggestionMaxTokens,
            LLM_SUGGESTIONS_PARAMS.maxTokens,
          ),
        }
      : { max_tokens: suggestionMaxTokens };
    const instruction = 'Generate 2 follow-up suggestions for the user.';
    const lastContextMessage = context.at(-1);
    const messages = lastContextMessage?.role === 'user'
      ? [
          ...context.slice(0, -1),
          { role: 'user' as const, content: `${lastContextMessage.content}\n\n${instruction}` },
        ]
      : [...context, { role: 'user' as const, content: instruction }];
    const completion = await client.chat.completions.create({
      model: provider.model,
      messages: [
        { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
        ...messages,
      ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: provider.sampling.temperature,
      ...(provider.sampling.topP !== undefined ? { top_p: provider.sampling.topP } : {}),
      ...completionTokenLimit,
      ...provider.sampling.extraBody,
      stream: false,
    }, {
      signal,
    });

    const rawContent = completion.choices?.[0]?.message?.content || '';
    const raw = stripThinkTags(typeof rawContent === 'string' ? rawContent : '');

    if (isRawLogEnabled()) {
      const thinking = typeof rawContent === 'string' && rawContent !== raw ? rawContent.match(/<think>([\s\S]*?)<\/think>/i)?.[1]?.trim() : undefined;
      console.log('[SUGGESTIONS RAW]', { model: provider.model, raw: rawContent, clean: raw, ...(thinking ? { thinking } : {}) });
    }

    const suggestions = parseSuggestionResponse(raw, { recentUserMessage, recentAssistantMessage });

    if (suggestions.length !== 2) {
      throw new Error('Suggestions provider returned invalid output');
    }

    return suggestions;
  } catch (error) {
    if (error instanceof Error && error.message === 'Suggestions provider returned invalid output') {
      throw error;
    }
    if (signal.aborted) {
      throw new DOMException('Suggestions provider aborted', 'AbortError');
    }
    throw new Error('Suggestions provider failed');
  } finally {
    clearTimeout(timeout);
  }
}
