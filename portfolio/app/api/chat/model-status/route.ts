import { getKnownLocalAgentStatus } from '@/lib/localAgentStatus.server';
import { getChatModelRuntimeCatalog } from '@/lib/llmProviders.server';
import { getModelHealthAdvisory } from '@/lib/modelHealth.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json({
    ...getChatModelRuntimeCatalog(),
    localModelStatus: getKnownLocalAgentStatus(),
    advisoryHealth: await getModelHealthAdvisory(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}