import { PGlite } from '@electric-sql/pglite';
import { drizzle as localDrizzle } from 'drizzle-orm/pglite';
import { drizzle as postgresDrizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { tables } from './schema';
import type { BookingStatus } from '@flightpilot/shared';
import type { Config } from './config';
type Table = keyof typeof tables;
export class Store {
  private constructor(
    private run: (statement: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }>,
    readonly close: () => Promise<void>,
  ) {}
  static async open(config: Pick<Config, 'dataDir' | 'databaseUrl'>) {
    let store: Store;
    if (config.databaseUrl) {
      const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
      const db = postgresDrizzle(pool);
      store = new Store(
        async (q) => db.execute(q),
        async () => pool.end(),
      );
    } else {
      if (config.dataDir !== 'memory://') await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
      const pg = new PGlite(config.dataDir === 'memory://' ? undefined : config.dataDir);
      const db = localDrizzle(pg);
      store = new Store(
        async (q) => db.execute(q),
        async () => pg.close(),
      );
    }
    for (const table of Object.keys(tables)) {
      await store.run(
        sql`CREATE TABLE IF NOT EXISTS ${sql.identifier(table)} (id text PRIMARY KEY, owner text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
      );
      await store.run(
        sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`${table}_owner_idx`)} ON ${sql.identifier(table)} (owner)`,
      );
    }
    // Independent checkout URLs must not permit duplicate purchases of the same provider offer.
    await store.run(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS one_checkout_per_offer ON checkouts (owner,(data->>'offerId'))`,
    );
    return store;
  }
  async get<T>(table: Table, id: string, owner: string): Promise<T | null> {
    const r = await this.run(
      sql`SELECT data FROM ${sql.identifier(table)} WHERE id=${id} AND owner=${owner}`,
    );
    return (r.rows[0]?.data as T | undefined) ?? null;
  }
  async list<T>(table: Table, owner: string): Promise<T[]> {
    const r = await this.run(
      sql`SELECT data FROM ${sql.identifier(table)} WHERE owner=${owner} ORDER BY created_at DESC LIMIT 100`,
    );
    return r.rows.map((x) => x.data as T);
  }
  async put(table: Table, id: string, owner: string, data: unknown) {
    await this.run(
      sql`INSERT INTO ${sql.identifier(table)} (id,owner,data) VALUES (${id},${owner},${JSON.stringify(data)}::jsonb) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() WHERE ${sql.identifier(table)}.owner=EXCLUDED.owner`,
    );
  }
  async insert(table: Table, id: string, owner: string, data: unknown): Promise<boolean> {
    const r = await this.run(
      sql`INSERT INTO ${sql.identifier(table)} (id,owner,data) VALUES (${id},${owner},${JSON.stringify(data)}::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
    );
    return r.rows.length === 1;
  }
  async updateBooking(owner: string, booking: BookingStatus) {
    await this.run(
      sql`UPDATE bookings SET data=${JSON.stringify(booking)}::jsonb,updated_at=now() WHERE id=${booking.id} AND owner=${owner} AND ((data->>'updatedAt')::timestamptz < ${booking.updatedAt}::timestamptz OR ((data->>'updatedAt')::timestamptz = ${booking.updatedAt}::timestamptz AND (CASE data->>'status' WHEN 'cancelled' THEN 6 WHEN 'ticketed' THEN 5 WHEN 'confirmed' THEN 4 WHEN 'pending' THEN 3 WHEN 'reserved' THEN 2 WHEN 'failed' THEN 1 ELSE 0 END) <= ${(['unknown', 'failed', 'reserved', 'pending', 'confirmed', 'ticketed', 'cancelled'] as const).indexOf(booking.status)}))`,
    );
    const latest = await this.get<BookingStatus>('bookings', booking.id, owner);
    if (!latest) throw new Error('Booking disappeared during refresh');
    return latest;
  }
  async claim(id: string, owner: string, version: number, data: unknown) {
    const r = await this.run(
      sql`UPDATE checkouts SET data=${JSON.stringify(data)}::jsonb,updated_at=now() WHERE id=${id} AND owner=${owner} AND data->>'state'='review' AND (data->>'version')::int=${version} RETURNING id`,
    );
    return r.rows.length === 1;
  }
  async purge() {
    // No passenger identity is persisted. Search/raw fare retention 24h, other operational records 90d.
    for (const t of ['offers', 'searches', 'observations'] as const)
      await this.run(sql`DELETE FROM ${sql.identifier(t)} WHERE updated_at < now()-interval '24 hours'`);
    for (const t of [
      'webhooks',
      'audits',
      'payments',
      'ticketing',
      'attempts',
      'bookings',
      'checkouts',
    ] as const)
      await this.run(sql`DELETE FROM ${sql.identifier(t)} WHERE updated_at < now()-interval '90 days'`);
  }
}
