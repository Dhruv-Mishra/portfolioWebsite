import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const navigation = fs.readFileSync(
  path.join(process.cwd(), 'components', 'Navigation.tsx'),
  'utf8',
);

describe('navigation pending destination contract', () => {
  it('activates tabs from the live page-turn destination when one exists', () => {
    expect(navigation).toContain('subscribeToPageTurn');
    expect(navigation).toContain('getPageTurnSnapshot');
    expect(navigation).toContain('getServerPageTurnSnapshot');
    expect(navigation).toContain('useSyncExternalStore(');
    expect(navigation).toContain('const visualPath = transition?.toPath ?? pathname');
    expect(navigation).toContain('active={visualPath === item.href}');
  });
});
