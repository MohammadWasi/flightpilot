import { FlightPilotError } from '@flightpilot/shared';
export const airports = [
  ['PNQ', 'Pune', 'Pune Airport', 'IN', 'Asia/Kolkata'],
  ['DEL', 'Delhi', 'Indira Gandhi International', 'IN', 'Asia/Kolkata'],
  ['BOM', 'Mumbai', 'Chhatrapati Shivaji Maharaj International', 'IN', 'Asia/Kolkata'],
  ['BLR', 'Bengaluru', 'Kempegowda International', 'IN', 'Asia/Kolkata'],
  ['HYD', 'Hyderabad', 'Rajiv Gandhi International', 'IN', 'Asia/Kolkata'],
  ['MAA', 'Chennai', 'Chennai International', 'IN', 'Asia/Kolkata'],
  ['CCU', 'Kolkata', 'Netaji Subhas Chandra Bose International', 'IN', 'Asia/Kolkata'],
  ['GOI', 'Goa', 'Dabolim', 'IN', 'Asia/Kolkata'],
  ['GOX', 'Goa', 'Manohar International', 'IN', 'Asia/Kolkata'],
  ['COK', 'Kochi', 'Cochin International', 'IN', 'Asia/Kolkata'],
  ['AMD', 'Ahmedabad', 'Sardar Vallabhbhai Patel International', 'IN', 'Asia/Kolkata'],
  ['JAI', 'Jaipur', 'Jaipur International', 'IN', 'Asia/Kolkata'],
  ['LKO', 'Lucknow', 'Chaudhary Charan Singh International', 'IN', 'Asia/Kolkata'],
  ['LHR', 'London', 'Heathrow', 'GB', 'Europe/London'],
  ['LGW', 'London', 'Gatwick', 'GB', 'Europe/London'],
  ['JFK', 'New York', 'John F. Kennedy International', 'US', 'America/New_York'],
  ['EWR', 'New York', 'Newark Liberty International', 'US', 'America/New_York'],
  ['DXB', 'Dubai', 'Dubai International', 'AE', 'Asia/Dubai'],
  ['SIN', 'Singapore', 'Changi', 'SG', 'Asia/Singapore'],
  ['BKK', 'Bangkok', 'Suvarnabhumi', 'TH', 'Asia/Bangkok'],
  ['CDG', 'Paris', 'Charles de Gaulle', 'FR', 'Europe/Paris'],
  ['SYD', 'Sydney', 'Kingsford Smith', 'AU', 'Australia/Sydney'],
].map(([code, city, name, country, timezone]) => ({
  code: code!,
  city: city!,
  name: name!,
  country: country!,
  timezone: timezone!,
}));
const aliases: Record<string, string> = {
  bangalore: 'bengaluru',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  'new delhi': 'delhi',
  poona: 'pune',
  cochin: 'kochi',
};
export function resolveAirport(query: string) {
  const q = aliases[query.trim().toLowerCase()] ?? query.trim().toLowerCase();
  const exact = airports.find((a) => a.code.toLowerCase() === q);
  const matches = exact
    ? [exact]
    : airports.filter((a) => a.city.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  return {
    airports: matches,
    requiresSelection: matches.length !== 1,
    coverage:
      'Curated airport directory, not a worldwide or proximity database. Unknown locations need an explicitly verified IATA code.',
  };
}
export function airportCode(query: string) {
  const result = resolveAirport(query);
  if (result.airports.length === 1) return result.airports[0]!.code;
  if (result.airports.length > 1)
    throw new FlightPilotError(
      'AMBIGUOUS_AIRPORT',
      `Choose an airport: ${result.airports.map((a) => `${a.code} (${a.name})`).join(', ')}.`,
    );
  throw new FlightPilotError(
    'UNKNOWN_AIRPORT',
    'Location is outside the verified directory. Choose a supported airport with resolve_airport.',
  );
}
