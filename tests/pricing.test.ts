import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addMoney,
  compareMoney,
  compareOffers,
  equalMoney,
  journeyMetrics,
  money,
  multiplyMoney,
} from '@flightpilot/pricing-engine';
import { SearchSchema, type FlightOffer } from '@flightpilot/shared';

// Explicit synthetic data: these figures do not describe real flight offers or airline prices.
const input = () =>
  SearchSchema.parse({
    slices: [{ origin: 'PNQ', destination: 'DEL', departureDate: '2035-11-20' }],
    checkedBags: 1,
  });
function fixture(id: string, amount = '100.00', minutes = 120): FlightOffer {
  const start = new Date('2035-11-20T05:30:00Z'),
    end = new Date(start.getTime() + minutes * 60_000);
  return {
    id,
    provider: 'synthetic-fixture',
    environment: 'simulation',
    total: money(amount, 'INR'),
    base: null,
    tax: null,
    expiresAt: '2035-11-01T13:00:00.000Z',
    slices: [
      {
        segments: [
          {
            origin: 'PNQ',
            destination: 'DEL',
            departure: start.toISOString(),
            arrival: end.toISOString(),
            originTimezone: 'Asia/Kolkata',
            destinationTimezone: 'Asia/Kolkata',
            marketingCarrier: 'ZZ',
            operatingCarrier: 'ZZ',
            flightNumber: 'TEST',
            durationMinutes: minutes,
          },
        ],
        durationMinutes: minutes,
      },
    ],
    passengers: [{ id: 'synthetic-adult', type: 'adult' }],
    checkedBagsPerPassenger: 1,
    cabinBagsPerPassenger: 1,
    baggageExtra: null,
    rules: {
      refundable: true,
      changeable: true,
      cancellationPenalty: null,
      changePenalty: null,
      description: 'Synthetic test rules.',
    },
    selfTransfer: false,
    airportChange: false,
    warnings: ['Synthetic test fare'],
    raw: { synthetic: true },
  };
}

describe('exact money arithmetic', () => {
  it('adds decimal amounts without floating-point drift and respects currency minor units', () => {
    expect(addMoney(money('0.10', 'INR'), money('0.20', 'INR')).amount).toBe('0.30');
    expect(multiplyMoney(money('1234.56', 'INR'), 3).amount).toBe('3703.68');
    expect(money('1.001', 'KWD').amount).toBe('1.001');
    expect(money('100', 'JPY').amount).toBe('100');
    expect(() => money('1.01', 'JPY')).toThrow();
    expect(() => money('1.001', 'INR')).toThrow();
    expect(() => money('-1', 'INR')).toThrow();
    expect(equalMoney(money('1', 'INR'), money('1.00', 'INR'))).toBe(true);
  });
  it('refuses to compare or sum different currencies without FX', () => {
    expect(() => addMoney(money('1', 'INR'), money('1', 'USD'))).toThrow(/FX/);
    expect(() => compareMoney(money('1', 'INR'), money('1', 'USD'))).toThrow(/FX/);
    expect(equalMoney(money('1', 'INR'), money('1', 'USD'))).toBe(false);
  });
});

describe('transparent recommendations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-11-01T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('distinguishes cheapest, best value and fastest while preserving source offers', () => {
    const cheap = fixture('cheap', '100.00', 360),
      balanced = fixture('balanced', '110.00', 125),
      fast = fixture('fast', '200.00', 100);
    const original = structuredClone([cheap, balanced, fast]);
    const result = compareOffers([cheap, balanced, fast], input());
    expect(result.recommendations.map((r) => [r.category, r.offerId])).toEqual([
      ['cheapest', 'cheap'],
      ['best_value', 'balanced'],
      ['fastest', 'fast'],
    ]);
    expect([cheap, balanced, fast]).toEqual(original);
    expect(result.recommendations[1]?.reasons.join(' ')).toContain('weighted penalty');
    expect(result.warnings.join(' ')).toContain('not real');
  });
  it('excludes missing baggage and unquoted baggage, includes confirmed aggregate charges', () => {
    const unknown = fixture('unknown', '1.00');
    unknown.checkedBagsPerPassenger = null;
    const absent = fixture('absent', '2.00');
    absent.checkedBagsPerPassenger = 0;
    const extra = fixture('extra', '90.00');
    extra.checkedBagsPerPassenger = 0;
    extra.baggageExtra = money('30', 'INR');
    const included = fixture('included', '110.00');
    const result = compareOffers([unknown, absent, extra, included], input());
    expect(result.excluded.map((e) => e.offerId)).toEqual(['unknown', 'absent']);
    expect(result.recommendations[0]?.offerId).toBe('included');
    expect(compareOffers([extra], input()).recommendations[0]?.comparableTotal.amount).toBe('120.00');
  });
  it('does not mix currencies, environments or expired fares', () => {
    const usd = fixture('usd');
    usd.total = money('1', 'USD');
    const expired = fixture('expired');
    expired.expiresAt = '2035-11-01T11:59:00.000Z';
    expect(compareOffers([usd, expired], input()).recommendations).toEqual([]);
    const test = fixture('test');
    test.environment = 'test';
    expect(compareOffers([test, fixture('sim')], input()).recommendations).toEqual([]);
  });
  it('enforces total budget and avoided carriers; preference weights remain configurable', () => {
    const avoided = fixture('avoided', '1');
    avoided.slices[0]!.segments[0]!.operatingCarrier = 'XY';
    const costly = fixture('costly', '200');
    const regular = fixture('regular', '100');
    const result = compareOffers([avoided, costly, regular], {
      ...input(),
      avoidedAirlines: ['XY'],
      budget: money('120', 'INR'),
    });
    expect(result.excluded.map((e) => e.offerId)).toEqual(['avoided', 'costly']);
    const preferred = fixture('preferred', '105');
    preferred.slices[0]!.segments[0]!.operatingCarrier = 'AA';
    preferred.slices[0]!.segments[0]!.marketingCarrier = 'AA';
    expect(
      compareOffers([regular, preferred], { ...input(), preferredAirlines: ['AA'] }, { nonPreferred: 20 })
        .recommendations[1]?.offerId,
    ).toBe('preferred');
  });
  it('uses elapsed UTC time and local connection dates to exclude overnight and long layovers', () => {
    const offer = fixture('connection');
    const first = offer.slices[0]!.segments[0]!;
    first.destination = 'DXB';
    first.departure = '2035-11-20T19:00:00+05:30';
    first.arrival = '2035-11-20T22:00:00+04:00';
    first.destinationTimezone = 'Asia/Dubai';
    const second = {
      ...first,
      origin: 'DXB',
      destination: 'DEL',
      originTimezone: 'Asia/Dubai',
      destinationTimezone: 'Asia/Kolkata',
      departure: '2035-11-21T02:00:00+04:00',
      arrival: '2035-11-21T07:30:00+05:30',
    };
    offer.slices[0]!.segments.push(second);
    expect(journeyMetrics(offer)).toMatchObject({
      duration: 750,
      connections: 1,
      longestLayover: 240,
      overnight: 1,
    });
    expect(compareOffers([offer], input()).excluded[0]?.reasons.join(' ')).toContain('overnight');
    expect(
      compareOffers([offer], {
        ...input(),
        avoidOvernight: false,
        maxLayoverMinutes: 180,
      }).excluded[0]?.reasons.join(' '),
    ).toContain('layover');
    expect(
      compareOffers([offer], { ...input(), avoidOvernight: false, maxLayoverMinutes: 240 }).recommendations,
    ).toHaveLength(3);
    expect(
      compareOffers([offer], { ...input(), avoidOvernight: false, maxStops: 0 }).excluded[0]?.reasons.join(
        ' ',
      ),
    ).toContain('stops');
  });
  it('penalizes self-transfer and unknown rules, rejects reversed connections', () => {
    const safe = fixture('safe', '110'),
      risky = fixture('risky', '100');
    risky.selfTransfer = true;
    risky.airportChange = true;
    risky.rules.refundable = null;
    expect(compareOffers([safe, risky], input()).recommendations[1]?.offerId).toBe('safe');
    const broken = fixture('broken');
    broken.slices[0]!.segments[0]!.arrival = '2035-11-19T12:00:00Z';
    expect(compareOffers([broken], input()).recommendations).toEqual([]);
  });
});
