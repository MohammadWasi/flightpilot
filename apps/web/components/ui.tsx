import type { BookingStatus, FlightOffer, Money } from '@flightpilot/shared';
export type SafeOffer = Omit<FlightOffer, 'raw'>;
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!response.ok || result.error)
    throw new ApiError(
      result.error?.code ?? String(response.status),
      result.error?.message ?? 'The request could not be completed. Please try again.',
    );
  return result as T;
}
export const tool = <T,>(name: string, input: unknown) => api<T>(`/api/tools/${name}`, input);
export function money(value: Money): string {
  // Display only. All monetary comparisons and calculations happen with exact decimals in the backend.
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: value.currency,
    maximumFractionDigits: value.currency === 'KWD' ? 3 : value.currency === 'JPY' ? 0 : 2,
  }).format(Number(value.amount));
}
export function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
}
export function localDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
export function Icon({
  name,
  size = 20,
}: {
  name:
    | 'plane'
    | 'search'
    | 'arrow'
    | 'check'
    | 'shield'
    | 'bag'
    | 'clock'
    | 'globe'
    | 'logout'
    | 'chevron'
    | 'sliders'
    | 'ticket';
  size?: number;
}) {
  const paths = {
    plane: 'M22 2 9 15m13-13-8 20-5-7-7-5L22 2Z',
    search: 'm21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    check: 'm5 12 4 4L19 6',
    shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
    bag: 'M5 7h14v14H5V7Zm4 0V3h6v4M9 11v6m6-6v6',
    clock: 'M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    globe: 'M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Zm9 9a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    logout: 'M9 4H3v16h6m-1-8h13m-5-5 5 5-5 5',
    chevron: 'm6 9 6 6 6-6',
    sliders: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
    ticket: 'M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Zm12 1v3m0 3v2m0 3v1',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="FlightPilot home">
      <span className="brand-symbol">
        <Icon name="plane" size={23} />
      </span>
      <span>
        Flight<span className="brand-light">Pilot</span>
      </span>
    </a>
  );
}
export function ModeNotice({ mode }: { mode: string }) {
  return (
    <div className="mode-notice">
      <Icon name="shield" size={17} />
      <span>
        <strong>{mode === 'simulation' ? 'Simulation environment' : 'Provider test environment'}.</strong>{' '}
        {mode === 'simulation' ? 'Fictional fares and bookings.' : 'Test fares and bookings only.'} No real
        tickets or payments. Use fictional traveller details.
      </span>
      <span className="mode-tag">PRODUCTION DISABLED</span>
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      {message}
    </div>
  );
}
export function OfferRoute({ offer }: { offer: SafeOffer }) {
  return (
    <div className="routes">
      {offer.slices.map((slice, index) => {
        const first = slice.segments[0];
        const last = slice.segments[slice.segments.length - 1];
        if (!first || !last) return null;
        return (
          <div className="route-row" key={index}>
            <div className="route-end">
              <strong>{localTime(first.departure, first.originTimezone)}</strong>
              <span>{first.origin}</span>
              <small>{localDate(first.departure, first.originTimezone)}</small>
            </div>
            <div className="route-middle">
              <small>{duration(slice.durationMinutes)}</small>
              <div className="route-line">
                <span />
                <Icon name="plane" size={15} />
              </div>
              <small>
                {slice.segments.length === 1
                  ? 'Nonstop'
                  : `${slice.segments.length - 1} stop${slice.segments.length > 2 ? 's' : ''} · ${slice.segments
                      .slice(0, -1)
                      .map((s) => s.destination)
                      .join(', ')}`}
              </small>
            </div>
            <div className="route-end arrival">
              <strong>{localTime(last.arrival, last.destinationTimezone)}</strong>
              <span>{last.destination}</span>
              <small>{localDate(last.arrival, last.destinationTimezone)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function FareDisclosure({ offer }: { offer: SafeOffer }) {
  return (
    <div className="fare-disclosure">
      <div className="fact-grid">
        <div>
          <span>Base fare</span>
          <strong>{offer.base ? money(offer.base) : 'Not itemized'}</strong>
        </div>
        <div>
          <span>Taxes & supplier fees</span>
          <strong>{offer.tax ? money(offer.tax) : 'Not itemized'}</strong>
        </div>
        <div>
          <span>Checked bags / traveller</span>
          <strong>
            {offer.checkedBagsPerPassenger === null ? 'Not specified' : offer.checkedBagsPerPassenger}
          </strong>
        </div>
        <div>
          <span>Cabin bags / traveller</span>
          <strong>
            {offer.cabinBagsPerPassenger === null ? 'Not specified' : offer.cabinBagsPerPassenger}
          </strong>
        </div>
        <div>
          <span>Additional baggage cost</span>
          <strong>{offer.baggageExtra ? money(offer.baggageExtra) : 'Unknown / not quoted'}</strong>
        </div>
        <div>
          <span>Fare expires</span>
          <strong>{new Date(offer.expiresAt).toLocaleString('en-GB')}</strong>
        </div>
      </div>
      <p>{offer.rules.description}</p>
      <p className="fineprint">
        Refundable: {offer.rules.refundable === null ? 'unknown' : offer.rules.refundable ? 'yes' : 'no'} ·
        Changes:{' '}
        {offer.rules.changeable === null ? 'unknown' : offer.rules.changeable ? 'allowed' : 'not allowed'}.
        Cancellation penalty:{' '}
        {offer.rules.cancellationPenalty ? money(offer.rules.cancellationPenalty) : 'not specified'}. Change
        penalty: {offer.rules.changePenalty ? money(offer.rules.changePenalty) : 'not specified'}.
      </p>
      {offer.slices.flatMap((s, i) =>
        s.segments.map((segment, j) => (
          <p className="segment-detail" key={`${i}-${j}`}>
            {segment.marketingCarrierName ?? segment.marketingCarrier} {segment.flightNumber} ·{' '}
            {segment.origin} → {segment.destination} · Operated by{' '}
            {segment.operatingCarrierName ?? segment.operatingCarrier}
            <br />
            <small>
              {segment.originTimezone} → {segment.destinationTimezone}
            </small>
          </p>
        )),
      )}
      {(offer.selfTransfer || offer.airportChange) && (
        <p className="warning-text">
          {offer.selfTransfer ? 'Separate-ticket self-transfer. ' : ''}
          {offer.airportChange ? 'Airport change required.' : ''}
        </p>
      )}
      {offer.warnings.map((warning, index) => (
        <p className="warning-text" key={index}>
          {warning}
        </p>
      ))}
    </div>
  );
}
export function BookingCard({
  booking,
  onRefresh,
  busy,
}: {
  booking: BookingStatus;
  onRefresh?: () => void;
  busy?: boolean;
}) {
  return (
    <article className="booking-card">
      <div className="booking-card-head">
        <span className={`status-tag status-${booking.status}`}>{booking.status}</span>
        <small>
          {booking.environment} · {booking.provider}
        </small>
      </div>
      <h3>{booking.reference ? `Reference ${booking.reference}` : 'Reference not assigned'}</h3>
      <p className="booking-total">{money(booking.total)}</p>
      <p className="fineprint">
        {booking.ticketNumbers.length
          ? `Ticket number${booking.ticketNumbers.length > 1 ? 's' : ''}: ${booking.ticketNumbers.join(', ')}`
          : 'No ticket number issued. A booking reference alone is not an e-ticket.'}
      </p>
      {booking.environment === 'simulation' && (
        <p className="fineprint">Simulation reference and ticket numbers are fictional.</p>
      )}
      {booking.recovery && <p className="warning-text">{booking.recovery}</p>}
      <div className="booking-card-foot">
        <small>Updated {new Date(booking.updatedAt).toLocaleString('en-GB')}</small>
        {onRefresh && (
          <button className="button button-quiet" type="button" onClick={onRefresh} disabled={busy}>
            {busy ? 'Checking…' : 'Refresh status'}
          </button>
        )}
      </div>
    </article>
  );
}
