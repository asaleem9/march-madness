import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

/**
 * PGlite's `initdb` costs several CPU-seconds per instance. Instead of paying
 * that in every test file, build the migrated data directory once per schema
 * version, cache it under node_modules/.cache, and let each test file load
 * the snapshot (10x faster than initdb).
 */
const MIGRATIONS = join(process.cwd(), "src/db/migrations");
const CACHE_DIR = join(process.cwd(), "node_modules/.cache/pglite");

function migrationsHash(): string {
  const h = createHash("sha1");
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(name).update(readFileSync(p));
    }
  };
  walk(MIGRATIONS);
  return h.digest("hex").slice(0, 12);
}

let inMemory: Buffer | null = null;

export async function buildSnapshot(): Promise<Buffer> {
  const client = new PGlite();
  await client.waitReady;
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  const blob = await client.dumpDataDir("none");
  await client.close();
  return Buffer.from(await blob.arrayBuffer());
}

/** The migrated data-dir tarball, built on first use and cached on disk. */
export async function getSnapshot(): Promise<Buffer> {
  if (inMemory) return inMemory;
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${migrationsHash()}.tar`);
  try {
    inMemory = readFileSync(file);
    return inMemory;
  } catch {
    // not cached yet
  }
  const buf = await buildSnapshot();
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, file); // atomic, so concurrent workers never read a partial file
  inMemory = buf;
  return buf;
}
