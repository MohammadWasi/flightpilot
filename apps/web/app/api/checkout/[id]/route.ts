import { NextRequest } from 'next/server';
import { getService, safeCheckout, safeOffer } from '@flightpilot/core';
import { endpoint, json, requireUser } from '../../../../lib/http';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const user = requireUser(request, true);
    const { id } = await context.params;
    const checkout = await (await getService()).checkout(user, id);
    return json({ checkout: safeCheckout(checkout), offer: safeOffer(checkout.offer) });
  });
}
