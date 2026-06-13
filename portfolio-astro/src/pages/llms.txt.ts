import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '@/lib/llmContent.server';
import { markdownHeaders } from '@/lib/routeHeaders';

export const prerender = true;

export const GET: APIRoute = () => new Response(buildLlmsTxt(), {
  headers: markdownHeaders(),
});