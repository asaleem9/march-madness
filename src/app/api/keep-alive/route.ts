import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Keeps the Supabase project awake on the free tier (which auto-pauses after
// ~7 days of inactivity). A scheduled ping to this route makes a tiny, read-only
// query, which counts as activity and resets the pause timer. Safe to call
// publicly — it only reads a single id and never writes.
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("tournament_config")
      .select("id")
      .limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  // Always 200 so the scheduler doesn't alarm; the act of connecting is what
  // wakes/keeps the database, and dbOk reports whether the read succeeded.
  return NextResponse.json({ ok: true, dbOk, ts: new Date().toISOString() });
}
