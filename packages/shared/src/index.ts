import { z } from 'zod';
export const CurrencySchema = z.enum(['INR', 'USD', 'EUR', 'GBP', 'JPY', 'KWD']);
export const MoneySchema = z
  .object({ amount: z.string().regex(/^\d+(\.\d{1,3})?$/), currency: CurrencySchema })
  .strict();
export type Money = z.infer<typeof MoneySchema>;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Use a real calendar date YYYY-MM-DD',
  );
export const SliceInputSchema = z
  .object({ origin: z.string().min(3).max(80), destination: z.string().min(3).max(80), departureDate: date })
  .strict();
export const SearchSchema = z
  .object({
    slices: z.array(SliceInputSchema).min(1).max(4),
    adults: z.number().int().min(1).max(9).default(1),
    childAges: z.array(z.number().int().min(2).max(17)).max(8).default([]),
    infantAges: z.array(z.number().int().min(0).max(1)).max(8).default([]),
    infantsWithSeat: z.boolean().default(false),
    cabin: z.enum(['economy', 'premium_economy', 'business', 'first']).default('economy'),
    currency: CurrencySchema.default('INR'),
    maxStops: z.number().int().min(0).max(2).default(1),
    budget: MoneySchema.optional(),
    checkedBags: z.number().int().min(0).max(3).default(0),
    maxLayoverMinutes: z.number().int().min(30).max(1440).default(240),
    avoidOvernight: z.boolean().default(true),
    preferredAirlines: z
      .array(z.string().regex(/^[A-Z0-9]{2}$/))
      .max(10)
      .default([]),
    avoidedAirlines: z
      .array(z.string().regex(/^[A-Z0-9]{2}$/))
      .max(10)
      .default([]),
    flexibleDays: z.number().int().min(0).max(3).default(0),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.adults + v.childAges.length + v.infantAges.length > 9)
      c.addIssue({ code: 'custom', message: 'At most nine travellers per search' });
    if (v.infantAges.length > v.adults)
      c.addIssue({ code: 'custom', message: 'At least one adult per infant is required' });
    if (v.budget && v.budget.currency !== v.currency)
      c.addIssue({
        code: 'custom',
        message: 'Budget currency must match requested currency; no inferred FX conversion',
      });
    v.slices.forEach((s, i) => {
      if (s.origin.toLowerCase() === s.destination.toLowerCase())
        c.addIssue({ code: 'custom', message: 'Origin and destination must differ' });
      if (i > 0 && s.departureDate < v.slices[i - 1]!.departureDate)
        c.addIssue({ code: 'custom', message: 'Journey dates must be chronological' });
    });
  });
export type FlightSearchInput = z.infer<typeof SearchSchema>;
export const RulesSchema = z.object({
  refundable: z.boolean().nullable(),
  changeable: z.boolean().nullable(),
  cancellationPenalty: MoneySchema.nullable(),
  changePenalty: MoneySchema.nullable(),
  description: z.string(),
});
export type FareRules = z.infer<typeof RulesSchema>;
export const SegmentSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departure: z.string(),
  arrival: z.string(),
  originTimezone: z.string(),
  destinationTimezone: z.string(),
  marketingCarrier: z.string(),
  marketingCarrierName: z.string().optional(),
  operatingCarrier: z.string(),
  operatingCarrierName: z.string().optional(),
  flightNumber: z.string(),
  durationMinutes: z.number().nonnegative(),
});
export const OfferSchema = z.object({
  id: z.string(),
  provider: z.string(),
  environment: z.enum(['simulation', 'test', 'live']),
  total: MoneySchema,
  base: MoneySchema.nullable(),
  tax: MoneySchema.nullable(),
  expiresAt: z.string().datetime(),
  slices: z
    .array(z.object({ segments: z.array(SegmentSchema).min(1), durationMinutes: z.number().nonnegative() }))
    .min(1),
  passengers: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['adult', 'child', 'infant_without_seat', 'infant_with_seat']),
      age: z.number().int().optional(),
    }),
  ),
  checkedBagsPerPassenger: z.number().int().nonnegative().nullable(),
  cabinBagsPerPassenger: z.number().int().nonnegative().nullable(),
  baggageExtra: MoneySchema.nullable(),
  rules: RulesSchema,
  selfTransfer: z.boolean(),
  airportChange: z.boolean(),
  warnings: z.array(z.string()),
  raw: z.unknown(),
});
export type FlightOffer = z.infer<typeof OfferSchema>;
export type PricedOffer = { offer: FlightOffer; previousTotal: Money; changed: boolean };
export const BookingStatusSchema = z.object({
  id: z.string(),
  provider: z.string(),
  environment: z.enum(['simulation', 'test', 'live']),
  status: z.enum(['reserved', 'pending', 'confirmed', 'ticketed', 'cancelled', 'failed', 'unknown']),
  reference: z.string().nullable(),
  ticketNumbers: z.array(z.string()),
  total: MoneySchema,
  updatedAt: z.string(),
  recovery: z.string().nullable(),
});
export type BookingStatus = z.infer<typeof BookingStatusSchema>;
// Identity stays in authenticated backend forms. Never use PassengerSchema in MCP contracts.
export const PassengerSchema = z
  .object({
    id: z.string(),
    givenName: z.string().min(1).max(80),
    familyName: z.string().min(1).max(80),
    bornOn: date,
    gender: z.enum(['m', 'f']),
    title: z.enum(['mr', 'ms', 'mrs', 'miss', 'dr']),
    email: z.string().email(),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  })
  .strict();
export type Passenger = z.infer<typeof PassengerSchema>;
export type ProviderCapabilities = {
  search: boolean;
  booking: boolean;
  ticketing: boolean;
  hostedPayment: boolean;
  infantWithSeat: boolean;
  multiCity: boolean;
  environment: 'simulation' | 'test' | 'live';
};
export interface FlightProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  searchFlights(input: FlightSearchInput): Promise<FlightOffer[]>;
  getOffer(offerId: string): Promise<FlightOffer>;
  revalidateOffer(offerId: string): Promise<PricedOffer>;
  getFareRules(offerId: string): Promise<FareRules>;
  getBooking(bookingId: string): Promise<BookingStatus>;
}
export interface BookingProvider extends FlightProvider {
  createBooking(input: {
    offer: FlightOffer;
    passengers: Passenger[];
    idempotencyKey: string;
  }): Promise<BookingStatus>;
}
export interface TicketingProvider extends FlightProvider {
  verifyTicketing(bookingId: string): Promise<BookingStatus>;
}
export class FlightPilotError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = 'FlightPilotError';
  }
}
export const IdSchema = z.object({ offerId: z.string().min(1).max(200) }).strict();
export const CompareSchema = z.object({ offerIds: z.array(z.string().min(1)).min(1).max(20) }).strict();
export const DatesSchema = z.object({ search: SearchSchema, days: z.number().int().min(1).max(7) }).strict();
export const BookingIdSchema = z.object({ bookingId: z.string().min(1).max(200) }).strict();
export const ResolveSchema = z.object({ query: z.string().min(2).max(80) }).strict();
export const ToolSchemas = {
  search_flights: SearchSchema,
  compare_flights: CompareSchema,
  find_cheapest_dates: DatesSchema,
  get_fare_details: IdSchema,
  revalidate_offer: IdSchema,
  prepare_checkout: IdSchema,
  get_booking_status: BookingIdSchema,
  list_my_bookings: z.object({}).strict(),
  resolve_airport: ResolveSchema,
} as const;
export type ToolName = keyof typeof ToolSchemas;
export type Checkout = {
  id: string;
  userId: string;
  offerId: string;
  offer: FlightOffer;
  total: Money;
  version: number;
  state:
    | 'review'
    | 'processing'
    | 'reserved'
    | 'pending'
    | 'ticketed'
    | 'confirmed'
    | 'cancelled'
    | 'unknown'
    | 'failed'
    | 'uncertain';
  expiresAt: string;
  bookingId: string | null;
  recovery: string | null;
  createdAt: string;
};
export type Recommendation = {
  offerId: string;
  category: 'cheapest' | 'best_value' | 'fastest';
  reasons: string[];
  comparableTotal: Money;
  score: string;
};
export type Comparison = {
  recommendations: Recommendation[];
  excluded: { offerId: string; reasons: string[] }[];
  warnings: string[];
};
