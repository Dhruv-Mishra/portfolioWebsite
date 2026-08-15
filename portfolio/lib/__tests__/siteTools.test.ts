import { describe, expect, it } from 'vitest';
import { SITE_TOOL_DECLARATIONS, VOICE_LIVE_TOOL_DECLARATIONS, assertCompleteToolCatalog } from '@/lib/siteToolDeclarations';
import { SITE_TOOL_NAMES } from '@/lib/siteTools';
import { parseSiteToolCall } from '@/lib/siteToolValidation';

describe('site tool catalog', () => {
  it('declares every shared tool exactly once', () => {
    expect(() => assertCompleteToolCatalog()).not.toThrow();
    expect(SITE_TOOL_DECLARATIONS.map(tool => tool.name).sort()).toEqual([...SITE_TOOL_NAMES].sort());
    expect(VOICE_LIVE_TOOL_DECLARATIONS.map(tool => tool.name)).not.toContain('start_voice_session');
    expect(VOICE_LIVE_TOOL_DECLARATIONS).toHaveLength(SITE_TOOL_DECLARATIONS.length - 1);
  });

  it('accepts valid navigate and guestbook calls', () => {
    expect(parseSiteToolCall({
      id: '1',
      name: 'navigate_to',
      args: { path: '/projects' },
    })).toEqual({
      id: '1',
      name: 'navigate_to',
      args: { path: '/projects' },
    });

    expect(parseSiteToolCall({
      name: 'submit_guestbook',
      args: { message: 'Loved the sketchbook notes.', name: 'Ada' },
    })).toMatchObject({
      name: 'submit_guestbook',
      args: { message: 'Loved the sketchbook notes.', name: 'Ada' },
    });
  });

  it('rejects unknown tools and unsafe args', () => {
    expect(parseSiteToolCall({ name: 'rm_rf', args: {} })).toBeNull();
    expect(parseSiteToolCall({ name: 'navigate_to', args: { path: '/admin' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'open_link', args: { key: 'evil' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'submit_guestbook', args: { message: 'hi' } })).toBeNull();
    expect(parseSiteToolCall({ name: 'fill_field', args: { field: 'password', value: 'x' } })).toBeNull();
    expect(parseSiteToolCall({
      name: 'fill_field',
      args: { field: 'chat-composer', value: 'hello', submit: true },
    })).toBeNull();
    expect(parseSiteToolCall({
      name: 'fill_field',
      args: { field: 'terminal-input', value: 'help', submit: true },
    })).toBeNull();
    expect(parseSiteToolCall({
      name: 'submit_guestbook',
      args: { message: 'Visit https://example.com for more notes.' },
    })).toBeNull();
  });
});
