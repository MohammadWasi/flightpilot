'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import type { BookingStatus, Checkout, Passenger } from '@flightpilot/shared';
import {
  ApiError,
  api,
  tool,
  Brand,
  BookingCard,
  ErrorNotice,
  FareDisclosure,
  Icon,
  ModeNotice,
  OfferRoute,
  money,
  type SafeOffer,
} from '../../../components/ui';

type SafeCheckout = Omit<Checkout, 'userId' | 'offer'> & { offer: SafeOffer };
type CheckoutResponse = { checkout: SafeCheckout; offer: SafeOffer };
function initialPassengers(offer: SafeOffer): Passenger[] {
  const simulation = offer.environment === 'simulation';
  const departure = offer.slices[0]?.segments[0]?.departure.slice(0, 10) ?? '2030-01-01';
  return offer.passengers.map((passenger, index) => {
    const bornOn = `${Number(departure.slice(0, 4)) - (passenger.age ?? (passenger.type === 'adult' ? 30 : 1))}${departure.slice(4)}`;
    return {
      id: passenger.id,
      givenName: simulation ? 'Fictional' : '',
      familyName: simulation ? `Traveller${index + 1}` : '',
      bornOn: simulation
        ? bornOn > new Date().toISOString().slice(0, 10)
          ? new Date().toISOString().slice(0, 10)
          : bornOn
        : '',
      gender: 'm',
      title: 'mr',
      email: simulation ? 'traveller@example.invalid' : '',
      phone: simulation ? '+12025550101' : '',
    };
  });
}
export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<CheckoutResponse | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [booking, setBooking] = useState<BookingStatus | null>(null);
  const [consent, setConsent] = useState(false);
  const [outcome, setOutcome] = useState<'success' | 'decline' | 'timeout' | 'pending'>('success');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [token, setToken] = useState('');

  async function load() {
    const result = await api<CheckoutResponse>(`/api/checkout/${encodeURIComponent(params.id)}`);
    setData(result);
    setPassengers((current) =>
      result.checkout.state !== 'review' ? [] : current.length ? current : initialPassengers(result.offer),
    );
    setNeedsLogin(false);
    if (result.checkout.bookingId) {
      const response = await tool<BookingStatus | { booking: BookingStatus }>('get_booking_status', {
        bookingId: result.checkout.bookingId,
      });
      setBooking('booking' in response ? response.booking : response);
      setData(await api<CheckoutResponse>(`/api/checkout/${encodeURIComponent(params.id)}`));
    }
    return result;
  }
  useEffect(() => {
    load()
      .catch((e) => {
        if (e instanceof ApiError && (e.code === 'UNAUTHENTICATED' || e.code === '401')) setNeedsLogin(true);
        else setError(e instanceof Error ? e.message : 'Unable to load this checkout.');
      })
      .finally(() => setBusy(false));
    // The route id identifies one checkout session. Identity is held in component memory only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/login', { token });
      setToken('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }
  function updatePassenger<K extends keyof Passenger>(index: number, key: K, value: Passenger[K]) {
    setPassengers((previous) =>
      previous.map((passenger, i) => (i === index ? { ...passenger, [key]: value } : passenger)),
    );
    setConsent(false);
  }
  async function approve(event: FormEvent) {
    event.preventDefault();
    if (!data || !consent || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ checkout: SafeCheckout; booking?: BookingStatus }>(
        `/api/checkout/${encodeURIComponent(params.id)}/approve`,
        {
          version: data.checkout.version,
          approvedTotal: data.checkout.total,
          passengers,
          consent: true,
          ...(data.offer.environment === 'simulation' ? { simulationOutcome: outcome } : {}),
        },
      );
      setData((previous) => (previous ? { ...previous, checkout: result.checkout } : previous));
      if (result.booking) setBooking(result.booking);
      setConsent(false);
      if (result.checkout.state !== 'review') setPassengers([]);
    } catch (e) {
      setConsent(false);
      if (e instanceof ApiError && e.code === 'PRICE_CHANGED') {
        try {
          await load();
          setError(
            'The fare changed. Review the refreshed total below and give your approval again. No booking was made.',
          );
        } catch (refreshError) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : 'Please refresh to review the latest fare.',
          );
        }
      } else {
        setError(
          e instanceof Error
            ? e.message
            : 'The request could not be completed. Refresh the status before taking another action.',
        );
        try {
          await load();
        } catch {
          /* Preserve the actionable original error. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError('');
    setConsent(false);
    try {
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to refresh.');
    } finally {
      setBusy(false);
    }
  }

  const mode = data?.offer.environment ?? 'simulation';
  const state = data?.checkout.state;
  const expired = data ? Date.parse(data.checkout.expiresAt) <= Date.now() : false;
  const review = state === 'review';
  const completed = state === 'ticketed' || state === 'confirmed';
  return (
    <div className="checkout-page">
      <header className="checkout-header">
        <Brand />
        <a className="back-link" href="/">
          ← Back to workspace
        </a>
        <span className="secure-indicator">
          <Icon name="shield" size={17} /> Private checkout
        </span>
      </header>
      <ModeNotice mode={mode} />
      <main className="checkout-main">
        <div className="checkout-intro">
          <span className="eyebrow">A MOMENT TO MAKE SURE</span>
          <h1>
            {completed
              ? mode === 'simulation'
                ? 'Your simulated journey.'
                : 'Your test booking.'
              : 'Review your journey.'}
          </h1>
          <p>
            {completed
              ? 'Your booking and ticketing status are shown below.'
              : 'The details, the total, and the final decision — all yours.'}
          </p>
        </div>
        {error && <ErrorNotice message={error} />}
        {busy && !data && <p role="status">Loading your private checkout…</p>}
        {needsLogin && (
          <section className="checkout-login">
            <h2>Sign in to review this flight</h2>
            <p>Use the access token for the workspace that created this checkout.</p>
            <form onSubmit={signIn}>
              <label htmlFor="checkout-token">Workspace access token</label>
              <input
                id="checkout-token"
                type="password"
                autoComplete="off"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button className="button button-primary" disabled={busy}>
                Open checkout <Icon name="arrow" size={17} />
              </button>
            </form>
          </section>
        )}
        {data && (
          <div className="checkout-grid">
            <div className="checkout-content">
              <section className="checkout-section">
                <div className="section-number-title">
                  <span>01</span>
                  <h2>Your flight</h2>
                </div>
                <div className="checkout-airline">
                  <span className="airline-monogram">
                    {data.offer.slices[0]?.segments[0]?.marketingCarrier}
                  </span>
                  <div>
                    <strong>{data.offer.provider}</strong>
                    <small>
                      {data.offer.environment} · {data.offer.passengers.length} traveller
                      {data.offer.passengers.length === 1 ? '' : 's'}
                    </small>
                  </div>
                </div>
                <OfferRoute offer={data.offer} />
                <details className="checkout-fare-details">
                  <summary>
                    Included baggage, fare rules & flight details <Icon name="chevron" size={15} />
                  </summary>
                  <FareDisclosure offer={data.offer} />
                </details>
              </section>
              {review ? (
                <form id="approval-form" onSubmit={approve}>
                  <section className="checkout-section">
                    <div className="section-number-title">
                      <span>02</span>
                      <h2>Traveller details</h2>
                    </div>
                    <div className="privacy-note">
                      <Icon name="shield" size={18} />
                      <p>
                        {mode === 'simulation'
                          ? 'Fictional travellers are filled in for this simulation. Use fictional information only.'
                          : 'This is a provider test environment. Use fictional traveller information only.'}{' '}
                        Identity is submitted directly to the authenticated backend, outside the AI
                        conversation.
                      </p>
                    </div>
                    {passengers.map((passenger, index) => (
                      <fieldset className="traveller-card" key={passenger.id}>
                        <legend>
                          Traveller {index + 1}{' '}
                          <span>{data.offer.passengers[index]?.type.replaceAll('_', ' ')}</span>
                        </legend>
                        <div className="identity-grid">
                          <div>
                            <label htmlFor={`given-${index}`}>Given name</label>
                            <input
                              id={`given-${index}`}
                              autoComplete="off"
                              value={passenger.givenName}
                              onChange={(e) => updatePassenger(index, 'givenName', e.target.value)}
                              required
                              maxLength={80}
                            />
                          </div>
                          <div>
                            <label htmlFor={`family-${index}`}>Family name</label>
                            <input
                              id={`family-${index}`}
                              autoComplete="off"
                              value={passenger.familyName}
                              onChange={(e) => updatePassenger(index, 'familyName', e.target.value)}
                              required
                              maxLength={80}
                            />
                          </div>
                          <div>
                            <label htmlFor={`born-${index}`}>Date of birth</label>
                            <input
                              id={`born-${index}`}
                              type="date"
                              max={new Date().toISOString().slice(0, 10)}
                              value={passenger.bornOn}
                              onChange={(e) => updatePassenger(index, 'bornOn', e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor={`title-${index}`}>Title</label>
                            <select
                              id={`title-${index}`}
                              value={passenger.title}
                              onChange={(e) =>
                                updatePassenger(index, 'title', e.target.value as Passenger['title'])
                              }
                            >
                              <option value="mr">Mr</option>
                              <option value="ms">Ms</option>
                              <option value="mrs">Mrs</option>
                              <option value="miss">Miss</option>
                              <option value="dr">Dr</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`gender-${index}`}>Gender required by airline</label>
                            <select
                              id={`gender-${index}`}
                              value={passenger.gender}
                              onChange={(e) =>
                                updatePassenger(index, 'gender', e.target.value as Passenger['gender'])
                              }
                            >
                              <option value="m">Male</option>
                              <option value="f">Female</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`email-${index}`}>Contact email</label>
                            <input
                              id={`email-${index}`}
                              type="email"
                              autoComplete="off"
                              value={passenger.email}
                              onChange={(e) => updatePassenger(index, 'email', e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor={`phone-${index}`}>Phone with country code</label>
                            <input
                              id={`phone-${index}`}
                              type="tel"
                              autoComplete="off"
                              pattern="\+[1-9][0-9]{7,14}"
                              value={passenger.phone}
                              onChange={(e) => updatePassenger(index, 'phone', e.target.value)}
                              placeholder="+12025550101"
                              required
                            />
                          </div>
                        </div>
                      </fieldset>
                    ))}
                    <p className="fineprint">
                      Check each traveller’s age on departure. Verify visa and entry requirements
                      independently using official sources before any future real travel.
                    </p>
                  </section>
                  <section className="checkout-section approval-section">
                    <div className="section-number-title">
                      <span>03</span>
                      <h2>Your explicit approval</h2>
                    </div>
                    <p>
                      No real payment is collected.{' '}
                      {mode === 'simulation'
                        ? 'This creates a fictional booking to exercise the complete workflow.'
                        : 'This submits an order to the provider test environment.'}
                    </p>
                    {mode === 'simulation' && (
                      <details className="simulation-control">
                        <summary>
                          Simulation scenario <Icon name="chevron" size={15} />
                        </summary>
                        <label htmlFor="simulation-outcome">Test outcome</label>
                        <select
                          id="simulation-outcome"
                          value={outcome}
                          onChange={(e) => {
                            setOutcome(e.target.value as typeof outcome);
                            setConsent(false);
                          }}
                        >
                          <option value="success">Successful ticketing</option>
                          <option value="decline">Payment declined</option>
                          <option value="timeout">Uncertain timeout</option>
                          <option value="pending">Ticketing pending</option>
                        </select>
                        <small>These outcomes are fictional test cases. No payment service is called.</small>
                      </details>
                    )}
                    <label className="consent-label">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        required
                        disabled={busy || expired}
                      />
                      <span>
                        I have reviewed the itinerary, traveller details and fare conditions. I explicitly
                        approve this {mode === 'simulation' ? 'simulated' : 'test'} booking for{' '}
                        <strong>{money(data.checkout.total)}</strong>. I understand no real ticket will be
                        issued.
                      </span>
                    </label>
                    <p className="fineprint">
                      We recheck the fare before proceeding. A changed total requires your renewed approval.
                    </p>
                  </section>
                </form>
              ) : (
                <section className="checkout-section checkout-status">
                  <span className={`status-symbol ${completed ? 'complete' : ''}`}>
                    <Icon name={completed ? 'check' : 'clock'} size={28} />
                  </span>
                  <span className="eyebrow">{mode.toUpperCase()} BOOKING STATUS</span>
                  <h2>
                    {state === 'ticketed'
                      ? 'Ticketing verified in this environment'
                      : state === 'confirmed'
                        ? 'Booking confirmed; ticketing not verified'
                        : state === 'pending'
                          ? 'Waiting for ticketing'
                          : state === 'cancelled'
                            ? 'Booking cancelled'
                            : state === 'reserved'
                              ? 'Reserved; ticketing not verified'
                              : state === 'unknown'
                                ? 'Provider status needs verification'
                                : state === 'uncertain'
                                  ? 'The booking result is uncertain'
                                  : state === 'failed'
                                    ? 'This attempt did not complete'
                                    : 'Your booking is being processed'}
                  </h2>
                  <p>
                    {data.checkout.recovery ??
                      (state === 'uncertain'
                        ? 'Do not start another booking. Reconcile this attempt with the provider before retrying.'
                        : state === 'pending'
                          ? 'A booking reference does not guarantee ticket issuance. Refresh the provider status before making other arrangements.'
                          : state === 'failed'
                            ? 'This checkout cannot be retried. Review the failure details before starting a new selection.'
                            : completed
                              ? 'The status is limited to this test environment. No real travel entitlement has been created.'
                              : 'Wait for the provider result. Do not submit another booking.')}
                  </p>
                  <button className="button button-secondary" type="button" onClick={refresh} disabled={busy}>
                    {busy ? 'Checking…' : 'Refresh booking status'}
                  </button>
                </section>
              )}
              {booking && <BookingCard booking={booking} onRefresh={refresh} busy={busy} />}
            </div>
            <aside className="checkout-summary">
              <span className="eyebrow">YOUR JOURNEY AT A GLANCE</span>
              <h2>Fare summary</h2>
              <div className="summary-line">
                <span>
                  {data.offer.passengers.length} traveller{data.offer.passengers.length === 1 ? '' : 's'}
                </span>
                <span>{data.offer.slices.length > 1 ? 'Round trip / multi-city' : 'One way'}</span>
              </div>
              <div className="summary-line">
                <span>Base fare</span>
                <strong>{data.offer.base ? money(data.offer.base) : 'Not itemized'}</strong>
              </div>
              <div className="summary-line">
                <span>Taxes & supplier fees</span>
                <strong>{data.offer.tax ? money(data.offer.tax) : 'Not itemized'}</strong>
              </div>
              <div className="summary-total">
                <span>Total for all travellers</span>
                <strong data-testid="checkout-total">{money(data.checkout.total)}</strong>
                <small>
                  {mode === 'simulation'
                    ? 'Fictional total · no money charged'
                    : 'Test total · no real money charged'}
                </small>
              </div>
              <p className="fineprint">
                Includes quoted provider taxes and fees. Unquoted baggage or payment charges are not assumed.
                See fare details.
              </p>
              {review && (
                <>
                  {expired ? (
                    <ErrorNotice message="This checkout has expired. Return to search for a current offer." />
                  ) : (
                    <p className="expiry-text">
                      <Icon name="clock" size={14} /> Review by{' '}
                      {new Date(data.checkout.expiresAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  <button
                    className="button button-primary full-width approve-button"
                    type="submit"
                    form="approval-form"
                    disabled={!consent || busy || expired}
                  >
                    {busy
                      ? 'Verifying & processing…'
                      : mode === 'simulation'
                        ? 'Approve simulated booking'
                        : 'Approve test booking'}
                    <Icon name="arrow" size={17} />
                  </button>
                </>
              )}
              <div className="secure-note">
                <Icon name="shield" size={18} />
                <span>
                  No card data. No real purchase.
                  <br />
                  Your approval is required.
                </span>
              </div>
              <span className="checkout-id">Session {data.checkout.id}</span>
            </aside>
          </div>
        )}
        <footer className="checkout-footer">
          <Icon name="shield" size={15} />
          <span>Private traveller form · Explicit approval · Verified provider status</span>
        </footer>
      </main>
    </div>
  );
}
