import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  FlightService,
  Store,
  resolveAirport,
  airportCode,
  authenticateSession,
  sessionCookie,
  encrypt,
  decrypt,
  type Config,
} from '@flightpilot/core';
import { SearchSchema, type FlightOffer, type Passenger } from '@flightpilot/shared';
import { SimulatorProvider } from '@flightpilot/providers';
const config: Config = {
  mode: 'simulation',
  baseUrl: 'http://127.0.0.1:3000',
  apiToken: 'test-token-'.repeat(4),
  encryptionKey: 'a'.repeat(64),
  dataDir: 'memory://',
  databaseUrl: undefined,
  duffelToken: undefined,
  webhookSecret: undefined,
};
const input = {
  slices: [{ origin: 'Pune', destination: 'Delhi', departureDate: '2030-11-20' }],
  adults: 2,
  childAges: [3],
  checkedBags: 1,
};
let store: Store;
beforeAll(async () => {
  store = await Store.open(config);
});
afterAll(async () => {
  await store.close();
});
async function setup() {
  const user = randomUUID();
  const provider = new SimulatorProvider();
  const service = new FlightService(store, provider, config);
  const result = (await service.tool(user, 'search_flights', input)) as { offers: FlightOffer[] };
  const selected = result.offers[1]!;
  const link = await service.prepare(user, selected.id);
  const checkout = await service.checkout(user, link.checkoutId);
  const passengers: Passenger[] = checkout.offer.passengers.map((p, i) => ({
    id: p.id,
    givenName: 'Fictional',
    familyName: `Person${i}`,
    bornOn: p.age === 3 ? '2027-01-01' : '1990-01-01',
    gender: 'm',
    title: 'mr',
    email: 'fictional@example.invalid',
    phone: '+12025550101',
  }));
  const approve = { version: checkout.version, approvedTotal: checkout.total, passengers, consent: true };
  return { user, provider, service, checkout, approve };
}
describe('input and family safeguards', () => {
  it('resolves exact airports, flags ambiguous cities, rejects unverified names', () => {
    expect(airportCode('Pune')).toBe('PNQ');
    expect(resolveAirport('Goa').requiresSelection).toBe(true);
    expect(() => airportCode('Goa')).toThrow('Choose an airport');
    expect(() => airportCode('Unknownsville')).toThrow('outside');
  });
  it('validates true dates, roundtrips, ages and matching budget currency', () => {
    expect(
      SearchSchema.parse({
        ...input,
        slices: [...input.slices, { origin: 'DEL', destination: 'PNQ', departureDate: '2030-11-25' }],
      }).slices,
    ).toHaveLength(2);
    expect(() =>
      SearchSchema.parse({ ...input, slices: [{ ...input.slices[0], departureDate: '2030-02-30' }] }),
    ).toThrow();
    expect(() => SearchSchema.parse({ ...input, infantAges: [2] })).toThrow();
    expect(() => SearchSchema.parse({ ...input, budget: { currency: 'USD', amount: '1' } })).toThrow();
  });
  it('rejects wrong birthdays and identity passed through conversational schemas', async () => {
    const s = await setup();
    await expect(
      s.service.approve(s.user, s.checkout.id, {
        ...s.approve,
        passengers: s.approve.passengers.map((p) => ({ ...p, bornOn: '1990-01-01' })),
      }),
    ).rejects.toMatchObject({ code: 'AGE_MISMATCH' });
    expect(() => SearchSchema.parse({ ...input, passport: 'private' })).toThrow();
  });
});
describe('checkout and transaction boundaries', () => {
  it('does not book when preparing; excludes raw provider data and requires owner', async () => {
    const s = await setup();
    expect(await store.list('bookings', s.user)).toEqual([]);
    await expect(s.service.checkout('another-user', s.checkout.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(s.checkout.offer.raw).toBeNull();
    const saved = await store.get<{ rawEncrypted: string }>('offers', s.checkout.offerId, s.user);
    expect(saved?.rawEncrypted).not.toContain('Synthetic');
  });
  it('persists a simulated booking, independently reads status and prevents duplicate concurrent attempts', async () => {
    const s = await setup();
    const create = vi.spyOn(s.provider, 'createBooking');
    const get = vi.spyOn(s.provider, 'getBooking');
    await Promise.all([
      s.service.approve(s.user, s.checkout.id, s.approve),
      s.service.approve(s.user, s.checkout.id, s.approve),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalled();
    const completed = await s.service.checkout(s.user, s.checkout.id);
    expect(completed.state).toBe('ticketed');
    await s.service.approve(s.user, s.checkout.id, s.approve);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await store.list('bookings', s.user)).toHaveLength(1);
    expect((await s.service.prepare(s.user, s.checkout.offerId)).checkoutId).toBe(s.checkout.id);
  });
  it('requires new explicit approval when price changes and survives JSONB object-key normalization', async () => {
    const s = await setup();
    s.provider.setScenario('price_change');
    const create = vi.spyOn(s.provider, 'createBooking');
    await expect(s.service.approve(s.user, s.checkout.id, s.approve)).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
    });
    expect(create).not.toHaveBeenCalled();
    const refreshed = await s.service.checkout(s.user, s.checkout.id);
    expect(refreshed.version).toBe(2);
    await expect(s.service.approve(s.user, s.checkout.id, s.approve)).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
    });
    const result = await s.service.approve(s.user, s.checkout.id, {
      ...s.approve,
      version: 2,
      approvedTotal: refreshed.total,
    });
    expect(result.checkout.state).toBe('ticketed');
  });
  it('requires consent and rejects altered approved amount before making a purchase', async () => {
    const s = await setup();
    await expect(
      s.service.approve(s.user, s.checkout.id, { ...s.approve, consent: false }),
    ).rejects.toThrow();
    await expect(
      s.service.approve(s.user, s.checkout.id, {
        ...s.approve,
        approvedTotal: { currency: 'INR', amount: '1' },
      }),
    ).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    expect(await store.list('bookings', s.user)).toHaveLength(0);
  });
  it('rejects expired checkout and fare', async () => {
    const s = await setup();
    await store.put('checkouts', s.checkout.id, s.user, { ...s.checkout, expiresAt: '2020-01-01T00:00:00Z' });
    await expect(s.service.approve(s.user, s.checkout.id, s.approve)).rejects.toMatchObject({
      code: 'CHECKOUT_EXPIRED',
    });
    const saved = await store.get<{ offer: FlightOffer }>('offers', s.checkout.offerId, s.user);
    await store.put('offers', s.checkout.offerId, s.user, {
      ...saved,
      offer: { ...saved!.offer, expiresAt: '2020-01-01T00:00:00Z' },
    });
    await expect(
      s.service.tool(s.user, 'revalidate_offer', { offerId: s.checkout.offerId }),
    ).rejects.toMatchObject({ code: 'OFFER_EXPIRED' });
  });
  it.each(['decline', 'timeout'] as const)('locks %s against blind purchase retry', async (scenario) => {
    const s = await setup();
    const create = vi.spyOn(s.provider, 'createBooking');
    await expect(
      s.service.approve(s.user, s.checkout.id, { ...s.approve, simulationOutcome: scenario }),
    ).rejects.toMatchObject({ code: scenario === 'decline' ? 'PAYMENT_DECLINED' : 'BOOKING_UNCERTAIN' });
    const result = await s.service.approve(s.user, s.checkout.id, s.approve);
    expect(result.checkout.state).toBe(scenario === 'decline' ? 'failed' : 'uncertain');
    expect(create).not.toHaveBeenCalled();
  });
  it('distinguishes pending, ticketed and cancelled status', async () => {
    const s = await setup();
    const result = await s.service.approve(s.user, s.checkout.id, {
      ...s.approve,
      simulationOutcome: 'pending',
    });
    expect(result.booking?.status).toBe('pending');
    expect(result.booking?.ticketNumbers).toEqual([]);
    const next = await s.service.booking(s.user, result.booking!.id);
    expect(next.status).toBe('ticketed');
    vi.spyOn(s.provider, 'getBooking').mockResolvedValue({ ...next, status: 'cancelled', ticketNumbers: [] });
    await s.service.booking(s.user, next.id);
    expect((await s.service.checkout(s.user, s.checkout.id)).state).toBe('cancelled');
  });
  it('restores persisted offers and booking history after provider restart', async () => {
    const s = await setup();
    const restarted = new FlightService(store, new SimulatorProvider(), config);
    expect((await restarted.approve(s.user, s.checkout.id, s.approve)).checkout.state).toBe('ticketed');
    const c = await restarted.checkout(s.user, s.checkout.id);
    const again = new FlightService(store, new SimulatorProvider(), config);
    expect((await again.booking(s.user, c.bookingId!)).environment).toBe('simulation');
  });
});
describe('secrets and session integrity', () => {
  it('authenticates signed sessions and rejects tampering', () => {
    const cookie = sessionCookie(config.apiToken);
    expect(authenticateSession(cookie, config.apiToken)).toBe('local-user');
    expect(() => authenticateSession(cookie + 'x', config.apiToken)).toThrow();
  });
  it('encrypts provider raw records and detects ciphertext modification', () => {
    const secret = { sensitive: 'not plain text' };
    const value = encrypt(secret, config.encryptionKey);
    expect(value).not.toContain('sensitive');
    expect(decrypt(value, config.encryptionKey)).toEqual(secret);
    expect(() => decrypt(value.slice(0, -2) + 'ff', config.encryptionKey)).toThrow();
  });
});
describe('bounded nearby-date search', () => {
  it('searches each permitted date instead of inventing interpolated prices', async () => {
    const provider = new SimulatorProvider();
    const search = vi.spyOn(provider, 'searchFlights');
    const service = new FlightService(store, provider, config);
    const result = (await service.tool(randomUUID(), 'search_flights', { ...input, flexibleDays: 1 })) as {
      offers: FlightOffer[];
    };
    expect(search).toHaveBeenCalledTimes(3);
    expect(result.offers).toHaveLength(9);
    expect(new Set(result.offers.map((o) => o.slices[0]!.segments[0]!.departure.slice(0, 10))).size).toBe(3);
  });
});

it('keeps a known provider ID but withholds completion when independent verification fails', async () => {
  const s = await setup();
  const create = vi.spyOn(s.provider, 'createBooking');
  const verify = vi.spyOn(s.provider, 'getBooking').mockRejectedValueOnce(new Error('test network timeout'));
  await expect(s.service.approve(s.user, s.checkout.id, s.approve)).rejects.toMatchObject({
    code: 'BOOKING_UNCERTAIN',
  });
  const uncertain = await s.service.checkout(s.user, s.checkout.id);
  expect(uncertain.state).toBe('uncertain');
  expect(uncertain.bookingId).toBeTruthy();
  expect(await store.get('bookings', uncertain.bookingId!, s.user)).toMatchObject({
    status: 'pending',
    ticketNumbers: [],
  });
  verify.mockRestore();
  expect((await s.service.booking(s.user, uncertain.bookingId!)).status).toBe('ticketed');
  expect(create).toHaveBeenCalledTimes(1);
});
