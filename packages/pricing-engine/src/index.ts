import Decimal from 'decimal.js';
import { DateTime } from 'luxon';
import {
  FlightPilotError,
  MoneySchema,
  type Comparison,
  type FlightOffer,
  type FlightSearchInput,
  type Money,
} from '@flightpilot/shared';

export const currencyDigits: Record<Money['currency'], number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KWD: 3,
};
export function money(amount: Decimal.Value, currency: Money['currency']): Money {
  const value = new Decimal(amount);
  if (!value.isFinite() || value.isNegative() || value.decimalPlaces() > currencyDigits[currency]) {
    throw new FlightPilotError('INVALID_MONEY', `Amount must use valid ${currency} minor units.`);
  }
  return MoneySchema.parse({ amount: value.toFixed(currencyDigits[currency]), currency });
}
function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency)
    throw new FlightPilotError('CURRENCY_MISMATCH', 'No verified FX conversion is available.');
}
export function addMoney(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(new Decimal(a.amount).add(b.amount), a.currency);
}
export function compareMoney(a: Money, b: Money): number {
  sameCurrency(a, b);
  return new Decimal(a.amount).comparedTo(b.amount);
}
export function equalMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && new Decimal(a.amount).equals(b.amount);
}
export function multiplyMoney(value: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0)
    throw new FlightPilotError('INVALID_QUANTITY', 'Quantity must be a non-negative integer.');
  return money(new Decimal(value.amount).mul(quantity), value.currency);
}

/** Scores are dimensionless preferences, never estimated fees or price adjustments. */
export type RankingWeights = {
  price: number;
  duration: number;
  connection: number;
  overnight: number;
  selfTransfer: number;
  airportChange: number;
  nonRefundable: number;
  unknownRules: number;
  inconvenient: number;
  nonPreferred: number;
};
export const defaultRankingWeights: Readonly<RankingWeights> = Object.freeze({
  price: 55,
  duration: 20,
  connection: 8,
  overnight: 12,
  selfTransfer: 25,
  airportChange: 20,
  nonRefundable: 3,
  unknownRules: 4,
  inconvenient: 3,
  nonPreferred: 6,
});
export function localTime(value: string, zone: string): DateTime {
  const parsed = DateTime.fromISO(value, { zone, setZone: true }).setZone(zone);
  if (!parsed.isValid)
    throw new FlightPilotError(
      'INVALID_ITINERARY',
      'The provider returned an invalid flight time or time zone.',
    );
  return parsed;
}
export function journeyMetrics(offer: FlightOffer) {
  let duration = 0,
    connections = 0,
    longestLayover = 0,
    overnight = 0,
    inconvenient = 0;
  for (const slice of offer.slices) {
    const first = slice.segments[0]!;
    const last = slice.segments.at(-1)!;
    const start = localTime(first.departure, first.originTimezone);
    const end = localTime(last.arrival, last.destinationTimezone);
    const elapsed = end.diff(start, 'minutes').minutes;
    if (elapsed <= 0)
      throw new FlightPilotError('INVALID_ITINERARY', 'Flight arrival must follow departure.');
    duration += elapsed;
    connections += slice.segments.length - 1;
    inconvenient += Number(start.hour < 6 || start.hour >= 23) + Number(end.hour < 6 || end.hour >= 23);
    slice.segments.forEach((segment, index) => {
      const departure = localTime(segment.departure, segment.originTimezone);
      const arrival = localTime(segment.arrival, segment.destinationTimezone);
      if (arrival <= departure)
        throw new FlightPilotError('INVALID_ITINERARY', 'A segment has invalid timing.');
      const next = slice.segments[index + 1];
      if (!next) return;
      const nextDeparture = localTime(next.departure, next.originTimezone);
      const layover = nextDeparture.diff(arrival, 'minutes').minutes;
      if (layover < 0) throw new FlightPilotError('INVALID_ITINERARY', 'Connection leaves before arrival.');
      longestLayover = Math.max(longestLayover, layover);
      const departureAtConnection = nextDeparture.setZone(segment.destinationTimezone);
      // Crossing midnight or spending time in the midnight–06:00 window is an overnight connection.
      if (arrival.toISODate() !== departureAtConnection.toISODate() || arrival.hour < 6) overnight++;
    });
  }
  return { duration, connections, longestLayover, overnight, inconvenient };
}

/** baggageExtra, when provided, must be a confirmed aggregate quote for the entire selected baggage shortfall. */
export function comparableTotal(offer: FlightOffer, input: FlightSearchInput): Money {
  money(offer.total.amount, offer.total.currency);
  if (
    input.checkedBags > 0 &&
    (offer.checkedBagsPerPassenger === null || offer.checkedBagsPerPassenger < input.checkedBags)
  ) {
    if (offer.checkedBagsPerPassenger === null)
      throw new FlightPilotError('BAGGAGE_UNKNOWN', 'Required checked baggage allowance is unknown.');
    if (!offer.baggageExtra)
      throw new FlightPilotError(
        'BAGGAGE_UNKNOWN',
        'Required checked baggage is missing and its extra cost is unknown.',
      );
    return addMoney(offer.total, offer.baggageExtra);
  }
  return offer.total;
}

export function compareOffers(
  offers: FlightOffer[],
  input: FlightSearchInput,
  overrides: Partial<RankingWeights> = {},
): Comparison {
  const weights = { ...defaultRankingWeights, ...overrides };
  if (Object.values(weights).some((value) => !Number.isFinite(value) || value < 0))
    throw new FlightPilotError('INVALID_WEIGHTS', 'Ranking weights must be finite non-negative numbers.');
  const excluded: Comparison['excluded'] = [];
  const candidates: {
    offer: FlightOffer;
    total: Money;
    metrics: ReturnType<typeof journeyMetrics>;
    preferred: boolean;
    score: Decimal;
  }[] = [];
  const warnings = new Set<string>([
    'Ranks only the supplied provider offers; no claim about the cheapest fare on the entire internet.',
    'No FX conversion or unknown payment fees are included.',
  ]);
  if (offers.some((offer) => offer.environment !== 'live'))
    warnings.add('Simulation and provider test fares are not real purchasable flight prices.');
  if (new Set(offers.map((offer) => offer.environment)).size > 1) {
    return {
      recommendations: [],
      excluded: offers.map((offer) => ({
        offerId: offer.id,
        reasons: ['Different environments cannot be ranked together.'],
      })),
      warnings: [...warnings],
    };
  }
  for (const offer of offers) {
    const reasons: string[] = [];
    let total: Money = offer.total;
    let metrics: ReturnType<typeof journeyMetrics> | undefined;
    if (offer.total.currency !== input.currency)
      reasons.push(
        `Quoted in ${offer.total.currency}; requested ${input.currency}. No verified FX conversion.`,
      );
    if (!Number.isFinite(Date.parse(offer.expiresAt)) || Date.parse(offer.expiresAt) <= Date.now())
      reasons.push('Offer has expired. Search again.');
    if (offer.passengers.length !== input.adults + input.childAges.length + input.infantAges.length)
      reasons.push('Traveller count does not match the search.');
    if (offer.slices.some((slice) => slice.segments.length - 1 > input.maxStops))
      reasons.push('Exceeds maximum stops.');
    const carriers = offer.slices.flatMap((slice) =>
      slice.segments.flatMap((segment) => [segment.marketingCarrier, segment.operatingCarrier]),
    );
    if (carriers.some((carrier) => input.avoidedAirlines.includes(carrier)))
      reasons.push('Includes an avoided airline.');
    const preferred =
      input.preferredAirlines.length === 0 ||
      carriers.every((carrier) => input.preferredAirlines.includes(carrier));
    try {
      total = comparableTotal(offer, input);
      metrics = journeyMetrics(offer);
      if (metrics.longestLayover > input.maxLayoverMinutes) reasons.push('Exceeds maximum layover duration.');
      if (metrics.overnight && input.avoidOvernight) reasons.push('Includes an overnight connection.');
      if (input.budget && total.currency === input.budget.currency && compareMoney(total, input.budget) > 0)
        reasons.push('Exceeds total budget including known required baggage.');
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : 'Invalid provider data.');
    }
    if (reasons.length || !metrics) {
      excluded.push({ offerId: offer.id, reasons });
      continue;
    }
    candidates.push({ offer, total, metrics, preferred, score: new Decimal(0) });
  }
  if (!candidates.length) return { recommendations: [], excluded, warnings: [...warnings] };
  const minimumPrice = Decimal.min(...candidates.map((candidate) => new Decimal(candidate.total.amount)));
  const minimumDuration = Math.min(...candidates.map((candidate) => candidate.metrics.duration));
  for (const c of candidates) {
    const priceRatio = minimumPrice.isZero()
      ? new Decimal(c.total.amount).isZero()
        ? new Decimal(0)
        : new Decimal(1)
      : new Decimal(c.total.amount).div(minimumPrice).minus(1);
    c.score = priceRatio
      .mul(weights.price)
      .add(new Decimal(c.metrics.duration).div(minimumDuration).minus(1).mul(weights.duration))
      .add(c.metrics.connections * weights.connection)
      .add(c.metrics.overnight * weights.overnight)
      .add(Number(c.offer.selfTransfer) * weights.selfTransfer)
      .add(Number(c.offer.airportChange) * weights.airportChange)
      .add(
        Number(c.offer.rules.refundable === false || c.offer.rules.changeable === false) *
          weights.nonRefundable,
      )
      .add(
        Number(c.offer.rules.refundable === null || c.offer.rules.changeable === null) * weights.unknownRules,
      )
      .add(c.metrics.inconvenient * weights.inconvenient)
      .add(Number(!c.preferred) * weights.nonPreferred);
  }
  const tie = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    compareMoney(a.total, b.total) ||
    a.metrics.duration - b.metrics.duration ||
    a.offer.id.localeCompare(b.offer.id);
  const cheapest = [...candidates].sort(tie)[0]!;
  const best = [...candidates].sort((a, b) => a.score.comparedTo(b.score) || tie(a, b))[0]!;
  const fastest = [...candidates].sort((a, b) => a.metrics.duration - b.metrics.duration || tie(a, b))[0]!;
  const recommendations = (
    [
      ['cheapest', cheapest],
      ['best_value', best],
      ['fastest', fastest],
    ] as const
  ).map(([category, c]) => ({
    offerId: c.offer.id,
    category,
    comparableTotal: c.total,
    score: c.score.toFixed(4),
    reasons: [
      category === 'cheapest'
        ? 'Lowest known total among suitable offers.'
        : category === 'fastest'
          ? 'Shortest total journey time among suitable offers.'
          : 'Lowest weighted penalty for price, journey time, connections, timing, fare rules and transfer risks.',
      `${c.total.amount} ${c.total.currency} for all ${c.offer.passengers.length} travellers; ${Math.round(c.metrics.duration)} minutes across all journeys; ${c.metrics.connections} connection(s).`,
      c.offer.checkedBagsPerPassenger === null
        ? 'Checked baggage allowance is unknown.'
        : `${c.offer.checkedBagsPerPassenger} checked bag(s) included per passenger on every segment.`,
      ...(c.total !== c.offer.total
        ? ['Includes the supplied aggregate extra baggage quote; booking must include those services.']
        : []),
      c.offer.rules.description,
      ...(c.offer.selfTransfer ? ['Self-transfer: missed connections may not be protected.'] : []),
      ...(c.offer.airportChange ? ['A connection requires changing airports.'] : []),
      ...(!c.preferred ? ['Includes a carrier outside your preferred airlines.'] : []),
      ...(c.offer.environment !== 'live'
        ? [`${c.offer.environment.toUpperCase()} data only; no real ticket or fare.`]
        : []),
    ],
  }));
  return { recommendations, excluded, warnings: [...warnings] };
}
