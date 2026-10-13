'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { BookingStatus, Comparison, FlightSearchInput, PricedOffer } from '@flightpilot/shared';
import {
  api,
  tool,
  ApiError,
  Brand,
  BookingCard,
  ErrorNotice,
  FareDisclosure,
  Icon,
  ModeNotice,
  OfferRoute,
  money,
  type SafeOffer,
} from '../components/ui';

type Health = { mode: string; provider: string; productionBooking: boolean };
type Me = { userId: string; mode: string; provider: string };
type Results = {
  searchId: string;
  offers: SafeOffer[];
  comparison: Comparison;
  providers: string[];
  notice: string;
};
type Preferences = {
  currency: FlightSearchInput['currency'];
  cabin: FlightSearchInput['cabin'];
  maxStops: number;
  checkedBags: number;
  maxLayoverMinutes: number;
  avoidOvernight: boolean;
  preferredAirlines: string;
  avoidedAirlines: string;
};
const defaultPreferences: Preferences = {
  currency: 'INR',
  cabin: 'economy',
  maxStops: 1,
  checkedBags: 1,
  maxLayoverMinutes: 240,
  avoidOvernight: true,
  preferredAirlines: '',
  avoidedAirlines: '',
};
const preferenceKey = 'flightpilot.preferences.v1';
const later = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.';
const airlineCodes = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
function agesFrom(text: string, label: string) {
  if (!text.trim()) return [];
  const values = text.split(',').map((value) => value.trim());
  if (values.some((value) => !/^\d+$/.test(value)))
    throw new Error(`Enter each ${label} age as a whole number, separated by commas.`);
  return values.map(Number);
}

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [token, setToken] = useState('');
  const [tab, setTab] = useState<'search' | 'bookings' | 'preferences'>('search');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [roundTrip, setRoundTrip] = useState(false);
  const [origin, setOrigin] = useState('Pune');
  const [destination, setDestination] = useState('Delhi');
  const [depart, setDepart] = useState(later(30));
  const [returnDate, setReturnDate] = useState(later(37));
  const [adults, setAdults] = useState(1);
  const [childAges, setChildAges] = useState('');
  const [infantAges, setInfantAges] = useState('');
  const [infantsWithSeat, setInfantsWithSeat] = useState(false);
  const [budget, setBudget] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [bookings, setBookings] = useState<BookingStatus[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    Promise.allSettled([api<Health>('/api/health'), api<Me>('/api/me')]).then(([healthResult, meResult]) => {
      if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
      else setError(errorText(healthResult.reason));
      if (meResult.status === 'fulfilled') setMe(meResult.value);
      setInitializing(false);
    });
    try {
      const raw = localStorage.getItem(preferenceKey);
      if (raw) {
        const value = JSON.parse(raw) as Partial<Preferences>;
        setPreferences({ ...defaultPreferences, ...value });
      }
    } catch {
      /* Browser storage may be disabled. Defaults are sufficient. */
    }
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy('login');
    setError('');
    try {
      await api('/api/login', { token });
      setToken('');
      setMe(await api<Me>('/api/me'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  async function signOut() {
    setBusy('logout');
    setError('');
    try {
      await api('/api/logout', {});
      setMe(null);
      setResults(null);
      setBookings([]);
      setHistoryLoaded(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy('search');
    setError('');
    setResults(null);
    try {
      const ages = agesFrom(childAges, 'child');
      const infantAgeList = agesFrom(infantAges, 'infant');
      if (infantAgeList.some((a) => !Number.isInteger(a) || a < 0 || a > 1))
        throw new Error('Enter each infant’s age as 0 or 1, separated by commas.');
      if (ages.some((a) => !Number.isInteger(a) || a < 2 || a > 17))
        throw new Error('Enter each child’s age from 2 to 17, separated by commas.');
      const input: FlightSearchInput = {
        slices: [
          { origin, destination, departureDate: depart },
          ...(roundTrip ? [{ origin: destination, destination: origin, departureDate: returnDate }] : []),
        ],
        adults,
        childAges: ages,
        infantAges: infantAgeList,
        infantsWithSeat,
        currency: preferences.currency,
        cabin: preferences.cabin,
        maxStops: preferences.maxStops,
        checkedBags: preferences.checkedBags,
        maxLayoverMinutes: preferences.maxLayoverMinutes,
        avoidOvernight: preferences.avoidOvernight,
        flexibleDays: 0,
        preferredAirlines: airlineCodes(preferences.preferredAirlines),
        avoidedAirlines: airlineCodes(preferences.avoidedAirlines),
        ...(budget ? { budget: { amount: budget, currency: preferences.currency } } : {}),
      };
      setResults(await tool<Results>('search_flights', input));
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') setMe(null);
    } finally {
      setBusy('');
    }
  }
  async function selectOffer(offer: SafeOffer) {
    setBusy(offer.id);
    setError('');
    try {
      await tool<PricedOffer>('revalidate_offer', { offerId: offer.id });
      const checkout = await tool<{ checkoutId: string; url: string }>('prepare_checkout', {
        offerId: offer.id,
      });
      window.location.assign(`/checkout/${encodeURIComponent(checkout.checkoutId)}`);
    } catch (e) {
      setError(errorText(e));
      setBusy('');
    }
  }
  async function loadBookings() {
    setTab('bookings');
    setBusy('bookings');
    setError('');
    try {
      setBookings((await tool<{ bookings: BookingStatus[] }>('list_my_bookings', {})).bookings);
      setHistoryLoaded(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  async function refreshBooking(bookingId: string) {
    setBusy(bookingId);
    setError('');
    try {
      const response = await tool<BookingStatus | { booking: BookingStatus }>('get_booking_status', {
        bookingId,
      });
      const booking = 'booking' in response ? response.booking : response;
      setBookings((previous) => previous.map((b) => (b.id === bookingId ? booking : b)));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }

  const mode = me?.mode ?? health?.mode ?? 'simulation';
  const provider = me?.provider ?? health?.provider ?? 'Connecting';
  if (initializing)
    return (
      <div className="loading-page">
        <Brand />
        <p role="status">Connecting to your travel workspace…</p>
      </div>
    );
  if (!me)
    return (
      <div className="onboarding">
        <header className="onboarding-header">
          <Brand />
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
        </header>
        <main className="welcome-grid">
          <section className="welcome-copy">
            <span className="eyebrow">
              <span className="tiny-line" /> A CLEARER WAY TO FLY
            </span>
            <h1>
              Good journeys
              <br />
              start with
              <br />
              <em>better choices.</em>
            </h1>
            <p>
              Meet your thoughtful flight companion. Compare the details, understand the trade-offs, and book
              with confidence.
            </p>
            <div className="welcome-points">
              <span>
                <Icon name="check" size={17} /> Transparent fare comparisons
              </span>
              <span>
                <Icon name="check" size={17} /> Your approval, every time
              </span>
              <span>
                <Icon name="check" size={17} /> Works with Codex & Claude
              </span>
            </div>
            <div className="decorative-route" aria-hidden="true">
              <span>PNQ</span>
              <span className="dotted-route" />
              <Icon name="plane" size={27} />
              <span className="dotted-route" />
              <span>DEL</span>
            </div>
          </section>
          <section className="login-card">
            <span className="step-label">01 / CONNECT YOUR WORKSPACE</span>
            <h2>Welcome aboard.</h2>
            <p className="muted">Sign in with the access token from your FlightPilot setup.</p>
            {error && <ErrorNotice message={error} />}
            <form onSubmit={signIn}>
              <label htmlFor="access-token">Workspace access token</label>
              <input
                id="access-token"
                name="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                placeholder="Paste your access token"
                required
              />
              <button className="button button-primary full-width" disabled={!!busy}>
                {busy ? 'Connecting…' : 'Open my workspace'}
                <Icon name="arrow" size={18} />
              </button>
            </form>
            <div className="setup-note">
              <Icon name="shield" />
              <p>
                Use <code>FLIGHTPILOT_API_TOKEN</code> from your local, ignored <code>.env</code> file. Keep
                it outside AI conversations.
              </p>
            </div>
            <div className="connection-card">
              <span className="connection-dot" />
              <div>
                <strong>{provider}</strong>
                <small>
                  {mode === 'simulation'
                    ? 'Simulation connected · fictional data'
                    : 'Provider test environment'}
                </small>
              </div>
            </div>
            <p className="fineprint">
              Production purchases are disabled. This workspace cannot charge money or issue real tickets.
            </p>
          </section>
        </main>
        <footer className="onboarding-footer">
          <span>Less second-guessing. More going.</span>
          <span>Built around your journey.</span>
        </footer>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={tab === 'search' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('search');
              setError('');
            }}
          >
            <Icon name="search" /> Find a flight
          </button>
          <button className={tab === 'bookings' ? 'nav-item active' : 'nav-item'} onClick={loadBookings}>
            <Icon name="ticket" /> My bookings
          </button>
          <button
            className={tab === 'preferences' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('preferences');
              setError('');
            }}
          >
            <Icon name="sliders" /> Preferences
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-note">
            <span className="agent-icon">✳</span>
            <h3>Your AI. Your copilot.</h3>
            <p>Ask Codex or Claude for your next flight. Review the details here.</p>
            <code>pnpm setup:agents</code>
          </div>
          <div className="provider-status">
            <span className="connection-dot" />
            <div>
              <strong>{provider}</strong>
              <small>{mode} environment</small>
            </div>
          </div>
          <button className="nav-item signout" onClick={signOut} disabled={!!busy}>
            <Icon name="logout" size={17} /> Sign out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>Thoughtful travel, every step.</span>
          <div className="topbar-right">
            <Icon name="globe" size={16} />
            <span>{preferences.currency}</span>
            <span className="avatar">FP</span>
          </div>
        </header>
        <ModeNotice mode={mode} />
        <main className="workspace-main">
          {error && <ErrorNotice message={error} />}
          {tab === 'search' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LET’S FIND YOUR WAY</span>
                  <h1>Where to next?</h1>
                  <p>A good fare is just the beginning. Find the journey that fits.</p>
                </div>
                <span className="heading-mark" aria-hidden="true">
                  <Icon name="plane" size={42} />
                </span>
              </div>
              <section className="search-panel" aria-label="Flight search">
                <form onSubmit={search}>
                  <div className="search-panel-top">
                    <div className="segmented-control" role="group" aria-label="Journey type">
                      <button
                        type="button"
                        aria-pressed={!roundTrip}
                        className={!roundTrip ? 'selected' : ''}
                        onClick={() => setRoundTrip(false)}
                      >
                        One way
                      </button>
                      <button
                        type="button"
                        aria-pressed={roundTrip}
                        className={roundTrip ? 'selected' : ''}
                        onClick={() => setRoundTrip(true)}
                      >
                        Round trip
                      </button>
                    </div>
                    <span className="search-hint">
                      <Icon name="shield" size={15} /> Clear choices. No hidden assumptions.
                    </span>
                  </div>
                  <div className={`journey-fields ${roundTrip ? 'round-trip' : ''}`}>
                    <div className="field">
                      <label htmlFor="origin">From</label>
                      <input
                        id="origin"
                        required
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        placeholder="City or airport"
                        maxLength={80}
                      />
                      <small>City or airport code</small>
                    </div>
                    <button
                      className="swap-button"
                      type="button"
                      aria-label="Swap origin and destination"
                      onClick={() => {
                        setOrigin(destination);
                        setDestination(origin);
                      }}
                    >
                      ⇄
                    </button>
                    <div className="field">
                      <label htmlFor="destination">To</label>
                      <input
                        id="destination"
                        required
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="City or airport"
                        maxLength={80}
                      />
                      <small>City or airport code</small>
                    </div>
                    <div className="field">
                      <label htmlFor="depart">Departure</label>
                      <input
                        id="depart"
                        type="date"
                        required
                        min={later(0)}
                        value={depart}
                        onChange={(e) => setDepart(e.target.value)}
                      />
                      <small>Local departure date</small>
                    </div>
                    {roundTrip && (
                      <div className="field">
                        <label htmlFor="return">Return</label>
                        <input
                          id="return"
                          type="date"
                          required
                          min={depart}
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                        />
                        <small>Local return date</small>
                      </div>
                    )}
                  </div>
                  <div className="traveller-fields">
                    <div>
                      <label htmlFor="adults">Adults</label>
                      <input
                        id="adults"
                        type="number"
                        min={1}
                        max={9}
                        value={adults}
                        onChange={(e) => setAdults(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="children">Child ages</label>
                      <input
                        id="children"
                        value={childAges}
                        onChange={(e) => setChildAges(e.target.value)}
                        placeholder="e.g. 3, 8"
                        aria-describedby="child-help"
                      />
                      <small id="child-help">Age on departure, 2–17</small>
                    </div>
                    <div>
                      <label htmlFor="infants">Infant ages</label>
                      <input
                        id="infants"
                        value={infantAges}
                        onChange={(e) => setInfantAges(e.target.value)}
                        placeholder="e.g. 0, 1"
                        aria-describedby="infant-help"
                      />
                      <small id="infant-help">Age on departure, under 2</small>
                    </div>
                    <div>
                      <label htmlFor="cabin">Cabin</label>
                      <select
                        id="cabin"
                        value={preferences.cabin}
                        onChange={(e) => updatePreference('cabin', e.target.value as Preferences['cabin'])}
                      >
                        <option value="economy">Economy</option>
                        <option value="premium_economy">Premium economy</option>
                        <option value="business">Business</option>
                        <option value="first">First</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="checked-bags">Checked bags / person</label>
                      <select
                        id="checked-bags"
                        value={preferences.checkedBags}
                        onChange={(e) => updatePreference('checkedBags', Number(e.target.value))}
                      >
                        {[0, 1, 2, 3].map((n) => (
                          <option key={n} value={n}>
                            {n === 0 ? 'No bag needed' : `${n} bag${n > 1 ? 's' : ''}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {infantAges.trim() && (
                    <label className="checkbox-label infant-option">
                      <input
                        type="checkbox"
                        checked={infantsWithSeat}
                        onChange={(e) => setInfantsWithSeat(e.target.checked)}
                      />{' '}
                      Separate seat for infants (where provider supports it)
                    </label>
                  )}
                  <details className="search-options">
                    <summary>
                      Stops, budget & connection preferences <Icon name="chevron" size={16} />
                    </summary>
                    <div className="advanced-fields">
                      <div>
                        <label htmlFor="max-stops">Maximum stops</label>
                        <select
                          id="max-stops"
                          value={preferences.maxStops}
                          onChange={(e) => updatePreference('maxStops', Number(e.target.value))}
                        >
                          <option value={0}>Nonstop only</option>
                          <option value={1}>Up to 1 stop</option>
                          <option value={2}>Up to 2 stops</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="budget">Total budget ({preferences.currency})</label>
                        <input
                          id="budget"
                          inputMode="decimal"
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                          placeholder="No limit"
                          pattern="[0-9]+(\.[0-9]{1,3})?"
                        />
                      </div>
                      <div>
                        <label htmlFor="layover">Maximum layover</label>
                        <select
                          id="layover"
                          value={preferences.maxLayoverMinutes}
                          onChange={(e) => updatePreference('maxLayoverMinutes', Number(e.target.value))}
                        >
                          <option value={120}>2 hours</option>
                          <option value={240}>4 hours</option>
                          <option value={360}>6 hours</option>
                          <option value={720}>12 hours</option>
                        </select>
                      </div>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={preferences.avoidOvernight}
                          onChange={(e) => updatePreference('avoidOvernight', e.target.checked)}
                        />{' '}
                        Avoid overnight connections
                      </label>
                    </div>
                  </details>
                  <div className="search-action">
                    <span>
                      <Icon name="bag" size={16} /> Totals for all travellers, including known taxes.
                    </span>
                    <button className="button button-primary" type="submit" disabled={!!busy}>
                      <Icon name="search" size={18} />
                      {busy === 'search' ? 'Finding your flights…' : 'Find flights'}
                    </button>
                  </div>
                </form>
              </section>
              {results ? (
                <section className="results-section" aria-label="Flight results" aria-live="polite">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">YOUR OPTIONS, EXPLAINED</span>
                      <h2>
                        {results.offers.length
                          ? `${results.offers.length} ways to get there`
                          : 'No flights matched this search'}
                      </h2>
                    </div>
                    <span className="subtle-pill">Searched: {results.providers.join(', ')}</span>
                  </div>
                  <p className="result-notice">{results.notice}</p>
                  {results.comparison.warnings.map((warning, i) => (
                    <p className="warning-text" key={i}>
                      {warning}
                    </p>
                  ))}
                  {!results.offers.length && (
                    <div className="empty-state">
                      <Icon name="search" size={30} />
                      <h3>Give your journey a little room.</h3>
                      <p>Try another date, allow a connection, or reduce baggage requirements.</p>
                    </div>
                  )}
                  <div className="offer-list">
                    {results.offers.map((offer, index) => {
                      const recommendations = results.comparison.recommendations.filter(
                        (r) => r.offerId === offer.id,
                      );
                      const exclusion = results.comparison.excluded.find((r) => r.offerId === offer.id);
                      const top = recommendations.some((r) => r.category === 'best_value');
                      const reasons = [...new Set(recommendations.flatMap((r) => r.reasons))];
                      return (
                        <article className={`offer-card ${top ? 'best-value' : ''}`} key={offer.id}>
                          <div className="offer-main">
                            <div className="offer-top">
                              <div className="airline-label">
                                <span className="airline-monogram">
                                  {offer.slices[0]?.segments[0]?.marketingCarrier ?? 'FP'}
                                </span>
                                <div>
                                  <strong>
                                    {offer.slices[0]?.segments
                                      .map((s) => s.marketingCarrierName ?? s.marketingCarrier)
                                      .filter((s, i, all) => all.indexOf(s) === i)
                                      .join(' + ')}
                                  </strong>
                                  <small>
                                    {offer.provider} · {offer.environment}
                                  </small>
                                </div>
                              </div>
                              <div className="recommendation-tags">
                                {recommendations.map((r) => (
                                  <span className={`recommendation-tag ${r.category}`} key={r.category}>
                                    {r.category === 'best_value'
                                      ? '✦ Best value'
                                      : r.category === 'cheapest'
                                        ? 'Lowest suitable fare'
                                        : 'Fastest suitable'}
                                  </span>
                                ))}
                                {!recommendations.length && (
                                  <span className="subtle-pill">Option {index + 1}</span>
                                )}
                              </div>
                            </div>
                            <OfferRoute offer={offer} />
                            <p className="operating-carriers">
                              Operated by{' '}
                              {[
                                ...new Set(
                                  offer.slices.flatMap((slice) =>
                                    slice.segments.map(
                                      (segment) => segment.operatingCarrierName ?? segment.operatingCarrier,
                                    ),
                                  ),
                                ),
                              ].join(', ')}
                            </p>
                            <div className="offer-inclusions">
                              <span>
                                <Icon name="bag" size={15} />
                                {offer.checkedBagsPerPassenger === null
                                  ? 'Checked bags unspecified'
                                  : `${offer.checkedBagsPerPassenger} checked bag${offer.checkedBagsPerPassenger === 1 ? '' : 's'} / traveller`}
                              </span>
                              <span>
                                <Icon name="ticket" size={15} />
                                {offer.rules.refundable === null
                                  ? 'Refund terms unknown'
                                  : offer.rules.refundable
                                    ? 'Refundable fare'
                                    : 'Non-refundable'}
                              </span>
                            </div>
                          </div>
                          <div className="offer-price">
                            <small>
                              Total for {offer.passengers.length} traveller
                              {offer.passengers.length === 1 ? '' : 's'}
                            </small>
                            <strong>{money(offer.total)}</strong>
                            <span>Includes quoted taxes & fees</span>
                            <button
                              className="button button-primary"
                              onClick={() => selectOffer(offer)}
                              disabled={!!busy || !!exclusion}
                            >
                              {busy === offer.id ? 'Refreshing fare…' : 'Review flight'}
                              <Icon name="arrow" size={16} />
                            </button>
                            <small>Price checked before approval</small>
                          </div>
                          <div className="offer-explanation">
                            {reasons.length > 0 && (
                              <p>
                                <span className="why-label">WHY THIS FLIGHT</span> {reasons.join(' · ')}
                              </p>
                            )}
                            {exclusion && (
                              <p className="warning-text">
                                Outside your requirements: {exclusion.reasons.join(' · ')}
                              </p>
                            )}
                            <details>
                              <summary>
                                Fare details & conditions <Icon name="chevron" size={15} />
                              </summary>
                              <FareDisclosure offer={offer} />
                            </details>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <p className="fineprint">
                    Recommendations compare only returned offers from the providers shown. Unknown costs
                    remain unknown; no exchange-rate conversion is assumed. Independently verify visa and
                    entry requirements with official sources.
                  </p>
                </section>
              ) : busy === 'search' ? (
                <div className="search-progress" role="status">
                  <span className="loading-dot" />
                  <h3>Looking at the whole journey.</h3>
                  <p>Checking fares, baggage, connections and the details that matter.</p>
                </div>
              ) : (
                <section className="thoughtful-section">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">THE DETAILS MAKE THE DIFFERENCE</span>
                      <h2>Travel well. Choose clearly.</h2>
                    </div>
                    <span className="handwritten">A little less guesswork ↗</span>
                  </div>
                  <div className="value-grid">
                    <article>
                      <span className="feature-icon">
                        <Icon name="bag" size={23} />
                      </span>
                      <h3>The whole fare.</h3>
                      <p>Taxes, bags and fare rules, together. Unknown costs are always called out.</p>
                    </article>
                    <article>
                      <span className="feature-icon">
                        <Icon name="clock" size={23} />
                      </span>
                      <h3>Your time matters.</h3>
                      <p>A lower price isn’t always a better trip. See the trade-offs before you choose.</p>
                    </article>
                    <article>
                      <span className="feature-icon">
                        <Icon name="shield" size={23} />
                      </span>
                      <h3>You’re in control.</h3>
                      <p>Review the latest price and give your approval in a private checkout.</p>
                    </article>
                  </div>
                  <div className="conversation-tip">
                    <div className="tip-symbol">✳</div>
                    <div>
                      <span className="eyebrow">START WITH A CONVERSATION</span>
                      <p>“Find a flight from Pune to Delhi for my family, with bags and a short layover.”</p>
                      <small>
                        Ask your connected Codex or Claude assistant. FlightPilot takes care of the details.
                      </small>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
          {tab === 'bookings' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">EVERY JOURNEY, IN ONE PLACE</span>
                  <h1>My bookings</h1>
                  <p>Track provider references, ticket issuance and next steps.</p>
                </div>
                <button className="button button-secondary" onClick={loadBookings} disabled={!!busy}>
                  Refresh bookings
                </button>
              </div>
              {busy === 'bookings' && <p role="status">Loading your bookings…</p>}
              {historyLoaded && !bookings.length ? (
                <section className="empty-state">
                  <Icon name="ticket" size={36} />
                  <h2>Your next chapter is ahead.</h2>
                  <p>Bookings you approve will appear here, with their verified status.</p>
                  <button className="button button-primary" onClick={() => setTab('search')}>
                    Find a flight <Icon name="arrow" size={17} />
                  </button>
                </section>
              ) : (
                <div className="bookings-grid">
                  {bookings.map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      onRefresh={() => refreshBooking(booking.id)}
                      busy={busy === booking.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'preferences' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A JOURNEY THAT FEELS LIKE YOU</span>
                  <h1>Travel preferences</h1>
                  <p>Your defaults for the web workspace. Saved only in this browser.</p>
                </div>
              </div>
              <form
                className="preferences-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    localStorage.setItem(preferenceKey, JSON.stringify(preferences));
                    setSaved(true);
                  } catch {
                    setError(
                      'This browser does not allow local storage. Preferences still apply for this session.',
                    );
                  }
                }}
              >
                <h2>The essentials</h2>
                <div className="preference-grid">
                  <div>
                    <label htmlFor="pref-currency">Display currency</label>
                    <select
                      id="pref-currency"
                      value={preferences.currency}
                      onChange={(e) =>
                        updatePreference('currency', e.target.value as Preferences['currency'])
                      }
                    >
                      {['INR', 'USD', 'EUR', 'GBP', 'JPY', 'KWD'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                    <small>Provider must support your currency. No inferred conversion.</small>
                  </div>
                  <div>
                    <label htmlFor="pref-cabin">Preferred cabin</label>
                    <select
                      id="pref-cabin"
                      value={preferences.cabin}
                      onChange={(e) => updatePreference('cabin', e.target.value as Preferences['cabin'])}
                    >
                      <option value="economy">Economy</option>
                      <option value="premium_economy">Premium economy</option>
                      <option value="business">Business</option>
                      <option value="first">First</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pref-airlines">Preferred airlines</label>
                    <input
                      id="pref-airlines"
                      value={preferences.preferredAirlines}
                      onChange={(e) => updatePreference('preferredAirlines', e.target.value)}
                      placeholder="e.g. AI, UK"
                    />
                    <small>Two-character airline codes, comma-separated</small>
                  </div>
                  <div>
                    <label htmlFor="avoid-airlines">Avoided airlines</label>
                    <input
                      id="avoid-airlines"
                      value={preferences.avoidedAirlines}
                      onChange={(e) => updatePreference('avoidedAirlines', e.target.value)}
                      placeholder="Optional airline codes"
                    />
                  </div>
                </div>
                <div className="preference-actions">
                  <span className="fineprint">
                    No passenger identity or payment information is saved here.
                  </span>
                  <button className="button button-primary" type="submit">
                    {saved ? (
                      <>
                        <Icon name="check" size={18} /> Saved
                      </>
                    ) : (
                      'Save preferences'
                    )}
                  </button>
                </div>
                {saved && (
                  <p className="success-text" role="status">
                    Preferences saved in this browser.
                  </p>
                )}
              </form>
            </>
          )}
          <footer className="workspace-footer">
            <Brand />
            <span>A clearer way to fly.</span>
            <span>
              {mode === 'simulation'
                ? 'Fictional data · No real transactions'
                : 'Provider test data · No real transactions'}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
