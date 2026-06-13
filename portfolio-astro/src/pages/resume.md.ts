import type { APIRoute } from 'astro';
import { buildResumeMarkdown } from '@/lib/llmContent.server';
import { markdownHeaders } from '@/lib/routeHeaders';

export const prerender = true;

export const GET: APIRoute = () => new Response(buildResumeMarkdown(), {
  headers: markdownHeaders('/resume'),
});