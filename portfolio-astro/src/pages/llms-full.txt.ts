import type { APIRoute } from 'astro';
import { buildLlmsFullTxt } from '@/lib/llmContent.server';
import { markdownHeaders } from '@/lib/routeHeaders';

export const prerender = true;

export const GET: APIRoute = () => new Response(buildLlmsFullTxt(), {
  headers: markdownHeaders(),
});