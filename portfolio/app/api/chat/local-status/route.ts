import { getLocalAgentStatus } from '@/lib/localAgentStatus.server';

const UNAVAILABLE_STATUS = { healthy: false, modelName: 'Local model' };

export async function GET(): Promise<Response> {
  let status = UNAVAILABLE_STATUS;

  try {
    status = await getLocalAgentStatus();
  } catch {
    // The client only needs the safe fallback when discovery is unavailable.
  }

  return Response.json(status, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}