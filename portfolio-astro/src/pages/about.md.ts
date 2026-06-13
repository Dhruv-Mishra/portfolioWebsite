import type { APIRoute } from 'astro';
import { buildAboutMarkdown } from '@/lib/llmContent.server';
import { markdownHeaders } from '@/lib/routeHeaders';

export const prerender = true;

export const GET: APIRoute = () => new Response(buildAboutMarkdown(), {
  headers: markdownHeaders('/about'),
});