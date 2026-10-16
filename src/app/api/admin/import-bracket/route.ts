import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronOrAdmin } from "@/lib/admin-auth";
import { fetchESPNScoreboard } from "@/lib/espn";
import { classifyScoreboards, buildImportPlan } from "@/lib/bracket-import";
import { applyImportPlan } from "@/lib/bracket-import-apply";
import { YEAR_DEFAULTS, type FinalFourPairing } from "@/lib/tournament-structure";

export const maxDuration = 60;

const regionSchema = z.enum(["east", "west", "south", "midwest"]);
const bodySchema = z.object({
  year: z.number().int().optional(),
  dates: z.array(z.string().regex(/^\d{8}$/)).min(1).max(8).optional(),
  finalFourPairing: z
    .tuple([z.tuple([regionSchema, regionSchema]), z.tuple([regionSchema, regionSchema])])
    .optional(),
  expected: z.object({ teams: z.number().int().optional(), opening: z.number().int().optional() }).optional(),
  dryRun: z.boolean().default(false),
  force: z.boolean().default(false),
});

/**
 * Build this season's teams and bracket from ESPN. Run on Selection Sunday
 * night (dry run first), re-run if ESPN posts games late. Admin session or
 * CRON_SECRET bearer.
 */
export async function POST(request: NextRequest) {
  if (!(await authorizeCronOrAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const body = parsed.data;
  const admin = createAdminClient();

  const { data: config } = await admin
    .from("tournament_config")
    .select("year, final_four_pairing")
    .eq("id", 1)
    .maybeSingle();

  const year = body.year ?? config?.year ?? new Date().getFullYear();
  const defaults = YEAR_DEFAULTS[year];
  const dates = body.dates ?? defaults?.espnDates;
  if (!dates || !defaults) {
    return NextResponse.json(
      { error: `No defaults for ${year}; pass "dates" (YYYYMMDD) explicitly` },
      { status: 400 }
    );
  }
  const finalFourPairing: FinalFourPairing =
    body.finalFourPairing ??
    (config?.final_four_pairing as FinalFourPairing | null) ??
    defaults.finalFourPairing;

  const boards = await Promise.all(dates.map((d) => fetchESPNScoreboard(d)));
  if (boards.every((b) => !b)) {
    return NextResponse.json({ error: "ESPN fetch failed for every date" }, { status: 502 });
  }

  const classified = classifyScoreboards(boards);
  const plan = buildImportPlan(classified, {
    year,
    dates: defaults.dates,
    finalFourPairing,
    datesFetched: dates,
    expected: body.expected,
  });

  if (!plan.writable) {
    return NextResponse.json({ report: plan.report, written: null }, { status: 422 });
  }
  if (body.dryRun) {
    return NextResponse.json({ report: plan.report, written: null });
  }

  if (!body.force) {
    const { data: started } = await admin
      .from("games")
      .select("game_slot")
      .neq("status", "scheduled")
      .limit(1);
    if (started && started.length > 0) {
      return NextResponse.json(
        { error: "Games have already started; pass force:true to re-import structure anyway", report: plan.report },
        { status: 409 }
      );
    }
  }

  try {
    const written = await applyImportPlan(admin, plan);
    return NextResponse.json({ report: plan.report, written });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed", report: plan.report },
      { status: 500 }
    );
  }
}
