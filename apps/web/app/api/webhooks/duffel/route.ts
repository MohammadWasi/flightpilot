import { NextRequest } from 'next/server';
import { getService, handleWebhook, rateLimit } from '@flightpilot/core';
import { endpoint, json, readText } from '../../../../lib/http';
export async function POST(request: NextRequest) {
  return endpoint(async () => {
    rateLimit('webhooks', 120);
    return json(
      await handleWebhook(
        await getService(),
        await readText(request, 262144),
        request.headers.get('x-duffel-signature') ?? '',
      ),
    );
  });
}
