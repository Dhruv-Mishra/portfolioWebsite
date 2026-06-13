import type { APIRoute } from 'astro';
import { buildIndexMarkdown } from '@/lib/llmContent.server';
import { markdownHeaders } from '@/lib/routeHeaders';

export const prerender = true;

export const GET: APIRoute = () => new Response(buildIndexMarkdown(), {
  headers: markdownHeaders('/'),
});