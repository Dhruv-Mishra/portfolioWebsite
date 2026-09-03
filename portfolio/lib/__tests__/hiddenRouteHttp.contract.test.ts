import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, proxy } from '../../proxy';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

function requestFor(pathname: string, cookie?: string): NextRequest {
  const headers = cookie ? { cookie } : undefined;
  return new NextRequest(`https://whoisdhruv.com${pathname}`, { headers });
}

function rewrittenPath(response: Response): string | null {
  const rewrite = response.headers.get('x-middleware-rewrite');
  if (!rewrite) return null;
  return new URL(rewrite).pathname;
}

describe('hidden-route HTTP 404 contract', () => {
  it('matches only /admin and /matrix-notes page trees, never /api/', () => {
    const source = read('proxy.ts');
    expect(config.matcher).toEqual([
      '/admin',
      '/admin/:path*',
      '/matrix-notes',
      '/matrix-notes/:path*',
    ]);
    expect(source).not.toContain('/api/');
    expect(config.matcher.join('\n')).not.toContain('/api/');
  });

  it('rewrites missing-cookie hidden pages to the site 404 UI with HTTP 404', () => {
    for (const pathname of ['/admin', '/admin/console', '/matrix-notes', '/matrix-notes/wall']) {
      const response = proxy(requestFor(pathname));
      expect(response.status, pathname).toBe(404);
      expect(rewrittenPath(response), pathname).toBe('/_not-found');
    }
  });

  it('lets cookie-present hidden pages continue to HMAC verification', () => {
    const admin = proxy(requestFor('/admin', 'dhruv_admin_unlock=present'));
    const notes = proxy(requestFor('/matrix-notes', 'dhruv_matrix_notes_access=present'));
    expect(admin.status).toBe(200);
    expect(notes.status).toBe(200);
    expect(admin.headers.get('x-middleware-next')).toBe('1');
    expect(notes.headers.get('x-middleware-next')).toBe('1');
    expect(rewrittenPath(admin)).toBeNull();
    expect(rewrittenPath(notes)).toBeNull();
  });

  it('does not treat /api/admin or /api/matrix-notes as hidden pages', () => {
    const adminApi = proxy(requestFor('/api/admin/unlock'));
    const notesApi = proxy(requestFor('/api/matrix-notes'));
    expect(adminApi.headers.get('x-middleware-next')).toBe('1');
    expect(notesApi.headers.get('x-middleware-next')).toBe('1');
    expect(rewrittenPath(adminApi)).toBeNull();
    expect(rewrittenPath(notesApi)).toBeNull();
  });
});
