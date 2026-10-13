import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
// JSON payloads are domain-typed at the repository seam; row ownership is always a separate indexed column.
const record = (name: string) =>
  pgTable(
    name,
    {
      id: text('id').primaryKey(),
      owner: text('owner').notNull(),
      data: jsonb('data').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [index(`${name}_owner_idx`).on(t.owner)],
  );
export const users = record('users');
export const preferences = record('preferences');
export const searches = record('searches');
export const offers = record('offers');
export const observations = record('observations');
export const checkouts = record('checkouts');
export const attempts = record('attempts');
export const bookings = record('bookings');
export const ticketing = record('ticketing');
export const payments = record('payments');
export const webhooks = record('webhooks');
export const audits = record('audits');
export const tables = {
  users,
  preferences,
  searches,
  offers,
  observations,
  checkouts,
  attempts,
  bookings,
  ticketing,
  payments,
  webhooks,
  audits,
};
