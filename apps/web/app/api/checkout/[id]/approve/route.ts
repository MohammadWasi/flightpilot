import { NextRequest } from 'next/server';
import { getService, rateLimit } from '@flightpilot/core';
import { endpoint, json, readBody, requireUser, sameOrigin } from '../../../../../lib/http';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    sameOrigin(request);
    const user = requireUser(request, true);
    rateLimit(`approve:${user}`, 12);
    const { id } = await context.params;
    return json(await (await getService()).approve(user, id, await readBody(request)));
  });
}
