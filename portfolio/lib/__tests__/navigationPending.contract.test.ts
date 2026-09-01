import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const navigation = fs.readFileSync(
  path.join(process.cwd(), 'components', 'Navigation.tsx'),
  'utf8',
);

describe('navigation pending destination contract', () => {
  it('activates tabs from the live pathname and warms other routes after a stable delay', () => {
    expect(navigation).not.toContain('subscribeToPageTurn');
    expect(navigation).not.toContain('getPageTurnSnapshot');
    expect(navigation).not.toContain('getServerPageTurnSnapshot');
    expect(navigation).not.toContain('useSyncExternalStore(');
    expect(navigation).toContain('prefetch={false}');
    expect(navigation).not.toContain('prefetch={item.prefetch}');
    expect(navigation).toContain('canWarmNoncriticalAssets');
    expect(navigation).toContain('router.prefetch');
    expect(navigation).toContain('3000');
    expect(navigation).toContain('active={pathname === item.href}');
  });
});
