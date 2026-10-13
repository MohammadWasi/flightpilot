import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DuffelProvider,
  SimulatorProvider,
  normalizeDuffelBooking,
  normalizeDuffelOffer,
} from '@flightpilot/providers';
import { SearchSchema, type Passenger } from '@flightpilot/shared';

// FABRICATED TEST FIXTURES, shaped from official Duffel v2 documentation. Never recorded/live fares.
function syntheticDuffelOffer() {
  return {
    synthetic_fixture: true,
    id: 'off_synthetic_1',
    live_mode: false,
    total_amount: '5300.10',
    total_currency: 'INR',
    base_amount: '5000.00',
    base_currency: 'INR',
    tax_amount: '300.10',
    tax_currency: 'INR',
    expires_at: '2035-11-01T12:30:00.000Z',
    passenger_identity_documents_required: false,
    passengers: [{ id: 'pas_synthetic_1', type: 'adult' }],
    slices: [
      {
        segments: [
          {
            origin: { iata_code: 'PNQ', time_zone: 'Asia/Kolkata' },
            destination: { iata_code: 'DEL', time_zone: 'Asia/Kolkata' },
            departing_at: '2035-11-20T11:00:00',
            arriving_at: '2035-11-20T13:00:00',
            marketing_carrier: { iata_code: 'ZZ', name: 'Synthetic Airline' },
            operating_carrier: { iata_code: 'ZZ', name: 'Synthetic Airline' },
            marketing_carrier_flight_number: 'TEST1',
            passengers: [
              {
                passenger_id: 'pas_synthetic_1',
                baggages: [
                  { type: 'checked', quantity: 1 },
                  { type: 'carry_on', quantity: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
    conditions: {
      refund_before_departure: { allowed: false },
      change_before_departure: { allowed: true, penalty_amount: '750.00', penalty_currency: 'INR' },
    },
  };
}
const input = () =>
  SearchSchema.parse({ slices: [{ origin: 'PNQ', destination: 'DEL', departureDate: '2035-11-20' }] });
const passenger = (id = 'pas_synthetic_1'): Passenger => ({
  id,
  givenName: 'Synthetic',
  familyName: 'Traveller',
  bornOn: '1990-01-01',
  gender: 'f',
  title: 'ms',
  email: 'test@example.invalid',
  phone: '+919000000000',
});
const order = () => ({
  id: 'ord_synthetic_1',
  live_mode: false,
  total_amount: '5300.10',
  total_currency: 'INR',
  booking_reference: 'TESTPNR',
  payment_status: { awaiting_payment: false },
  passengers: [{ id: 'pas_synthetic_1' }],
  documents: [] as { type: string; unique_identifier: string }[],
});
const response = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('Duffel test adapter and normalization', () => {
  it('rejects live and missing credentials before any network call', () => {
    expect(() => new DuffelProvider({ token: 'duffel_live_forbidden' })).toThrow(/test tokens/);
    expect(() => new DuffelProvider({ token: '' })).toThrow(/test tokens/);
    expect(() => normalizeDuffelOffer({ ...syntheticDuffelOffer(), live_mode: true })).toThrow(/Live-mode/);
  });

  it('normalizes exact totals, carrier names, per-segment baggage, unknown rules and preserves raw data', () => {
    const raw = syntheticDuffelOffer();
    const normalized = normalizeDuffelOffer(raw);
    expect(normalized.total).toEqual({ amount: '5300.10', currency: 'INR' });
    expect(normalized.checkedBagsPerPassenger).toBe(1);
    expect(normalized.slices[0]?.segments[0]?.operatingCarrierName).toBe('Synthetic Airline');
    expect(normalized.slices[0]?.durationMinutes).toBe(120);
    expect(normalized.rules.changePenalty?.amount).toBe('750.00');
    expect(normalized.raw).toEqual(raw);
    expect(normalizeDuffelOffer({ ...raw, conditions: undefined }).rules.refundable).toBeNull();
    raw.slices[0]!.segments[0]!.passengers = [];
    expect(normalizeDuffelOffer(raw).checkedBagsPerPassenger).toBeNull();
  });

  it('computes elapsed time using airport time zones, including DST', () => {
    const raw = syntheticDuffelOffer();
    const leg = raw.slices[0]!.segments[0]!;
    leg.origin = { iata_code: 'LHR', time_zone: 'Europe/London' };
    leg.destination = { iata_code: 'JFK', time_zone: 'America/New_York' };
    leg.departing_at = '2035-07-20T11:00:00';
    leg.arriving_at = '2035-07-20T14:00:00';
    const result = normalizeDuffelOffer(raw);
    expect(result.slices[0]?.durationMinutes).toBe(480);
    expect(result.slices[0]?.segments[0]?.departure).toContain('+01:00');
    expect(result.slices[0]?.segments[0]?.arrival).toContain('-04:00');
  });

  it('sends one-way/return slices, exact child and infant ages, cabin and max connections', async () => {
    const raw = {
      ...syntheticDuffelOffer(),
      passengers: [
        { id: 'pas_1', type: 'adult' },
        { id: 'pas_2', type: 'adult' },
        { id: 'pas_3', type: 'child', age: 3 },
        { id: 'pas_4', type: 'adult', age: 14 },
        { id: 'pas_5', type: 'infant_without_seat', age: 1 },
      ],
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ live_mode: false, offers: [raw] }));
    const provider = new DuffelProvider({ token: 'duffel_test_SYNTHETIC', fetch: fetcher });
    const search = SearchSchema.parse({
      ...input(),
      slices: [...input().slices, { origin: 'DEL', destination: 'PNQ', departureDate: '2035-11-25' }],
      adults: 2,
      childAges: [3, 14],
      infantAges: [1],
      maxStops: 0,
      cabin: 'business',
    });
    await provider.searchFlights(search);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000',
    );
    const body = JSON.parse(String(options?.body));
    expect(body.data.slices).toHaveLength(2);
    expect(body.data.passengers).toEqual([
      { type: 'adult' },
      { type: 'adult' },
      { age: 3 },
      { age: 14 },
      { age: 1 },
    ]);
    expect(body.data.cabin_class).toBe('business');
    expect(body.data.max_connections).toBe(0);
    expect(body.data.currency).toBeUndefined(); // Duffel returns billing currency; it does not accept our requested display currency.
    await expect(provider.searchFlights({ ...search, infantsWithSeat: true })).rejects.toMatchObject({
      code: 'UNSUPPORTED_PASSENGER',
    });
  });

  it('preserves exact minor ages when an airline classifies a teenager as adult and later omits ages', async () => {
    const raw = {
      ...syntheticDuffelOffer(),
      passengers: [
        { id: 'pas_1', type: 'adult' },
        { id: 'pas_2', type: 'adult', age: 14 },
        { id: 'pas_3', type: 'infant_without_seat', age: 1 },
      ],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ live_mode: false, offers: [raw] }))
      .mockResolvedValueOnce(
        response({ ...raw, passengers: raw.passengers.map((p) => ({ id: p.id, type: p.type })) }),
      );
    const provider = new DuffelProvider({ token: 'duffel_test_SYNTHETIC', fetch: fetcher });
    const [offer] = await provider.searchFlights({ ...input(), childAges: [14], infantAges: [1] });
    expect(offer?.passengers[1]).toMatchObject({ type: 'adult', age: 14 });
    const refreshed = await provider.revalidateOffer(raw.id);
    expect(refreshed.offer.passengers.map((p) => p.age)).toEqual([undefined, 14, 1]);
  });

  it('revalidates via GET, reports price change and supports persisted offer restoration', async () => {
    const raw = syntheticDuffelOffer();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...raw, total_amount: '5500.10' }));
    const provider = new DuffelProvider({ token: 'duffel_test_SYNTHETIC', fetch: fetcher });
    provider.restoreOffer(normalizeDuffelOffer(raw));
    const result = await provider.revalidateOffer(raw.id);
    expect(result.changed).toBe(true);
    expect(result.previousTotal.amount).toBe('5300.10');
    expect(result.offer.total.amount).toBe('5500.10');
    expect(String(fetcher.mock.calls[0]![0])).toContain(
      '/air/offers/off_synthetic_1?return_available_services=true',
    );
  });

  it('rejects expired offers and unsupported passport collection', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ ...syntheticDuffelOffer(), expires_at: '2000-01-01T00:00:00Z' }));
    const provider = new DuffelProvider({ token: 'duffel_test_SYNTHETIC', fetch: fetcher });
    await expect(provider.getOffer('off_synthetic_1')).rejects.toMatchObject({ code: 'OFFER_EXPIRED' });
    const offer = normalizeDuffelOffer({
      ...syntheticDuffelOffer(),
      passenger_identity_documents_required: true,
    });
    await expect(
      provider.createBooking({ offer, passengers: [passenger()], idempotencyKey: 'test_attempt' }),
    ).rejects.toMatchObject({ code: 'IDENTITY_DOCUMENTS_UNSUPPORTED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses the provider’s test order endpoint and only treats paid e-ticket documents as ticketed', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(order()));
    const provider = new DuffelProvider({ token: 'duffel_test_SYNTHETIC', fetch: fetcher });
    const booking = await provider.createBooking({
      offer: normalizeDuffelOffer(syntheticDuffelOffer()),
      passengers: [passenger()],
      idempotencyKey: 'saved_attempt_1',
    });
    expect(booking.status).toBe('confirmed');
    expect(booking.ticketNumbers).toEqual([]);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://api.duffel.com/air/orders');
    expect(JSON.parse(String(options?.body)).data.payments).toEqual([
      { type: 'balance', amount: '5300.10', currency: 'INR' },
    ]);
    expect(JSON.parse(String(options?.body)).data.metadata.flightpilot_attempt).toBe('saved_attempt_1');
    expect(normalizeDuffelBooking({ ...order(), payment_status: { awaiting_payment: true } }).status).toBe(
      'reserved',
    );
    expect(
      normalizeDuffelBooking({ ...order(), booking_reference: null, payment_status: undefined }).status,
    ).toBe('pending');
    expect(
      normalizeDuffelBooking({
        ...order(),
        documents: [{ type: 'electronic_ticket', unique_identifier: 'SYNTHETIC-TICKET' }],
      }).status,
    ).toBe('ticketed');
    expect(
      normalizeDuffelBooking({
        ...order(),
        passengers: [{ id: 'pas_1' }, { id: 'pas_2' }],
        documents: [{ type: 'electronic_ticket', unique_identifier: 'SYNTHETIC-TICKET' }],
      }).status,
    ).toBe('confirmed');
    expect(normalizeDuffelBooking({ ...order(), cancelled_at: '2035-11-01T00:00:00Z' }).status).toBe(
      'cancelled',
    );
  });

  it('does not retry an uncertain booking request or expose the upstream response body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('sensitive upstream details', { status: 503 }));
    const provider = new DuffelProvider({ token: 'duffel_test_SYNTHETIC', fetch: fetcher });
    await expect(
      provider.createBooking({
        offer: normalizeDuffelOffer(syntheticDuffelOffer()),
        passengers: [passenger()],
        idempotencyKey: 'saved_attempt_1',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_UNCERTAIN', retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts timed out searches without retrying', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async (_url, options) =>
          new Promise<Response>((_resolve, reject) =>
            options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
    const provider = new DuffelProvider({ token: 'duffel_test_SYNTHETIC', fetch: fetcher, timeoutMs: 5 });
    await expect(provider.searchFlights(input())).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('explicit local simulator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-11-01T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('labels synthetic fares, counts child/infant passengers and supports return journeys', async () => {
    const provider = new SimulatorProvider();
    const offers = await provider.searchFlights({
      ...input(),
      adults: 2,
      childAges: [3],
      infantAges: [1],
      slices: [...input().slices, { origin: 'DEL', destination: 'PNQ', departureDate: '2035-11-25' }],
    });
    expect(offers).toHaveLength(3);
    expect(offers[0]?.passengers.map((p) => p.type)).toEqual([
      'adult',
      'adult',
      'child',
      'infant_without_seat',
    ]);
    expect(offers[0]?.slices).toHaveLength(2);
    for (const offer of offers) {
      expect(offer.environment).toBe('simulation');
      expect(offer.warnings.join(' ')).toContain('fabricated');
    }
    expect(offers[0]?.total.amount).toBe('24510.00');
  });
  it('restores offers, requires renewed price approval and expires stale offers', async () => {
    const provider = new SimulatorProvider();
    const offer = (await provider.searchFlights(input()))[0]!;
    const restarted = new SimulatorProvider({ scenario: 'price_change' });
    restarted.restoreOffer(offer);
    const priced = await restarted.revalidateOffer(offer.id);
    expect(priced.changed).toBe(true);
    await expect(
      restarted.createBooking({
        offer,
        passengers: offer.passengers.map((p) => passenger(p.id)),
        idempotencyKey: 'duplicate',
      }),
    ).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    vi.advanceTimersByTime(16 * 60_000);
    await expect(provider.getOffer(offer.id)).rejects.toMatchObject({ code: 'OFFER_EXPIRED' });
  });
  it('keeps duplicate simulated attempts stable and restores booking status', async () => {
    const provider = new SimulatorProvider();
    const offer = (await provider.searchFlights(input()))[0]!;
    const request = {
      offer,
      passengers: offer.passengers.map((p) => passenger(p.id)),
      idempotencyKey: 'stable_attempt',
    };
    const [first, again] = await Promise.all([
      provider.createBooking(request),
      provider.createBooking(request),
    ]);
    expect(again.id).toBe(first.id);
    expect(first.reference).toMatch(/^SIM-/);
    expect(first.ticketNumbers[0]).toContain('NOT-A-TICKET');
    const restarted = new SimulatorProvider();
    restarted.restoreBooking(first);
    expect(await restarted.getBooking(first.id)).toEqual(first);
  });
  it('supports pending and decline recovery without pretending a real payment occurred', async () => {
    const provider = new SimulatorProvider({ scenario: 'pending' });
    const offer = (await provider.searchFlights({ ...input(), adults: 2, childAges: [3] }))[0]!;
    const request = {
      offer,
      passengers: offer.passengers.map((p) => passenger(p.id)),
      idempotencyKey: 'pending_attempt',
    };
    const pending = await provider.createBooking(request);
    expect(pending.status).toBe('pending');
    expect(pending.ticketNumbers).toEqual([]);
    const restarted = new SimulatorProvider();
    restarted.restoreBooking(pending);
    const issued = await restarted.verifyTicketing(pending.id);
    expect(issued.status).toBe('ticketed');
    expect(issued.ticketNumbers).toHaveLength(3);
    provider.setScenario('payment_declined');
    await expect(
      provider.createBooking({ ...request, idempotencyKey: 'declined_attempt' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
  });
});
