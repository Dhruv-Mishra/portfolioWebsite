import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const nginxSource = fs
  .readFileSync(path.join(process.cwd(), 'nginx-cloudflare.conf'), 'utf8')
  .replace(/\r\n/g, '\n');

function extractLocationBlock(location: string): string {
  const needle = `location ${location} {`;
  const start = nginxSource.indexOf(needle);
  expect(start, `missing ${needle}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = start; index < nginxSource.length; index += 1) {
    const character = nginxSource[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return nginxSource.slice(start, index + 1);
      }
    }
  }

  throw new Error(`unclosed location ${location}`);
}

describe('nginx cache header contract', () => {
  it('keeps cookie-gated pages and APIs uncached while HTML stays in the page cache', () => {
    const admin = extractLocationBlock('^~ /admin');
    const matrixNotes = extractLocationBlock('^~ /matrix-notes');
    const api = extractLocationBlock('/api/');
    const pages = extractLocationBlock('/');

    expect(admin).toContain('proxy_cache off;');
    expect(matrixNotes).toContain('proxy_cache off;');
    expect(api).toContain('proxy_cache off;');
    expect(pages).toContain('proxy_cache __SERVICE_NAME___cache;');
    expect(pages).not.toContain('proxy_cache off;');
  });

  it('serves /voice/ from disk with immutable cache and missing-asset fallback', () => {
    const voice = extractLocationBlock('/voice/');

    expect(voice).toContain('alias __STANDALONE_DIR__/public/voice/;');
    expect(voice).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(voice).toMatch(/types\s*\{[\s\S]*application\/javascript js;/);
    expect(voice).toContain('error_page 404 = @missing_asset;');
  });
});
