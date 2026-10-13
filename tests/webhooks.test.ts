import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Store, FlightService, verifyWebhook, handleWebhook, type Config } from '@flightpilot/core';
import { SimulatorProvider } from '@flightpilot/providers';
import type { BookingStatus } from '@flightpilot/shared';
const config: Config = {
  mode: 'duffel_test',
  baseUrl: 'http://127.0.0.1:3000',
  apiToken: 'test-token-'.repeat(4),
  encryptionKey: 'b'.repeat(64),
  dataDir: 'memory://',
  databaseUrl: undefined,
  duffelToken: undefined,
  webhookSecret: 'test-signing-secret',
};
const signed = (body: string, time = Math.floor(Date.now() / 1000)) =>
  `t=${time},v1=${createHmac('sha256', config.webhookSecret!).update(`${time}.${body}`).digest('hex')}`;
const current: BookingStatus = {
  id: 'ord_test',
  provider: 'duffel',
  environment: 'test',
  status: 'ticketed',
  reference: 'TESTPNR',
  ticketNumbers: ['TEST-NOT-FOR-TRAVEL'],
  total: { currency: 'INR', amount: '100.00' },
  updatedAt: '2030-01-02T00:00:00Z',
  recovery: null,
};
let store: Store, service: FlightService, provider: SimulatorProvider;
beforeAll(async () => {
  store = await Store.open(config);
  provider = new SimulatorProvider();
  service = new FlightService(store, provider, config);
});
afterAll(async () => {
  await store.close();
});
describe('signed webhook and reconciliation', () => {
  it('validates raw body and enforces timestamp tolerance', () => {
    const body = '{"id":"event"}';
    expect(() => verifyWebhook(body, signed(body), config.webhookSecret!)).not.toThrow();
    expect(() => verifyWebhook(body + ' ', signed(body), config.webhookSecret!)).toThrow();
    expect(() => verifyWebhook(body, signed(body, 1), config.webhookSecret!)).toThrow();
    expect(() => verifyWebhook(body, 't=NaN,v1=bad', config.webhookSecret!)).toThrow();
  });
  it('rejects live events and unsigned callbacks', async () => {
    const body = JSON.stringify({ id: 'evt_live', type: 'order.created', live_mode: true });
    await expect(handleWebhook(service, body, signed(body))).rejects.toThrow();
    await expect(handleWebhook(service, body, '')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('deduplicates notifications, ignores payload status, and fetches authoritative current state', async () => {
    // Test double for supplier HTTP; event itself cannot write a claimed status or passenger details.
    vi.spyOn(provider, 'restoreBooking').mockImplementation(() => {});
    const get = vi.spyOn(provider, 'getBooking').mockResolvedValue(current);
    await store.put('bookings', current.id, 'local-user', {
      ...current,
      status: 'pending',
      ticketNumbers: [],
      updatedAt: '2030-01-01T00:00:00Z',
    });
    const body = JSON.stringify({
      id: 'evt1',
      type: 'order.updated',
      live_mode: false,
      idempotency_key: 'notif1',
      data: { object: { id: current.id, status: 'failed', passenger: 'PII-NEVER-STORED' } },
    });
    expect((await handleWebhook(service, body, signed(body))).duplicate).toBe(false);
    expect((await handleWebhook(service, body, signed(body))).duplicate).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    expect((await store.get<BookingStatus>('bookings', current.id, 'local-user'))?.status).toBe('ticketed');
    expect(JSON.stringify(await store.list('webhooks', 'local-user'))).not.toContain('PII-NEVER-STORED');
    const oldEvent = JSON.stringify({
      id: 'evt2',
      type: 'order.updated',
      live_mode: false,
      data: { object: { id: current.id, status: 'pending' } },
    });
    await handleWebhook(service, oldEvent, signed(oldEvent));
    expect((await store.get<BookingStatus>('bookings', current.id, 'local-user'))?.status).toBe('ticketed');
  });
  it('coalesces concurrent polling and refuses older provider state', async () => {
    const get = vi.mocked(provider.getBooking);
    get.mockClear();
    get.mockResolvedValue({
      ...current,
      status: 'pending',
      ticketNumbers: [],
      updatedAt: '2030-01-01T00:00:00Z',
    });
    const [a, b] = await Promise.all([
      service.booking('local-user', current.id),
      service.booking('local-user', current.id),
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(a.status).toBe('ticketed');
    expect(b.status).toBe('ticketed');
  });
});
