import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/sanitizeError";
import {
  REGION_ORDER,
  eliteEightTarget,
  type FinalFourPairing,
} from "@/lib/tournament-structure";

const regionSchema = z.enum(["east", "west", "south", "midwest"]);
const pairingSchema = z
  .tuple([z.tuple([regionSchema, regionSchema]), z.tuple([regionSchema, regionSchema])])
  .refine(
    (p) => new Set(p.flat()).size === 4 && REGION_ORDER.every((r) => p.flat().includes(r)),
    { message: "Final Four pairing must use each region exactly once" }
  );

const positiveInt = z.number().int().positive();
const updateSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  bracket_lock_deadline: z.iso.datetime({ offset: true }).optional(),
  wager_creation_deadline: z.iso.datetime({ offset: true }).optional(),
  active_phase: z
    .enum([
      "pre_tournament",
      "first_four",
      "first_round",
      "second_round",
      "sweet_16",
      "elite_eight",
      "final_four",
      "championship",
      "completed",
    ])
    .optional(),
  scoring_multipliers: z
    .object({
      first_round: positiveInt,
      second_round: positiveInt,
      sweet_16: positiveInt,
      elite_eight: positiveInt,
      final_four: positiveInt,
      championship: positiveInt,
    })
    .optional(),
  final_four_pairing: pairingSchema.optional(),
});

export async function GET() {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const [{ data }, { count: queueDepth }] = await Promise.all([
    adminClient.from("tournament_config").select("*").eq("id", 1).maybeSingle(),
    adminClient
      .from("notification_queue")
      .select("id", { count: "exact", head: true })
      .eq("sent", false),
  ]);

  // Queue depth rides along because RLS hides other users' queue rows from the
  // browser client the admin page uses.
  return NextResponse.json({ ...(data ?? {}), queue_depth: queueDepth ?? 0 });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid config" },
      { status: 400 }
    );
  }
  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Changing the semifinal pairing rewires the four Elite Eight slots. Refuse
  // once any of those games is final — the bracket is already decided.
  if (updates.final_four_pairing) {
    const { data: decided } = await adminClient
      .from("games")
      .select("game_slot")
      .in("round", ["elite_eight", "final_four"])
      .eq("status", "final")
      .limit(1);
    if (decided && decided.length > 0) {
      return NextResponse.json(
        { error: "Elite Eight games are already final; the pairing can't change" },
        { status: 409 }
      );
    }
    const pairing = updates.final_four_pairing as FinalFourPairing;
    for (const region of REGION_ORDER) {
      const target = eliteEightTarget(region, pairing);
      const { error } = await adminClient
        .from("games")
        .update({ next_game_slot: target.next_game_slot, slot_position: target.slot_position })
        .eq("round", "elite_eight")
        .eq("region", region);
      if (error) {
        return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
      }
    }
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
