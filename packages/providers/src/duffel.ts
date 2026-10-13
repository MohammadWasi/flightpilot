import { z } from 'zod';
import {
  CurrencySchema,
  FlightPilotError,
  OfferSchema,
  PassengerSchema,
  type BookingProvider,
  type BookingStatus,
  type FareRules,
  type FlightOffer,
  type FlightSearchInput,
  type Money,
  type Passenger,
  type ProviderCapabilities,
  type TicketingProvider,
} from '@flightpilot/shared';
import { equalMoney, localTime, money } from '@flightpilot/pricing-engine';

const airport = z.object({ iata_code: z.string().min(3), time_zone: z.string().min(1) }).passthrough();
const airline = z.object({ iata_code: z.string().nullable(), name: z.string() }).passthrough();
const baggage = z.object({ type: z.string(), quantity: z.number().int().nonnegative() }).passthrough();
const segment = z
  .object({
    origin: airport,
    destination: airport,
    departing_at: z.string(),
    arriving_at: z.string(),
    marketing_carrier: airline,
    operating_carrier: airline,
    marketing_carrier_flight_number: z.string(),
    passengers: z
      .array(z.object({ passenger_id: z.string(), baggages: z.array(baggage).optional() }).passthrough())
      .optional(),
  })
  .passthrough();
const condition = z
  .object({
    allowed: z.boolean(),
    penalty_amount: z.string().nullable().optional(),
    penalty_currency: CurrencySchema.nullable().optional(),
  })
  .passthrough();
const offerResponse = z
  .object({
    id: z.string(),
    live_mode: z.literal(false),
    total_amount: z.string(),
    total_currency: CurrencySchema,
    base_amount: z.string().nullable().optional(),
    base_currency: CurrencySchema.nullable().optional(),
    tax_amount: z.string().nullable().optional(),
    tax_currency: CurrencySchema.nullable().optional(),
    expires_at: z.string(),
    passenger_identity_documents_required: z.boolean().optional(),
    passengers: z
      .array(
        z
          .object({
            id: z.string(),
            type: z.enum(['adult', 'child', 'infant_without_seat', 'infant_with_seat']),
            age: z.number().int().nonnegative().nullish(),
          })
          .passthrough(),
      )
      .min(1),
    slices: z.array(z.object({ segments: z.array(segment).min(1) }).passthrough()).min(1),
    conditions: z
      .object({
        refund_before_departure: condition.nullable().optional(),
        change_before_departure: condition.nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const nullableMoney = (amount?: string | null, currency?: Money['currency'] | null): Money | null =>
  amount != null && currency != null ? money(amount, currency) : null;
function fareRules(raw: z.infer<typeof offerResponse>): FareRules {
  const refund = raw.conditions?.refund_before_departure,
    change = raw.conditions?.change_before_departure;
  return {
    refundable: refund?.allowed ?? null,
    changeable: change?.allowed ?? null,
    cancellationPenalty: nullableMoney(refund?.penalty_amount, refund?.penalty_currency),
    changePenalty: nullableMoney(change?.penalty_amount, change?.penalty_currency),
    description: `Before departure: refunds ${refund ? (refund.allowed ? 'allowed subject to provider conditions and any quoted penalty' : 'not allowed') : 'unknown'}; changes ${change ? (change.allowed ? 'allowed subject to provider conditions and any quoted penalty' : 'not allowed') : 'unknown'}. See the provider conditions for full terms.`,
  };
}
function minimumBaggage(raw: z.infer<typeof offerResponse>, kind: string): number | null {
  const allowances: number[] = [];
  for (const slice of raw.slices)
    for (const leg of slice.segments)
      for (const passenger of raw.passengers) {
        const entry = leg.passengers?.find((person) => person.passenger_id === passenger.id);
        const items = entry?.baggages?.filter((bag) => bag.type === kind);
        if (!items?.length) return null;
        allowances.push(items.reduce((sum, item) => sum + item.quantity, 0));
      }
  return allowances.length ? Math.min(...allowances) : null;
}

/** Parses documented Duffel v2 responses. Raw payload is retained for audited provider detail. */
export function normalizeDuffelOffer(value: unknown): FlightOffer {
  const result = offerResponse.safeParse(value);
  if (!result.success)
    throw new FlightPilotError(
      'INVALID_PROVIDER_RESPONSE',
      'Duffel returned unsupported or invalid offer data. Live-mode responses are rejected.',
    );
  const raw = result.data;
  const slices = raw.slices.map((slice) => {
    const segments = slice.segments.map((leg) => {
      const start = localTime(leg.departing_at, leg.origin.time_zone),
        end = localTime(leg.arriving_at, leg.destination.time_zone);
      const durationMinutes = end.diff(start, 'minutes').minutes;
      if (durationMinutes <= 0)
        throw new FlightPilotError(
          'INVALID_PROVIDER_RESPONSE',
          'Duffel returned inconsistent segment times.',
        );
      return {
        origin: leg.origin.iata_code,
        destination: leg.destination.iata_code,
        departure: start.toISO()!,
        arrival: end.toISO()!,
        originTimezone: leg.origin.time_zone,
        destinationTimezone: leg.destination.time_zone,
        marketingCarrier: leg.marketing_carrier.iata_code ?? leg.marketing_carrier.name,
        operatingCarrier: leg.operating_carrier.iata_code ?? leg.operating_carrier.name,
        marketingCarrierName: leg.marketing_carrier.name,
        operatingCarrierName: leg.operating_carrier.name,
        flightNumber: leg.marketing_carrier_flight_number,
        durationMinutes,
      };
    });
    const first = segments[0]!,
      last = segments.at(-1)!;
    return {
      segments,
      durationMinutes: localTime(last.arrival, last.destinationTimezone).diff(
        localTime(first.departure, first.originTimezone),
        'minutes',
      ).minutes,
    };
  });
  const checked = minimumBaggage(raw, 'checked');
  const warnings = [
    'DUFFEL TEST MODE — airline sandbox prices and tickets are not real travel bookings.',
    'Visa and entry requirements must be verified separately through official sources.',
  ];
  if (checked === null)
    warnings.push('Checked baggage allowance is not known for every passenger and segment.');
  if (raw.passenger_identity_documents_required)
    warnings.push('This offer requires identity documents; the current secure checkout cannot book it.');
  return OfferSchema.parse({
    id: raw.id,
    provider: 'duffel',
    environment: 'test',
    total: money(raw.total_amount, raw.total_currency),
    base: nullableMoney(raw.base_amount, raw.base_currency),
    tax: nullableMoney(raw.tax_amount, raw.tax_currency),
    expiresAt: new Date(raw.expires_at).toISOString(),
    slices,
    passengers: raw.passengers.map((p) => ({
      id: p.id,
      type: p.type,
      ...(p.age != null ? { age: p.age } : {}),
    })),
    checkedBagsPerPassenger: checked,
    cabinBagsPerPassenger: minimumBaggage(raw, 'carry_on'),
    baggageExtra: null,
    rules: fareRules(raw),
    selfTransfer: false,
    airportChange: slices.some((slice) =>
      slice.segments.some(
        (leg, i) => slice.segments[i + 1] && leg.destination !== slice.segments[i + 1]!.origin,
      ),
    ),
    warnings,
    raw: value,
  });
}

const orderResponse = z
  .object({
    id: z.string(),
    live_mode: z.literal(false),
    total_amount: z.string(),
    total_currency: CurrencySchema,
    booking_reference: z.string().nullable().optional(),
    cancelled_at: z.string().nullable().optional(),
    synced_at: z.string().optional(),
    passengers: z.array(z.object({ id: z.string() }).passthrough()).min(1),
    payment_status: z.object({ awaiting_payment: z.boolean() }).passthrough().optional(),
    documents: z
      .array(z.object({ type: z.string(), unique_identifier: z.string() }).passthrough())
      .optional(),
  })
  .passthrough();
export function normalizeDuffelBooking(value: unknown): BookingStatus {
  const result = orderResponse.safeParse(value);
  if (!result.success)
    throw new FlightPilotError(
      'INVALID_PROVIDER_RESPONSE',
      'Duffel returned unsupported order data. Live-mode responses are rejected.',
    );
  const raw = result.data;
  const ticketNumbers = [
    ...new Set(
      (raw.documents ?? [])
        .filter((doc) => doc.type === 'electronic_ticket' && doc.unique_identifier.trim())
        .map((doc) => doc.unique_identifier),
    ),
  ];
  const status: BookingStatus['status'] = raw.cancelled_at
    ? 'cancelled'
    : raw.payment_status?.awaiting_payment === true
      ? 'reserved'
      : raw.payment_status?.awaiting_payment === false && ticketNumbers.length >= raw.passengers.length
        ? 'ticketed'
        : raw.booking_reference && raw.payment_status?.awaiting_payment === false
          ? 'confirmed'
          : 'pending';
  return {
    id: raw.id,
    provider: 'duffel',
    environment: 'test',
    status,
    reference: raw.booking_reference ?? null,
    ticketNumbers: status === 'cancelled' ? [] : ticketNumbers,
    total: money(raw.total_amount, raw.total_currency),
    updatedAt: raw.synced_at ?? new Date().toISOString(),
    recovery:
      status === 'ticketed' || status === 'cancelled'
        ? null
        : 'PNR alone does not prove ticket issuance. Refresh provider status; do not create another order.',
  };
}

/** Test-only adapter. Production credentials, live response data and real-money payments are refused. */
export class DuffelProvider implements BookingProvider, TicketingProvider {
  readonly id = 'duffel';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    booking: true,
    ticketing: true,
    hostedPayment: false,
    infantWithSeat: false,
    multiCity: true,
    environment: 'test',
  };
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly offers = new Map<string, FlightOffer>();
  constructor(options: { token: string; fetch?: typeof fetch; timeoutMs?: number }) {
    if (!/^duffel_test_\S+$/.test(options.token))
      throw new FlightPilotError(
        'TEST_CREDENTIALS_REQUIRED',
        'Only Duffel test tokens are accepted. Production purchases are disabled.',
      );
    this.token = options.token;
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }
  restoreOffer(offer: FlightOffer) {
    if (offer.provider !== this.id || offer.environment !== 'test')
      throw new FlightPilotError('PROVIDER_MISMATCH', 'Cannot restore another provider’s offer.');
    this.offers.set(offer.id, structuredClone(offer));
  }
  private async request(
    path: string,
    method: 'GET' | 'POST',
    data?: unknown,
    purchase = false,
    correlationId?: string,
  ): Promise<unknown> {
    // No automatic retry, including for uncertain order creation. The core persists attempts before this call.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`https://api.duffel.com${path}`, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Duffel-Version': 'v2',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(correlationId ? { 'x-client-correlation-id': correlationId } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify({ data }) }),
      });
      if (!response.ok) {
        // Order creation can complete upstream even when HTTP fails; do not retry any purchase error blindly.
        if (purchase)
          throw new FlightPilotError(
            'BOOKING_UNCERTAIN',
            `Duffel test order returned HTTP ${response.status}. Reconcile the saved attempt with the provider before retrying.`,
          );
        throw new FlightPilotError(
          response.status === 404
            ? 'OFFER_NOT_FOUND'
            : response.status === 429
              ? 'PROVIDER_RATE_LIMIT'
              : 'PROVIDER_ERROR',
          `Duffel returned HTTP ${response.status}. Check provider status or credentials; no purchase was retried.`,
          response.status === 429 || response.status >= 500,
        );
      }
      const body: unknown = await response.json();
      const envelope = z.object({ data: z.unknown() }).safeParse(body);
      if (!envelope.success || envelope.data.data === undefined)
        throw new FlightPilotError('INVALID_PROVIDER_RESPONSE', 'Duffel response has no data.');
      return envelope.data.data;
    } catch (error) {
      if (purchase)
        throw new FlightPilotError(
          'BOOKING_UNCERTAIN',
          'Duffel test order outcome is uncertain. Reconcile the persisted attempt with the provider; do not retry the purchase.',
        );
      if (error instanceof FlightPilotError) throw error;
      throw new FlightPilotError(
        controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        'Duffel could not complete the request. Try searching again later.',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async searchFlights(input: FlightSearchInput): Promise<FlightOffer[]> {
    if (input.infantsWithSeat && input.infantAges.length)
      throw new FlightPilotError(
        'UNSUPPORTED_PASSENGER',
        'Infants with seats are not supported by this Duffel integration.',
      );
    if (
      input.slices.some((slice) => !/^[A-Z]{3}$/.test(slice.origin) || !/^[A-Z]{3}$/.test(slice.destination))
    )
      throw new FlightPilotError(
        'AIRPORT_CODE_REQUIRED',
        'Resolve city names to airport or city IATA codes before searching.',
      );
    const response = await this.request(
      '/air/offer_requests?return_offers=true&supplier_timeout=20000',
      'POST',
      {
        slices: input.slices.map((slice) => ({
          origin: slice.origin,
          destination: slice.destination,
          departure_date: slice.departureDate,
        })),
        passengers: [
          ...Array.from({ length: input.adults }, () => ({ type: 'adult' })),
          ...input.childAges.map((age) => ({ age })),
          ...input.infantAges.map((age) => ({ age })),
        ],
        cabin_class: input.cabin,
        max_connections: input.maxStops,
      },
    );
    const result = z
      .object({ live_mode: z.literal(false), offers: z.array(z.unknown()) })
      .safeParse(response);
    if (!result.success)
      throw new FlightPilotError(
        'INVALID_PROVIDER_RESPONSE',
        'Duffel returned an invalid test search response.',
      );
    const offers = result.data.offers.map(normalizeDuffelOffer);
    for (const offer of offers) {
      const expectedAges = [...input.childAges, ...input.infantAges].sort((a, b) => a - b);
      const actualAges = offer.passengers
        .flatMap((p) => (p.age !== undefined ? [p.age] : []))
        .sort((a, b) => a - b);
      if (
        offer.passengers.length !== input.adults + expectedAges.length ||
        JSON.stringify(expectedAges) !== JSON.stringify(actualAges) ||
        offer.passengers.some((p) => p.type === 'infant_with_seat')
      ) {
        throw new FlightPilotError(
          'PASSENGER_MISMATCH',
          'Duffel did not preserve the requested traveller count or exact child/infant ages. Search again before booking.',
        );
      }
      if (offer.total.currency !== input.currency)
        offer.warnings.push(
          `Duffel quoted billing currency ${offer.total.currency}, not requested ${input.currency}; no FX conversion is available.`,
        );
      this.offers.set(offer.id, structuredClone(offer));
    }
    return offers;
  }
  async getOffer(id: string): Promise<FlightOffer> {
    if (!/^off_[A-Za-z0-9_-]+$/.test(id))
      throw new FlightPilotError('INVALID_OFFER_ID', 'Use a Duffel offer ID from a search.');
    const offer = normalizeDuffelOffer(
      await this.request(`/air/offers/${encodeURIComponent(id)}?return_available_services=true`, 'GET'),
    );
    if (offer.id !== id)
      throw new FlightPilotError('INVALID_PROVIDER_RESPONSE', 'Duffel returned a different offer.');
    if (Date.parse(offer.expiresAt) <= Date.now())
      throw new FlightPilotError('OFFER_EXPIRED', 'Offer expired. Search again.');
    const previous = this.offers.get(id);
    if (previous) {
      if (
        previous.passengers.length !== offer.passengers.length ||
        offer.passengers.some((p) => !previous.passengers.some((old) => old.id === p.id))
      )
        throw new FlightPilotError(
          'PASSENGER_MISMATCH',
          'Repriced offer contains different travellers. Search again.',
        );
      for (const passenger of offer.passengers) {
        const priorAge = previous.passengers.find((old) => old.id === passenger.id)?.age;
        if (priorAge !== undefined) {
          if (passenger.age !== undefined && passenger.age !== priorAge)
            throw new FlightPilotError(
              'PASSENGER_MISMATCH',
              'Repriced offer changed a traveller age. Search again.',
            );
          passenger.age = priorAge;
        }
      }
    }
    this.offers.set(id, structuredClone(offer));
    return offer;
  }
  async revalidateOffer(id: string) {
    const previous = this.offers.get(id);
    if (!previous)
      throw new FlightPilotError('OFFER_NOT_FOUND', 'Restore the stored search offer before repricing.');
    const offer = await this.getOffer(id);
    return { offer, previousTotal: previous.total, changed: !equalMoney(previous.total, offer.total) };
  }
  async getFareRules(id: string) {
    return (await this.getOffer(id)).rules;
  }
  async createBooking(input: {
    offer: FlightOffer;
    passengers: Passenger[];
    idempotencyKey: string;
  }): Promise<BookingStatus> {
    if (input.offer.provider !== this.id || input.offer.environment !== 'test')
      throw new FlightPilotError('LIVE_BOOKING_DISABLED', 'Only Duffel test offers can be booked.');
    const offer = input.offer;
    if (Date.parse(offer.expiresAt) <= Date.now())
      throw new FlightPilotError('OFFER_EXPIRED', 'Offer expired. Search and review again.');
    const raw = offerResponse.parse(offer.raw);
    if (raw.passenger_identity_documents_required)
      throw new FlightPilotError(
        'IDENTITY_DOCUMENTS_UNSUPPORTED',
        'This offer requires identity documents which the current checkout cannot collect. Select a different supported test offer.',
      );
    if (offer.baggageExtra)
      throw new FlightPilotError(
        'ANCILLARIES_UNSUPPORTED',
        'Extra baggage services must be selected explicitly; this checkout currently supports included baggage only.',
      );
    const passengers = z.array(PassengerSchema).parse(input.passengers);
    if (
      passengers.length !== offer.passengers.length ||
      new Set(passengers.map((p) => p.id)).size !== passengers.length ||
      passengers.some((p) => !offer.passengers.some((op) => op.id === p.id))
    )
      throw new FlightPilotError(
        'PASSENGER_MISMATCH',
        'Passenger IDs must match the selected offer exactly.',
      );
    const infants = offer.passengers.filter((p) => p.type === 'infant_without_seat');
    const adults = offer.passengers.filter((p) => p.type === 'adult');
    if (infants.length > adults.length)
      throw new FlightPilotError('PASSENGER_MISMATCH', 'Each lap infant requires an adult.');
    // This correlation/metadata key is for reconciliation, NOT a claim that Duffel guarantees HTTP idempotency.
    const response = await this.request(
      '/air/orders',
      'POST',
      {
        type: 'instant',
        selected_offers: [offer.id],
        payments: [{ type: 'balance', amount: offer.total.amount, currency: offer.total.currency }],
        passengers: passengers.map((p) => ({
          id: p.id,
          given_name: p.givenName,
          family_name: p.familyName,
          born_on: p.bornOn,
          gender: p.gender,
          title: p.title,
          email: p.email,
          phone_number: p.phone,
          ...(infants[adults.findIndex((adult) => adult.id === p.id)]
            ? { infant_passenger_id: infants[adults.findIndex((adult) => adult.id === p.id)]!.id }
            : {}),
        })),
        metadata: { flightpilot_attempt: input.idempotencyKey },
      },
      true,
      input.idempotencyKey,
    );
    try {
      return normalizeDuffelBooking(response);
    } catch {
      throw new FlightPilotError(
        'BOOKING_UNCERTAIN',
        'Duffel returned an unrecognized order response. Reconcile the saved attempt before trying again.',
      );
    }
  }
  async getBooking(id: string): Promise<BookingStatus> {
    if (!/^ord_[A-Za-z0-9_-]+$/.test(id))
      throw new FlightPilotError('INVALID_BOOKING_ID', 'Use a Duffel order ID.');
    const booking = normalizeDuffelBooking(
      await this.request(`/air/orders/${encodeURIComponent(id)}`, 'GET'),
    );
    if (booking.id !== id)
      throw new FlightPilotError('INVALID_PROVIDER_RESPONSE', 'Duffel returned a different order.');
    return booking;
  }
  async verifyTicketing(id: string): Promise<BookingStatus> {
    return this.getBooking(id);
  }
}
