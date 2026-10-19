import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import type { Db } from "@/db";
import { getSnapshot } from "./pglite-snapshot";

/**
 * An in-memory Postgres (PGlite) with the real schema from `src/db/migrations`
 * already applied. Tests run genuine SQL instead of mocking query chains.
 *
 * Usage in a test file:
 *   vi.mock("@/db", async () => {
 *     const { createTestDb } = await import("@/test/db");
 *     return { db: await createTestDb() };
 *   });
 * Route and lib tests should run in the node environment (`// @vitest-environment node`).
 */
export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDb(): Promise<TestDb> {
  const snapshot = await getSnapshot();
  const client = new PGlite({ loadDataDir: new Blob([new Uint8Array(snapshot)]) });
  await client.waitReady;
  return drizzle(client, { schema });
}

/** Insert a profile row (the equivalent of a signed-up user). */
export async function seedProfile(
  db: TestDb | Db,
  overrides: Partial<typeof schema.profiles.$inferInsert> & { id: string }
) {
  // Tests that `vi.mock("@/db")` hold a PGlite db typed as the production `Db`; the query API is the same.
  const [row] = await (db as TestDb)
    .insert(schema.profiles)
    .values({ displayName: `user-${overrides.id.slice(-8)}`, ...overrides })
    .returning();
  return row;
}

/** A deterministic uuid for test users: seedUserId(1) → 00000000-0000-4000-8000-000000000001 */
export function seedUserId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
