import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/tts/route';

describe('/api/tts security', () => {
  it('rejects headerless GET preload requests before warming the model', async () => {
    const response = await GET(new Request('http://localhost/api/tts') as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });
});
