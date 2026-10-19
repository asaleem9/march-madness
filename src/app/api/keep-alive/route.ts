import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// A scheduled ping to this route makes a tiny, read-only query so the
// database sees regular activity. Safe to call publicly — it never writes.
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  // Always 200 so the scheduler doesn't alarm; dbOk reports whether the read
  // succeeded so the keep-alive workflow can fail loudly on a dead database.
  return NextResponse.json({ ok: true, dbOk, ts: new Date().toISOString() });
}
