import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The single Drizzle connection for the app. Every server-side read and write
 * goes through it; authorization is enforced in route handlers and server
 * components, not by database policies.
 *
 * `DATABASE_URL` is the pooled Neon endpoint (PgBouncer, transaction mode), so
 * prepared statements are disabled. The connection is created on first use
 * (so importing this module never needs env at build time) and cached on
 * `globalThis` so dev-server hot reloads don't leak connections.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
  return drizzle(sql, { schema });
}

/** The Drizzle database type, for library functions that accept a connection (or a test double). */
export type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __mmDb?: Db };

function getDb(): Db {
  if (!globalForDb.__mmDb) globalForDb.__mmDb = createDb();
  return globalForDb.__mmDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
