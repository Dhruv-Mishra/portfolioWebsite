import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as legacyChatPost } from '@/app/api/chat/route';
import { POST as legacySuggestionsPost } from '@/app/api/chat/suggestions/route';
import { POST as publicChatPost } from '@/app/chat/respond/route';
import { POST as publicSuggestionsPost } from '@/app/chat/suggestions/route';
import { CHAT_RESPONSE_ENDPOINT, CHAT_SUGGESTIONS_ENDPOINT } from '@/lib/chatEndpoints';
import fs from 'node:fs';
import path from 'node:path';

const portfolioRoot = path.resolve(__dirname, '..', '..');

function readPortfolioFile(...segments: string[]) {
  return fs.readFileSync(path.join(portfolioRoot, ...segments), 'utf8');
}

function createCrossOriginRequest(pathname: string) {
  return new NextRequest(`https://whoisdhruv.com${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.com',
    },
    body: JSON.stringify({ messages: [] }),
  });
}

describe('public chat route aliases', () => {
  it('exports the public chat endpoint constants', () => {
    expect(CHAT_RESPONSE_ENDPOINT).toBe('/chat/respond');
    expect(CHAT_SUGGESTIONS_ENDPOINT).toBe('/chat/suggestions');
  });

  it('shares the secured legacy chat handlers', () => {
    expect(publicChatPost).toBe(legacyChatPost);
    expect(publicSuggestionsPost).toBe(legacySuggestionsPost);
  });

  it('rejects cross-origin requests through both aliases', async () => {
    await expect(publicChatPost(createCrossOriginRequest(CHAT_RESPONSE_ENDPOINT))).resolves.toMatchObject({ status: 403 });
    await expect(publicSuggestionsPost(createCrossOriginRequest(CHAT_SUGGESTIONS_ENDPOINT))).resolves.toMatchObject({ status: 403 });
  });

  it('uses public paths for client, proxy, staging smoke, and local health probes', () => {
    const hookSource = readPortfolioFile('hooks', 'useStickyChat.ts');
    const nginxSource = readPortfolioFile('nginx-cloudflare.conf');
    const workflowSource = readPortfolioFile('..', '.github', 'workflows', 'deploy-staging.yml');
    const deploySource = readPortfolioFile('scripts', 'deploy.sh');

    expect(hookSource).toContain('fetch(CHAT_RESPONSE_ENDPOINT');
    expect(hookSource).toContain('fetch(CHAT_SUGGESTIONS_ENDPOINT');
    expect(hookSource).not.toMatch(/fetch\(['"]\/api\/chat/);

    expect(nginxSource).toContain('location /api/chat {');
    expect(nginxSource).toMatch(/location = \/chat\/respond \{[\s\S]*?limit_req zone=api burst=5 nodelay;[\s\S]*?proxy_buffering off;[\s\S]*?proxy_cache off;[\s\S]*?proxy_read_timeout 120s;[\s\S]*?chunked_transfer_encoding on;/);
    expect(nginxSource).toMatch(/location = \/chat\/suggestions \{[\s\S]*?limit_req zone=api burst=5 nodelay;[\s\S]*?proxy_cache off;/);

    expect(workflowSource).toContain('https://${{ env.STAGING_DOMAIN }}/chat/respond');
    expect(workflowSource).not.toContain('https://${{ env.STAGING_DOMAIN }}/api/chat');
    expect(workflowSource).toContain('cf-mitigated:');
    expect(workflowSource).toContain("Cloudflare challenged the GitHub runner's staging chat probe after all VM-local checks passed");
    expect(workflowSource).not.toContain('Cloudflare challenged the required staging chat smoke probe');
    expect(workflowSource).toContain('application/json');
    expect(workflowSource).toContain("body?.action?.navigateTo !== '/about'");

    expect(deploySource).toContain('"http://127.0.0.1:${NEXTJS_PORT}/chat/respond"');
    expect(deploySource).toContain('-H "Sec-Fetch-Site: same-origin"');
  });
});