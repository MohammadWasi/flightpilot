import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { registrationArgs } from '../../scripts/agent-config';
const token = process.env.PLAYWRIGHT_API_TOKEN ?? 'flightpilot-e2e-only-token-0000000000000000';
test.beforeEach(async ({ request }) => {
  const r = await request.get('/api/health');
  expect(await r.json()).toMatchObject({ mode: 'simulation', productionBooking: false });
});
for (const agent of ['codex', 'claude'] as const) {
  test(`${agent} launch configuration reaches real backend search and checkout preparation`, async ({
    baseURL,
  }) => {
    const launch = registrationArgs(agent);
    const divider = launch.indexOf('--');
    const client = new Client({ name: `${agent}-configuration-integration`, version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: launch[divider + 1]!,
      args: launch.slice(divider + 2),
      env: {
        ...getDefaultEnvironment(),
        FLIGHTPILOT_MODE: 'simulation',
        FLIGHTPILOT_BASE_URL: baseURL!,
        FLIGHTPILOT_API_TOKEN: token,
        FLIGHTPILOT_ENCRYPTION_KEY: '0'.repeat(64),
      },
      stderr: 'pipe',
    });
    transport.stderr?.on('data', () => {});
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(9);
      const result = await client.callTool({
        name: 'search_flights',
        arguments: {
          slices: [{ origin: 'Pune', destination: 'Delhi', departureDate: '2030-11-20' }],
          adults: 2,
          childAges: [3],
          checkedBags: 1,
        },
      });
      expect(result.isError).toBe(false);
      const payload = result.structuredContent as {
        ok: boolean;
        data: { offers: { id: string; environment: string; raw?: unknown }[] };
      };
      expect(payload.ok).toBe(true);
      expect(payload.data.offers).toHaveLength(3);
      expect(payload.data.offers[0]).not.toHaveProperty('raw');
      expect(payload.data.offers[0]!.environment).toBe('simulation');
      const prepared = await client.callTool({
        name: 'prepare_checkout',
        arguments: { offerId: payload.data.offers[0]!.id },
      });
      expect(prepared.isError).toBe(false);
      expect(prepared.structuredContent).toMatchObject({
        ok: true,
        data: {
          url: expect.stringContaining('/checkout/'),
          notice: expect.stringContaining('No payment taken'),
        },
      });
    } finally {
      await client.close();
    }
  });
}
test('HTTP boundaries require browser session and same-origin approval', async ({ request, baseURL }) => {
  const headers = { Authorization: `Bearer ${token}` };
  const searched = await request.post('/api/tools/search_flights', {
    headers,
    data: { slices: [{ origin: 'PNQ', destination: 'DEL', departureDate: '2030-11-20' }] },
  });
  expect(searched.ok()).toBe(true);
  const offers = (await searched.json()) as { offers: { id: string }[] };
  const prepared = await request.post('/api/tools/prepare_checkout', {
    headers,
    data: { offerId: offers.offers[0]!.id },
  });
  const { checkoutId } = (await prepared.json()) as { checkoutId: string };
  // A bearer authorized for conversational tools cannot submit checkout approval.
  expect(
    (
      await request.post(`/api/checkout/${checkoutId}/approve`, {
        headers: { ...headers, Origin: baseURL! },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post('/api/login', { headers: { Origin: 'https://evil.invalid' }, data: { token } })
    ).status(),
  ).toBe(403);
  expect((await request.post('/api/login', { headers: { Origin: baseURL! }, data: { token } })).ok()).toBe(
    true,
  );
  expect((await request.get(`/api/checkout/${checkoutId}`)).ok()).toBe(true);
  expect(
    (
      await request.post(`/api/checkout/${checkoutId}/approve`, {
        headers: { Origin: 'https://evil.invalid' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  // An invalid Authorization header must never bypass cookie CSRF checks.
  expect(
    (
      await request.post('/api/tools/resolve_airport', {
        headers: { Authorization: 'Bearer invalid', Origin: 'https://evil.invalid' },
        data: { query: 'PNQ' },
      })
    ).status(),
  ).toBe(401);
});
