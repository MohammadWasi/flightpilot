import { NextRequest } from 'next/server';
import { getService } from '@flightpilot/core';
import { endpoint, json, requireUser } from '../../../lib/http';
export async function GET(request: NextRequest) {
  return endpoint(async () => {
    const userId = requireUser(request);
    const s = await getService();
    return json({
      userId,
      provider: s.provider.id,
      mode: s.config.mode,
      environment: s.provider.capabilities.environment,
    });
  });
}
