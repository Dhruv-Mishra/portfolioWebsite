import { getKnownLocalAgentStatus } from '@/lib/localAgentStatus.server';
import { getChatModelRuntimeCatalog } from '@/lib/llmProviders.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    ...getChatModelRuntimeCatalog(),
    localModelStatus: getKnownLocalAgentStatus(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}