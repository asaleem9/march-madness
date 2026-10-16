import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronOrAdmin } from "@/lib/admin-auth";
import { lockBracketsPastDeadline } from "@/lib/lock-brackets";

/** Finalize every complete draft once the deadline has passed (also runs inside the score cron). */
export async function POST(request: NextRequest) {
  if (!(await authorizeCronOrAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await lockBracketsPastDeadline(createAdminClient());
  return NextResponse.json(result);
}
