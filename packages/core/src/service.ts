import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { DateTime } from 'luxon';
import { z } from 'zod';
import {
  SearchSchema,
  ToolSchemas,
  FlightPilotError,
  PassengerSchema,
  MoneySchema,
  type FlightOffer,
  type FlightSearchInput,
  type BookingProvider,
  type BookingStatus,
  type Checkout,
  type Passenger,
  type ToolName,
} from '@flightpilot/shared';
import { compareOffers } from '@flightpilot/pricing-engine';
import { SimulatorProvider, DuffelProvider } from '@flightpilot/providers';
import { Store } from './store';
import { encrypt, decrypt, rateLimit } from './security';
import { airportCode, resolveAirport } from './airports';
import type { Config } from './config';
type SavedOffer = { offer: Omit<FlightOffer, 'raw'>; rawEncrypted: string; search: FlightSearchInput };
export const ApproveSchema = z
  .object({
    version: z.number().int().positive(),
    approvedTotal: MoneySchema,
    passengers: z.array(PassengerSchema).min(1).max(9),
    consent: z.literal(true),
    simulationOutcome: z.enum(['success', 'decline', 'timeout', 'pending']).optional(),
  })
  .strict();
export function safeOffer(offer: FlightOffer) {
  const { raw: _raw, ...safe } = offer;
  return safe;
}
export function safeCheckout(checkout: Checkout) {
  const { userId: _userId, ...safe } = checkout;
  return { ...safe, offer: safeOffer(checkout.offer) };
}
function expired(offer: FlightOffer) {
  if (Date.parse(offer.expiresAt) <= Date.now())
    throw new FlightPilotError('OFFER_EXPIRED', 'This fare expired. Run a fresh flight search.');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function sameMoney(a: FlightOffer['total'], b: FlightOffer['total']) {
  return a.currency === b.currency && new Decimal(a.amount).equals(b.amount);
}
export class FlightService {
  private readonly bookingRefreshes = new Map<string, Promise<BookingStatus>>();
  constructor(
    readonly store: Store,
    readonly provider: BookingProvider,
    readonly config: Config,
  ) {}
  private async audit(user: string, event: string, id: string) {
    await this.store.put('audits', randomUUID(), user, {
      event,
      resourceId: id,
      time: new Date().toISOString(),
    });
  }
  private async saveOffer(user: string, offer: FlightOffer, search: FlightSearchInput) {
    await this.store.put('offers', offer.id, user, {
      offer: safeOffer(offer),
      rawEncrypted: encrypt(offer.raw, this.config.encryptionKey),
      search,
    } satisfies SavedOffer);
    await this.store.put('observations', randomUUID(), user, {
      offerId: offer.id,
      total: offer.total,
      observedAt: new Date().toISOString(),
      environment: offer.environment,
    });
  }
  private async offer(user: string, id: string) {
    const saved = await this.store.get<SavedOffer>('offers', id, user);
    if (!saved) throw new FlightPilotError('NOT_FOUND', 'Offer not found in your searches. Search again.');
    const offer: FlightOffer = {
      ...saved.offer,
      raw: decrypt(saved.rawEncrypted, this.config.encryptionKey),
    };
    if (this.provider instanceof SimulatorProvider || this.provider instanceof DuffelProvider)
      this.provider.restoreOffer(offer);
    return { offer, search: saved.search };
  }
  private async reprice(user: string, id: string) {
    const saved = await this.offer(user, id);
    expired(saved.offer);
    const refreshed = await this.provider.revalidateOffer(id);
    expired(refreshed.offer);
    const result = {
      offer: refreshed.offer,
      previousTotal: saved.offer.total,
      changed: !sameMoney(saved.offer.total, refreshed.offer.total),
    };
    await this.saveOffer(user, result.offer, saved.search);
    return result;
  }
  private async search(user: string, raw: unknown) {
    const input = SearchSchema.parse(raw);
    const today = DateTime.utc().toISODate()!;
    if (input.slices.some((s) => s.departureDate < today))
      throw new FlightPilotError('PAST_DATE', 'Choose travel dates today or later, including the year.');
    input.slices = input.slices.map((s) => ({
      ...s,
      origin: airportCode(s.origin),
      destination: airportCode(s.destination),
    }));
    if (input.slices.some((s) => s.origin === s.destination))
      throw new FlightPilotError('INVALID_ROUTE', 'Origin and destination resolve to the same airport.');
    if (input.infantsWithSeat && !this.provider.capabilities.infantWithSeat)
      throw new FlightPilotError('UNSUPPORTED', 'This provider does not support seated infants.');
    if (input.slices.length > 2 && !this.provider.capabilities.multiCity)
      throw new FlightPilotError('UNSUPPORTED', 'This provider does not support multi-city.');
    const offers = await this.provider.searchFlights(input);
    const searchId = randomUUID();
    await this.store.put('searches', searchId, user, {
      id: searchId,
      input,
      offerIds: offers.map((o) => o.id),
      createdAt: new Date().toISOString(),
    });
    for (const offer of offers) await this.saveOffer(user, offer, input);
    return {
      searchId,
      offers: offers.map(safeOffer),
      comparison: compareOffers(offers, input),
      providers: [this.provider.id],
      notice:
        this.config.mode === 'simulation'
          ? 'SIMULATION: fabricated example fares. No airline search or real booking occurs.'
          : 'Duffel TEST environment: test inventory, not travel-valid tickets.',
      travellerAgeReminder:
        'Child and infant ages must be exact on every travel date. If a birthday changes age during this itinerary, search separate journeys. Visa and entry requirements must be checked independently with official sources.',
    };
  }
  async tool(user: string, name: ToolName, raw: unknown): Promise<unknown> {
    rateLimit(`tools:${user}`, 60);
    ToolSchemas[name].parse(raw);
    if (name === 'resolve_airport') return resolveAirport((raw as { query: string }).query);
    if (name === 'search_flights') {
      const input = SearchSchema.parse(raw);
      if (!input.flexibleDays) return this.search(user, input);
      const range = (await this.tool(user, 'find_cheapest_dates', {
        search: { ...input, flexibleDays: 0 },
        days: 2 * input.flexibleDays + 1,
      })) as { results: Array<{ offers?: Omit<FlightOffer, 'raw'>[]; dates: string[]; error?: unknown }> };
      const offers = range.results.flatMap((r) => r.offers ?? []);
      const searchId = randomUUID();
      await this.store.put('searches', searchId, user, {
        id: searchId,
        input,
        offerIds: offers.map((o) => o.id),
        createdAt: new Date().toISOString(),
      });
      return {
        searchId,
        offers,
        comparison: compareOffers(
          offers.map((o) => ({ ...o, raw: null })),
          input,
        ),
        providers: [this.provider.id],
        dateResults: range.results.map((r) => ({ dates: r.dates, error: r.error })),
        notice: `${this.provider.capabilities.environment.toUpperCase()}: searched up to ${2 * input.flexibleDays + 1} date combinations; these are not live travel fares.`,
      };
    }
    if (name === 'list_my_bookings')
      return { bookings: await this.store.list<BookingStatus>('bookings', user) };
    if (name === 'get_booking_status')
      return { booking: await this.booking(user, (raw as { bookingId: string }).bookingId) };
    if (name === 'compare_flights') {
      const ids = (raw as { offerIds: string[] }).offerIds;
      const saved = await Promise.all(ids.map((id) => this.offer(user, id)));
      const first = saved[0]!;
      const profile = (s: FlightSearchInput) => ({
        ...s,
        flexibleDays: 0,
        slices: s.slices.map(({ departureDate: _departureDate, ...route }) => route),
      });
      if (saved.some((s) => canonical(profile(s.search)) !== canonical(profile(first.search))))
        throw new FlightPilotError(
          'INCOMPARABLE',
          'Compare offers for the same travellers, route and preferences only.',
        );
      return compareOffers(
        saved.map((s) => s.offer),
        first.search,
      );
    }
    if (name === 'find_cheapest_dates') {
      const { search, days } = ToolSchemas.find_cheapest_dates.parse(raw);
      rateLimit(`dates:${user}`, 2, 60000);
      const results = [];
      for (let i = 0; i < days; i++) {
        const offset = i - Math.floor(days / 2);
        const shifted = {
          ...search,
          flexibleDays: 0,
          slices: search.slices.map((s) => ({
            ...s,
            departureDate: DateTime.fromISO(s.departureDate).plus({ days: offset }).toISODate()!,
          })),
        };
        try {
          const found = await this.search(user, shifted);
          results.push({ dates: shifted.slices.map((s) => s.departureDate), ...found });
        } catch (e) {
          if (e instanceof FlightPilotError)
            results.push({
              dates: shifted.slices.map((s) => s.departureDate),
              error: { code: e.code, message: e.message },
            });
          else throw e;
        }
      }
      return {
        results,
        dateCombinationsAttempted: days,
        notice: 'At most seven actual provider searches. No inferred fares or FX conversions.',
      };
    }
    const id = (raw as { offerId: string }).offerId;
    if (name === 'revalidate_offer') {
      const p = await this.reprice(user, id);
      return { ...p, offer: safeOffer(p.offer) };
    }
    if (name === 'get_fare_details') {
      const p = await this.reprice(user, id);
      return {
        offer: safeOffer(p.offer),
        rules: await this.provider.getFareRules(id),
        previousTotal: p.previousTotal,
        changed: p.changed,
      };
    }
    if (name === 'prepare_checkout') return this.prepare(user, id);
    throw new FlightPilotError('UNKNOWN_TOOL', 'Unknown FlightPilot tool.');
  }
  async prepare(user: string, id: string) {
    if (!this.provider.capabilities.booking)
      throw new FlightPilotError('BOOKING_UNSUPPORTED', 'This provider cannot book this offer.');
    const existing = (await this.store.list<Checkout>('checkouts', user)).find((c) => c.offerId === id);
    if (existing) {
      if (Date.parse(existing.expiresAt) < Date.now() && existing.state === 'review')
        throw new FlightPilotError('CHECKOUT_EXPIRED', 'Checkout expired. Run a new search before booking.');
      return this.checkoutLink(existing);
    }
    const { offer } = await this.reprice(user, id);
    const { search } = await this.offer(user, id);
    const comparison = compareOffers([offer], search);
    if (comparison.excluded.length)
      throw new FlightPilotError('UNSUITABLE_OFFER', comparison.excluded[0]!.reasons.join(' '));
    if (offer.baggageExtra && new Decimal(offer.baggageExtra.amount).greaterThan(0))
      throw new FlightPilotError(
        'ANCILLARY_UNSUPPORTED',
        'Selected baggage services require a provider service-selection integration. Choose an inclusive fare.',
      );
    if (
      offer.raw &&
      typeof offer.raw === 'object' &&
      'passenger_identity_documents_required' in offer.raw &&
      offer.raw.passenger_identity_documents_required
    )
      throw new FlightPilotError(
        'IDENTITY_DOCUMENTS_UNSUPPORTED',
        'This fare requires identity documents. Choose a supported test fare; passport collection is not implemented.',
      );
    const checkout: Checkout = {
      id: randomUUID(),
      userId: user,
      offerId: id,
      offer: { ...safeOffer(offer), raw: null },
      total: offer.total,
      version: 1,
      state: 'review',
      expiresAt: new Date(Math.min(Date.parse(offer.expiresAt), Date.now() + 15 * 60000)).toISOString(),
      bookingId: null,
      recovery: null,
      createdAt: new Date().toISOString(),
    };
    const inserted = await this.store.insert('checkouts', checkout.id, user, checkout);
    if (!inserted) {
      const concurrent = (await this.store.list<Checkout>('checkouts', user)).find((c) => c.offerId === id);
      if (concurrent) return this.checkoutLink(concurrent);
      throw new FlightPilotError('CONFLICT', 'Checkout creation conflicted. Try again.');
    }
    await this.audit(user, 'checkout_prepared', checkout.id);
    return this.checkoutLink(checkout);
  }
  private checkoutLink(c: Checkout) {
    return {
      checkoutId: c.id,
      url: `${this.config.baseUrl}/checkout/${encodeURIComponent(c.id)}`,
      expiresAt: c.expiresAt,
      notice:
        'No payment taken. Sign in and explicitly approve the current total in checkout. Production transactions are disabled.',
    };
  }
  async checkout(user: string, id: string) {
    const checkout = await this.store.get<Checkout>('checkouts', id, user);
    if (!checkout) throw new FlightPilotError('NOT_FOUND', 'Checkout not found.');
    return checkout;
  }
  private validatePassengers(offer: FlightOffer, passengers: Passenger[]) {
    if (
      passengers.length !== offer.passengers.length ||
      new Set(passengers.map((p) => p.id)).size !== passengers.length
    )
      throw new FlightPilotError(
        'TRAVELLER_MISMATCH',
        'Provide exactly one form for every traveller in this fare.',
      );
    for (const expected of offer.passengers) {
      const p = passengers.find((v) => v.id === expected.id);
      if (!p)
        throw new FlightPilotError(
          'TRAVELLER_MISMATCH',
          'Traveller identifiers must match the selected offer.',
        );
      for (const slice of offer.slices) {
        const day = DateTime.fromISO(slice.segments[0]!.departure.slice(0, 10));
        const dob = DateTime.fromISO(p.bornOn);
        const age = Math.floor(day.diff(dob, 'years').years);
        if (
          age < 0 ||
          age > 120 ||
          (expected.age !== undefined && age !== expected.age) ||
          (expected.type === 'adult' && expected.age === undefined && age < 18) ||
          (['infant_without_seat', 'infant_with_seat'].includes(expected.type) && age > 1) ||
          (expected.type === 'child' && (age < 2 || age > 17))
        )
          throw new FlightPilotError(
            'AGE_MISMATCH',
            'Date of birth does not match the age on every travel date. Run a new search with exact ages; split journeys if an age changes.',
          );
      }
    }
  }
  async approve(user: string, id: string, raw: unknown) {
    const input = ApproveSchema.parse(raw);
    let checkout = await this.checkout(user, id);
    if (checkout.state !== 'review')
      return {
        checkout: safeCheckout(checkout),
        booking: checkout.bookingId ? await this.booking(user, checkout.bookingId) : undefined,
      };
    if (Date.parse(checkout.expiresAt) <= Date.now())
      throw new FlightPilotError('CHECKOUT_EXPIRED', 'Checkout expired. Run a fresh search.');
    if (input.version !== checkout.version || !sameMoney(input.approvedTotal, checkout.total))
      throw new FlightPilotError('PRICE_CHANGED', 'Review the latest total and approve it again.');
    const { offer } = await this.reprice(user, checkout.offerId);
    this.validatePassengers(offer, input.passengers);
    const saved = await this.offer(user, checkout.offerId);
    const eligibility = compareOffers([offer], saved.search);
    if (eligibility.excluded.length)
      throw new FlightPilotError('UNSUITABLE_OFFER', eligibility.excluded[0]!.reasons.join(' '));
    // Re-approval also required for any normalized itinerary/conditions change, even at the same price.
    const meaningful = (o: FlightOffer) =>
      canonical({
        total: o.total,
        slices: o.slices,
        passengers: o.passengers,
        bags: o.checkedBagsPerPassenger,
        cabinBags: o.cabinBagsPerPassenger,
        baggageExtra: o.baggageExtra,
        selfTransfer: o.selfTransfer,
        airportChange: o.airportChange,
        rules: o.rules,
      });
    if (!sameMoney(offer.total, checkout.total) || meaningful(offer) !== meaningful(checkout.offer)) {
      checkout = {
        ...checkout,
        offer: { ...safeOffer(offer), raw: null },
        total: offer.total,
        version: checkout.version + 1,
      };
      if (!(await this.store.claim(id, user, input.version, checkout)))
        throw new FlightPilotError('CONFLICT', 'Another approval is processing. Refresh checkout.');
      throw new FlightPilotError(
        'PRICE_CHANGED',
        'The fare or itinerary changed. Review the updated details and approve again.',
      );
    }
    if (offer.environment === 'live')
      throw new FlightPilotError('LIVE_DISABLED', 'Production transactions are disabled in this build.');
    if (input.simulationOutcome && offer.environment !== 'simulation')
      throw new FlightPilotError(
        'INVALID_MODE',
        'Failure scenarios are only available in the local simulator.',
      );
    checkout = { ...checkout, state: 'processing' };
    if (!(await this.store.claim(id, user, input.version, checkout)))
      return { checkout: safeCheckout(await this.checkout(user, id)) };
    await this.store.put('attempts', id, user, {
      id,
      checkoutId: id,
      idempotencyKey: id,
      status: 'processing',
      startedAt: new Date().toISOString(),
    });
    await this.audit(user, 'explicit_checkout_approval', id);
    // All failures after claiming the row leave it non-retryable. A process crash leaves processing; recover by provider reconciliation, never another POST.
    try {
      if (input.simulationOutcome === 'decline')
        throw new FlightPilotError(
          'PAYMENT_DECLINED',
          'Simulated payment decline. No provider booking created. Start a new search.',
        );
      if (input.simulationOutcome === 'timeout')
        throw new FlightPilotError(
          'BOOKING_UNCERTAIN',
          'Simulated ambiguous provider timeout. Do not retry this purchase; contact support for reconciliation.',
        );
      let booking = await this.provider.createBooking({
        offer,
        passengers: input.passengers,
        idempotencyKey: id,
      });
      // Keep the provider ID for recovery, but do not publish ticket completion
      // until the independent order retrieval below succeeds.
      await this.store.put('bookings', booking.id, user, {
        ...booking,
        status: 'pending',
        ticketNumbers: [],
        recovery: 'Order created; independent provider status verification is pending. Do not book again.',
      });
      checkout = { ...checkout, bookingId: booking.id };
      await this.store.put('checkouts', id, user, checkout);
      booking = await this.provider.getBooking(booking.id);
      if (input.simulationOutcome === 'pending') {
        booking.status = 'pending';
        booking.ticketNumbers = [];
        booking.recovery = 'SIMULATION: ticket issuance is pending. This is not a travel-valid ticket.';
        if (this.provider instanceof SimulatorProvider) this.provider.restoreBooking(booking);
      }
      await this.store.put('bookings', booking.id, user, booking);
      await this.store.put('ticketing', booking.id, user, {
        bookingId: booking.id,
        status: booking.status,
        ticketNumbers: booking.ticketNumbers,
        verifiedAt: new Date().toISOString(),
      });
      await this.store.put('payments', id, user, {
        checkoutId: id,
        environment: offer.environment,
        amount: offer.total,
        status: offer.environment === 'simulation' ? 'simulated' : 'test_balance',
        cardDataStored: false,
      });
      checkout = { ...checkout, bookingId: booking.id, state: booking.status, recovery: booking.recovery };
      await this.store.put('checkouts', id, user, checkout);
      await this.store.put('attempts', id, user, {
        id,
        checkoutId: id,
        idempotencyKey: id,
        status: checkout.state,
        bookingId: booking.id,
      });
      await this.audit(user, 'provider_booking_observed', id);
      return { checkout: safeCheckout(checkout), booking };
    } catch (e) {
      const code = e instanceof FlightPilotError ? e.code : 'BOOKING_UNCERTAIN';
      const definite = code === 'PAYMENT_DECLINED';
      checkout = {
        ...checkout,
        state: definite ? 'failed' : 'uncertain',
        recovery: definite
          ? 'Simulated decline; no booking was created. Start a fresh search.'
          : 'Outcome uncertain. Do not submit another purchase. Check the supplier dashboard and reconcile this checkout ID before proceeding.',
      };
      await this.store.put('checkouts', id, user, checkout);
      await this.store.put('attempts', id, user, { id, status: checkout.state, code, idempotencyKey: id });
      await this.audit(user, code, id);
      throw new FlightPilotError(code, checkout.recovery!);
    }
  }
  async booking(user: string, id: string): Promise<BookingStatus> {
    const key = user + ':' + id;
    const active = this.bookingRefreshes.get(key);
    if (active) return active;
    const refresh = this.refreshBooking(user, id);
    this.bookingRefreshes.set(key, refresh);
    try {
      return await refresh;
    } finally {
      this.bookingRefreshes.delete(key);
    }
  }
  private async refreshBooking(user: string, id: string) {
    const old = await this.store.get<BookingStatus>('bookings', id, user);
    if (!old) throw new FlightPilotError('NOT_FOUND', 'Booking not found in your account.');
    if (this.provider instanceof SimulatorProvider) this.provider.restoreBooking(old);
    const observed = await this.provider.getBooking(id);
    const fresh = await this.store.updateBooking(user, observed);
    await this.store.put('ticketing', id, user, {
      bookingId: id,
      status: fresh.status,
      ticketNumbers: fresh.ticketNumbers,
      verifiedAt: new Date().toISOString(),
    });
    for (const checkout of await this.store.list<Checkout>('checkouts', user)) {
      if (checkout.bookingId === id)
        await this.store.put('checkouts', checkout.id, user, {
          ...checkout,
          state: fresh.status,
          recovery: fresh.recovery,
        });
    }
    return fresh;
  }
}
