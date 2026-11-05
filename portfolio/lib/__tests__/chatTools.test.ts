import { describe, expect, it } from 'vitest';

import { toolCallsToAction } from '@/lib/chatTools';

const call = (name: string, args: unknown) => ({ name, arguments: typeof args === 'string' ? args : JSON.stringify(args) });

describe('toolCallsToAction', () => {
  it('maps each chat tool to its action field', () => {
    expect(toolCallsToAction([call('set_preference', { key: 'sound-effects', enabled: false })]))
      .toEqual({ preferenceAction: { key: 'sound-effects', enabled: false } });
    expect(toolCallsToAction([call('start_voice_session', {})])).toEqual({ voiceSessionAction: true });
    expect(toolCallsToAction([call('open_feedback', '')])).toEqual({ feedbackAction: true });
  });

  it('keeps the first of two conflicting calls and ignores malformed or repeated ones', () => {
    expect(toolCallsToAction([
      call('navigate_to', { path: '/guestbook' }),
      call('open_project', { slug: 'cropio' }),
      call('navigate_to', { path: '/about' }),
      call('set_theme', '{"action":'),
      call('set_theme', { action: 'light' }),
    ])).toEqual({ navigateTo: '/guestbook', themeAction: 'light' });
  });

  it('returns null when nothing valid was called', () => {
    expect(toolCallsToAction([call('navigate_to', { path: '/admin' }), call('scroll_page', { direction: 'down' })])).toBeNull();
  });
});
