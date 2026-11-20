import { describe, expect, it } from 'vitest';
import config from '@/next.config';

describe('public navigation configuration', () => {
  it('redirects old resume links to the resume anchor', async () => {
    expect(await config.redirects?.()).toContainEqual({ source: '/resume', destination: '/about#resume', permanent: true });
  });
});
