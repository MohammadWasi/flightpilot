import { getService } from '@flightpilot/core';
import { endpoint, json } from '../../../lib/http';
export const runtime = 'nodejs';
export async function GET() {
  return endpoint(async () => {
    const service = await getService();
    return json({
      status: 'ok',
      provider: service.provider.id,
      mode: service.config.mode,
      environment: service.provider.capabilities.environment,
      productionBooking: false,
    });
  });
}
