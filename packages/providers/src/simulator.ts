import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { DateTime } from 'luxon';
import {
  FlightPilotError,
  OfferSchema,
  type BookingProvider,
  type BookingStatus,
  type FlightOffer,
  type FlightSearchInput,
  type Passenger,
  type ProviderCapabilities,
  type TicketingProvider,
} from '@flightpilot/shared';
import { equalMoney, money } from '@flightpilot/pricing-engine';

export type SimulationScenario = 'normal' | 'price_change' | 'pending' | 'payment_declined' | 'uncertain';
const zones: Record<string, string> = {
  PNQ: 'Asia/Kolkata',
  DEL: 'Asia/Kolkata',
  BOM: 'Asia/Kolkata',
  BLR: 'Asia/Kolkata',
  HYD: 'Asia/Kolkata',
  MAA: 'Asia/Kolkata',
  CCU: 'Asia/Kolkata',
  GOI: 'Asia/Kolkata',
  GOX: 'Asia/Kolkata',
  COK: 'Asia/Kolkata',
  AMD: 'Asia/Kolkata',
  JAI: 'Asia/Kolkata',
  LHR: 'Europe/London',
  LGW: 'Europe/London',
  JFK: 'America/New_York',
  EWR: 'America/New_York',
  DXB: 'Asia/Dubai',
  SIN: 'Asia/Singapore',
  BKK: 'Asia/Bangkok',
  CDG: 'Europe/Paris',
  SFO: 'America/Los_Angeles',
  SYD: 'Australia/Sydney',
  DOH: 'Asia/Qatar',
};
const clone = <T>(value: T): T => structuredClone(value);

/** Explicitly fabricated local test data. This class never calls an airline or payment network. */
export class SimulatorProvider implements BookingProvider, TicketingProvider {
  readonly id = 'simulator';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    booking: true,
    ticketing: true,
    hostedPayment: false,
    infantWithSeat: true,
    multiCity: true,
    environment: 'simulation',
  };
  private readonly offers = new Map<string, FlightOffer>();
  private readonly bookings = new Map<string, BookingStatus>();
  private readonly attempts = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<BookingStatus>>();
  private readonly repriced = new Set<string>();
  private readonly now: () => Date;
  private scenario: SimulationScenario;
  constructor(options: { now?: () => Date; scenario?: SimulationScenario } = {}) {
    this.now = options.now ?? (() => new Date());
    this.scenario = options.scenario ?? 'normal';
  }
  setScenario(scenario: SimulationScenario) {
    this.scenario = scenario;
  }
  restoreOffer(offer: FlightOffer): void {
    if (offer.provider !== this.id || offer.environment !== 'simulation')
      throw new FlightPilotError('PROVIDER_MISMATCH', 'Cannot restore another provider’s offer.');
    this.offers.set(offer.id, OfferSchema.parse(clone(offer)));
  }
  restoreBooking(booking: BookingStatus): void {
    if (booking.provider !== this.id || booking.environment !== 'simulation')
      throw new FlightPilotError('PROVIDER_MISMATCH', 'Cannot restore another provider’s booking.');
    this.bookings.set(booking.id, clone(booking));
  }
  async searchFlights(input: FlightSearchInput): Promise<FlightOffer[]> {
    const passengers: FlightOffer['passengers'] = [
      ...Array.from({ length: input.adults }, () => ({
        id: `sim_pas_${randomUUID()}`,
        type: 'adult' as const,
      })),
      ...input.childAges.map((age) => ({ id: `sim_pas_${randomUUID()}`, type: 'child' as const, age })),
      ...input.infantAges.map((age) => ({
        id: `sim_pas_${randomUUID()}`,
        type: input.infantsWithSeat ? ('infant_with_seat' as const) : ('infant_without_seat' as const),
        age,
      })),
    ];
    const units = new Decimal(input.adults)
      .add(new Decimal(input.childAges.length).mul('0.75'))
      .add(new Decimal(input.infantAges.length).mul(input.infantsWithSeat ? '0.75' : '0.1'));
    const offers = [
      { label: 'Synthetic Saver', rate: '4300', hour: 9, flightMinutes: 180, layover: 120, bags: 1 },
      { label: 'Synthetic Balanced', rate: '4700', hour: 11, flightMinutes: 120, layover: 0, bags: 1 },
      { label: 'Synthetic Express', rate: '6100', hour: 15, flightMinutes: 105, layover: 0, bags: 2 },
    ]
      .filter((variant) => input.maxStops > 0 || variant.layover === 0)
      .map((variant, variantIndex) => {
        const slices = input.slices.map((slice) => {
          const originZone = zones[slice.origin],
            destinationZone = zones[slice.destination];
          if (!originZone || !destinationZone)
            throw new FlightPilotError(
              'SIMULATION_AIRPORT_UNSUPPORTED',
              'The local simulator has no time zone for this airport. Use a supported airport or connect Duffel test mode.',
            );
          const departure = DateTime.fromISO(
            `${slice.departureDate}T${String(variant.hour).padStart(2, '0')}:00:00`,
            { zone: originZone },
          );
          const connection = ['BOM', 'DEL', 'BLR'].find(
            (code) => code !== slice.origin && code !== slice.destination,
          )!;
          const makeSegment = (
            origin: string,
            destination: string,
            dep: DateTime,
            duration: number,
            index: number,
          ) => ({
            origin,
            destination,
            departure: dep.setZone(zones[origin]!).toISO()!,
            arrival: dep.plus({ minutes: duration }).setZone(zones[destination]!).toISO()!,
            originTimezone: zones[origin]!,
            destinationTimezone: zones[destination]!,
            marketingCarrier: 'ZZ',
            operatingCarrier: 'ZZ',
            marketingCarrierName: 'FlightPilot Synthetic Airline',
            operatingCarrierName: 'FlightPilot Synthetic Airline',
            flightNumber: `SIM${variantIndex + 1}${index}`,
            durationMinutes: duration,
          });
          const segments = variant.layover
            ? [
                makeSegment(slice.origin, connection, departure, 90, 1),
                makeSegment(
                  connection,
                  slice.destination,
                  departure.plus({ minutes: 90 + variant.layover }),
                  90,
                  2,
                ),
              ]
            : [makeSegment(slice.origin, slice.destination, departure, variant.flightMinutes, 1)];
          return { segments, durationMinutes: variant.flightMinutes + variant.layover };
        });
        // Amounts are arbitrary test units in the requested currency, never FX estimates.
        const amount = units
          .mul(variant.rate)
          .mul(input.slices.length)
          .toDecimalPlaces(input.currency === 'JPY' ? 0 : input.currency === 'KWD' ? 3 : 2);
        const offer: FlightOffer = {
          id: `sim_off_${randomUUID()}`,
          provider: this.id,
          environment: 'simulation',
          total: money(amount, input.currency),
          base: null,
          tax: null,
          expiresAt: new Date(this.now().getTime() + 15 * 60_000).toISOString(),
          slices,
          passengers,
          checkedBagsPerPassenger: variant.bags,
          cabinBagsPerPassenger: 1,
          baggageExtra: null,
          rules: {
            refundable: false,
            changeable: variantIndex > 0,
            cancellationPenalty: null,
            changePenalty: null,
            description: 'SYNTHETIC TEST RULES. No real fare, refund, or ticket exists.',
          },
          selfTransfer: false,
          airportChange: false,
          warnings: [
            'SIMULATION ONLY — fabricated fares, schedules and entitlements. No airline inventory searched.',
            'Synthetic prices have no relation to real market fares.',
            'Visa and entry requirements must be verified separately through official sources.',
          ],
          raw: { synthetic: true, fixtureVersion: 1, label: variant.label, input: clone(input) },
        };
        this.offers.set(offer.id, clone(offer));
        return offer;
      });
    return clone(offers);
  }
  async getOffer(id: string): Promise<FlightOffer> {
    const offer = this.offers.get(id);
    if (!offer) throw new FlightPilotError('OFFER_NOT_FOUND', 'Offer not found; search again.');
    if (Date.parse(offer.expiresAt) <= this.now().getTime())
      throw new FlightPilotError('OFFER_EXPIRED', 'This offer expired. Search again.');
    return clone(offer);
  }
  async revalidateOffer(id: string) {
    const offer = await this.getOffer(id);
    const previousTotal = clone(offer.total);
    if (this.scenario === 'price_change' && !this.repriced.has(id)) {
      offer.total = money(new Decimal(offer.total.amount).add('100'), offer.total.currency);
      this.repriced.add(id);
      this.offers.set(id, clone(offer));
    }
    return { offer, previousTotal, changed: !equalMoney(previousTotal, offer.total) };
  }
  async getFareRules(id: string) {
    return (await this.getOffer(id)).rules;
  }
  async createBooking(input: {
    offer: FlightOffer;
    passengers: Passenger[];
    idempotencyKey: string;
  }): Promise<BookingStatus> {
    const prior = this.attempts.get(input.idempotencyKey);
    if (prior) return this.getBooking(prior);
    const active = this.inflight.get(input.idempotencyKey);
    if (active) return active;
    const attempt = this.completeBooking(input);
    this.inflight.set(input.idempotencyKey, attempt);
    try {
      return await attempt;
    } finally {
      this.inflight.delete(input.idempotencyKey);
    }
  }
  private async completeBooking(input: {
    offer: FlightOffer;
    passengers: Passenger[];
    idempotencyKey: string;
  }): Promise<BookingStatus> {
    const offer = await this.getOffer(input.offer.id);
    if (!equalMoney(offer.total, input.offer.total))
      throw new FlightPilotError('PRICE_CHANGED', 'Price changed; review and approve the refreshed total.');
    if (
      input.passengers.length !== offer.passengers.length ||
      new Set(input.passengers.map((p) => p.id)).size !== input.passengers.length ||
      input.passengers.some((p) => !offer.passengers.some((op) => op.id === p.id))
    )
      throw new FlightPilotError(
        'PASSENGER_MISMATCH',
        'Passenger IDs must match the selected offer exactly.',
      );
    if (this.scenario === 'payment_declined')
      throw new FlightPilotError(
        'PAYMENT_DECLINED',
        'Synthetic payment failure. No payment or airline booking was made.',
      );
    if (this.scenario === 'uncertain')
      throw new FlightPilotError(
        'BOOKING_UNCERTAIN',
        'Synthetic uncertain result. Reconcile the attempt before trying again.',
      );
    const booking: BookingStatus = {
      id: `sim_ord_${offer.passengers.length}_${randomUUID()}`,
      provider: this.id,
      environment: 'simulation',
      status: this.scenario === 'pending' ? 'pending' : 'ticketed',
      reference: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
      ticketNumbers:
        this.scenario === 'pending'
          ? []
          : offer.passengers.map((_, index) => `SIMULATED-NOT-A-TICKET-${index + 1}`),
      total: offer.total,
      updatedAt: this.now().toISOString(),
      recovery:
        this.scenario === 'pending'
          ? 'Synthetic pending state. Poll status after changing the simulation scenario to normal.'
          : 'Simulation completed. No real payment, booking reference or e-ticket exists.',
    };
    this.bookings.set(booking.id, clone(booking));
    this.attempts.set(input.idempotencyKey, booking.id);
    return clone(booking);
  }
  async getBooking(id: string): Promise<BookingStatus> {
    const booking = this.bookings.get(id);
    if (!booking) throw new FlightPilotError('BOOKING_NOT_FOUND', 'Simulation booking is unavailable.');
    if (booking.status === 'pending' && this.scenario === 'normal') {
      const travellerCount = Number(/^sim_ord_([1-9])_/.exec(id)?.[1] ?? 1);
      booking.status = 'ticketed';
      booking.ticketNumbers = Array.from(
        { length: travellerCount },
        (_, index) => `SIMULATED-NOT-A-TICKET-${index + 1}`,
      );
      booking.updatedAt = this.now().toISOString();
      booking.recovery = 'Simulation completed. No real payment or airline ticket exists.';
    }
    return clone(booking);
  }
  async verifyTicketing(id: string): Promise<BookingStatus> {
    return this.getBooking(id);
  }
}
