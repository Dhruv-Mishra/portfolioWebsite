import { NextRequest } from 'next/server';
import { getVoiceHealthStatus } from '@/lib/voiceSession.server';
import { validateOrigin } from '@/lib/validateOrigin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const originError = validateOrigin(request);
  if (originError) return originError;
  return Response.json(getVoiceHealthStatus());
}
