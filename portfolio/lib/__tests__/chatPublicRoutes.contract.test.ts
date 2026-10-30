import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as publicChatPost } from '@/app/chat/respond/route';
import { POST as publicSuggestionsPost } from '@/app/chat/suggestions/route';
import { CHAT_RESPONSE_ENDPOINT, CHAT_SUGGESTIONS_ENDPOINT } from '@/lib/chatEndpoints';

function createCrossOriginRequest(pathname: string, modelId?: string) {
  return new NextRequest(`https://whoisdhruv.com${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.com',
    },
    body: JSON.stringify({ messages: [], ...(modelId ? { model: modelId } : {}) }),
  });
}

describe('public chat route aliases', () => {
  it('rejects cross-origin requests through both aliases', async () => {
    await expect(publicChatPost(createCrossOriginRequest(CHAT_RESPONSE_ENDPOINT, 'qwen-3.5-4b-local'))).resolves.toMatchObject({ status: 403 });
    await expect(publicSuggestionsPost(createCrossOriginRequest(CHAT_SUGGESTIONS_ENDPOINT))).resolves.toMatchObject({ status: 403 });
  });
});