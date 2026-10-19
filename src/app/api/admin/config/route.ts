import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { games, notificationQueue, tournamentConfig } from "@/db/schema";
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

type ConfigRow = typeof tournamentConfig.$inferSelect;

/** The admin page reads the config row with its database column names. */
function serializeConfig(row: ConfigRow) {
  return {
    id: row.id,
    year: row.year,
    bracket_lock_deadline: row.bracketLockDeadline.toISOString(),
    wager_creation_deadline: row.wagerCreationDeadline.toISOString(),
    scoring_multipliers: row.scoringMultipliers,
    active_phase: row.activePhase,
    final_four_pairing: row.finalFourPairing,
    last_score_update_at: row.lastScoreUpdateAt?.toISOString() ?? null,
  };
}

export async function GET() {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [config, [{ queueDepth }]] = await Promise.all([
    db.query.tournamentConfig.findFirst({ where: eq(tournamentConfig.id, 1) }),
    db
      .select({ queueDepth: count() })
      .from(notificationQueue)
      .where(eq(notificationQueue.sent, false)),
  ]);

  // Queue depth rides along so the admin health panel can show the backlog
  // without a second request.
  return NextResponse.json({
    ...(config ? serializeConfig(config) : {}),
    queue_depth: queueDepth ?? 0,
  });
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

  const set: Partial<typeof tournamentConfig.$inferInsert> = {};
  if (updates.year !== undefined) set.year = updates.year;
  if (updates.bracket_lock_deadline !== undefined) {
    set.bracketLockDeadline = new Date(updates.bracket_lock_deadline);
  }
  if (updates.wager_creation_deadline !== undefined) {
    set.wagerCreationDeadline = new Date(updates.wager_creation_deadline);
  }
  if (updates.active_phase !== undefined) set.activePhase = updates.active_phase;
  if (updates.scoring_multipliers !== undefined) {
    set.scoringMultipliers = updates.scoring_multipliers;
  }
  if (updates.final_four_pairing !== undefined) {
    set.finalFourPairing = updates.final_four_pairing;
  }

  // Changing the semifinal pairing rewires the four Elite Eight slots. Refuse
  // once any of those games is final — the bracket is already decided.
  const pairing = updates.final_four_pairing as FinalFourPairing | undefined;
  if (pairing) {
    const decided = await db
      .select({ gameSlot: games.gameSlot })
      .from(games)
      .where(and(inArray(games.round, ["elite_eight", "final_four"]), eq(games.status, "final")))
      .limit(1);
    if (decided.length > 0) {
      return NextResponse.json(
        { error: "Elite Eight games are already final; the pairing can't change" },
        { status: 409 }
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (pairing) {
        for (const region of REGION_ORDER) {
          const target = eliteEightTarget(region, pairing);
          await tx
            .update(games)
            .set({ nextGameSlot: target.next_game_slot, slotPosition: target.slot_position })
            .where(and(eq(games.round, "elite_eight"), eq(games.region, region)));
        }
      }
      await tx.update(tournamentConfig).set(set).where(eq(tournamentConfig.id, 1));
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err instanceof Error ? err.message : null) },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
