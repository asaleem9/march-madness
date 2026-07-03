import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeError } from "@/lib/sanitizeError";

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

async function isAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && adminEmails.includes(user.email || "");
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("tournament_config")
    .select("*")
    .eq("id", 1)
    .single();

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const body = await request.json();

  // Only allow known config columns (never id / arbitrary fields).
  const allowed = [
    "year",
    "bracket_lock_deadline",
    "wager_creation_deadline",
    "scoring_multipliers",
    "active_phase",
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await adminClient
    .from("tournament_config")
    .update(updates)
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
