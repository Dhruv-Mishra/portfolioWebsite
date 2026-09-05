import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { TERMINAL_COMMAND_NAME_SET } from '@/lib/terminalCommandNames';
import { createCommandRegistry } from '@/lib/terminalCommands';

const socialSidebar = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SocialSidebar.tsx'),
  'utf8',
);

describe('settings discovery', () => {
  it('includes settings in terminal autocomplete', () => {
    expect(TERMINAL_COMMAND_NAME_SET.has('settings')).toBe(true);
  });

  it('registers a terminal settings command with a clean route target', () => {
    vi.useFakeTimers();
    const push = vi.fn();
    const result = createCommandRegistry({ push } as never).settings([]);

    expect(result).toMatchObject({ output: 'Opening site settings...' });
    if ('action' in result) result.action?.();
    vi.runAllTimers();
    expect(push).toHaveBeenCalledWith('/settings');
    vi.useRealTimers();
  });

  it('publishes the settings route in the sitemap', () => {
    expect(sitemap()).toContainEqual(expect.objectContaining({
      url: 'https://whoisdhruv.com/settings',
    }));
  });

  it('keeps a 44px settings link in persistent desktop and mobile chrome', () => {
    expect(socialSidebar).toMatch(/href="\/settings"/);
    expect(socialSidebar).toMatch(/aria-label="Open settings"/);
    expect(socialSidebar).toMatch(/<Tooltip label="Settings">/);
    expect(socialSidebar).toMatch(/<SettingsLink onPress=/);
    expect(socialSidebar).toMatch(/<SettingsLink isMobile onPress=/);
    expect(socialSidebar).toMatch(/h-11 w-11/);
  });
});