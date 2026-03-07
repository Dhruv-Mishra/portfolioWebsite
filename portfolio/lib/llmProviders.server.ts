import 'server-only';

import OpenAI from 'openai';

export interface LLMProvider {
  apiKey: string;
  baseURL: string;
  model: string;
  label: string;
}

export function getChatProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null } {
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

export function getSuggestionsProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null } {
  const primaryModel = process.env.LLM_SUGGESTIONS_MODEL || process.env.LLM_MODEL;
  const fallbackModel = process.env.LLM_FALLBACK_SUGGESTIONS_MODEL || process.env.LLM_FALLBACK_MODEL;

  const primary = (process.env.LLM_API_KEY && process.env.LLM_BASE_URL && primaryModel)
    ? {
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL,
        model: primaryModel,
        label: primaryModel,
      }
    : null;

  const fallback = (process.env.LLM_FALLBACK_API_KEY && process.env.LLM_FALLBACK_BASE_URL && fallbackModel)
    ? {
        apiKey: process.env.LLM_FALLBACK_API_KEY,
        baseURL: process.env.LLM_FALLBACK_BASE_URL,
        model: fallbackModel,
        label: fallbackModel,
      }
    : null;

  return { primary, fallback };
}

export function createProviderClient(provider: LLMProvider): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
  });
}