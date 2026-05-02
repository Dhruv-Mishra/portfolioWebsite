import 'server-only';

import OpenAI from 'openai';

export type LLMProviderKind = 'groq' | 'openai';

export interface LLMProvider {
  kind: LLMProviderKind;
  apiKey: string;
  baseURL: string;
  model: string;
  label: string;
}

const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

function isFallbackModelEnabled(): boolean {
  return process.env.LLM_ENABLE_FALLBACK_MODEL === 'true';
}

function getGroqProvider(modelOverride?: string): LLMProvider | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const model = modelOverride || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  return {
    kind: 'groq',
    apiKey,
    baseURL: GROQ_BASE_URL,
    model,
    label: `groq:${model}`,
  };
}

export function getChatProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null } {
  // Groq is always primary when configured. Existing LLM_* config becomes the fallback.
  const groq = getGroqProvider();

  const legacyPrimary: LLMProvider | null = (process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL)
    ? {
        kind: 'openai',
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL,
        model: process.env.LLM_MODEL,
        label: process.env.LLM_MODEL,
      }
    : null;

  const legacyFallback: LLMProvider | null = (isFallbackModelEnabled() && process.env.LLM_FALLBACK_API_KEY && process.env.LLM_FALLBACK_BASE_URL && process.env.LLM_FALLBACK_MODEL)
    ? {
        kind: 'openai',
        apiKey: process.env.LLM_FALLBACK_API_KEY,
        baseURL: process.env.LLM_FALLBACK_BASE_URL,
        model: process.env.LLM_FALLBACK_MODEL,
        label: process.env.LLM_FALLBACK_MODEL,
      }
    : null;

  if (groq) {
    // Groq primary; first available legacy slot becomes fallback.
    return { primary: groq, fallback: legacyPrimary ?? legacyFallback };
  }

  return { primary: legacyPrimary, fallback: legacyFallback };
}

export function getSuggestionsProviders(): { primary: LLMProvider | null; fallback: LLMProvider | null } {
  const primaryModel = process.env.LLM_SUGGESTIONS_MODEL || process.env.LLM_MODEL;
  const fallbackModel = process.env.LLM_FALLBACK_SUGGESTIONS_MODEL || process.env.LLM_FALLBACK_MODEL;

  const primary: LLMProvider | null = (process.env.LLM_API_KEY && process.env.LLM_BASE_URL && primaryModel)
    ? {
        kind: 'openai',
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL,
        model: primaryModel,
        label: primaryModel,
      }
    : null;

  const fallback: LLMProvider | null = (isFallbackModelEnabled() && process.env.LLM_FALLBACK_API_KEY && process.env.LLM_FALLBACK_BASE_URL && fallbackModel)
    ? {
        kind: 'openai',
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