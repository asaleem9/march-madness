import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportPlan } from "./bracket-import";
import { SLOT_RANGES, YEAR_DEFAULTS } from "./tournament-structure";
import { DEFAULT_SCORING } from "./utils";

export interface ApplyResult {
  teamsUpserted: number;
  gamesUpserted: number;
  openingGamesWritten: number;
  configUpdated: boolean;
  warnings: string[];
}

/**
 * Write an ImportPlan to the database. Every write is an upsert keyed on
 * `teams.espn_id` / `games.game_slot`, so the import can be re-run (e.g. if
 * ESPN posts the last first-round games late) without duplicating rows.
 * Structural upserts never touch status/scores/winner.
 */
export async function applyImportPlan(
  admin: SupabaseClient,
  plan: ImportPlan
): Promise<ApplyResult> {
  if (!plan.writable) {
    throw new Error(`Import plan has errors: ${plan.report.errors.join("; ")}`);
  }
  const warnings: string[] = [];

  // 1. Teams.
  const { error: teamErr } = await admin
    .from("teams")
    .upsert(plan.teams, { onConflict: "espn_id" });
  if (teamErr) throw new Error(`teams upsert failed: ${teamErr.message}`);

  const { data: dbTeams, error: readErr } = await admin
    .from("teams")
    .select("id, espn_id, name");
  if (readErr || !dbTeams) throw new Error(`teams read failed: ${readErr?.message}`);
  const idByEspn = new Map<string, number>();
  for (const t of dbTeams) if (t.espn_id) idByEspn.set(t.espn_id, t.id);

  const planned = new Set(plan.teams.map((t) => t.espn_id));
  const stale = dbTeams.filter((t) => !t.espn_id || !planned.has(t.espn_id));
  if (stale.length > 0) {
    warnings.push(
      `${stale.length} team(s) in the database aren't in this import: ${stale
        .slice(0, 8)
        .map((t) => t.name)
        .join(", ")}${stale.length > 8 ? "…" : ""}`
    );
  }

  const teamId = (espnId: string | null) => (espnId ? idByEspn.get(espnId) ?? null : null);

  // 2. Skeleton (slots 13–75): structure only.
  const { error: skelErr } = await admin
    .from("games")
    .upsert(plan.skeleton, { onConflict: "game_slot" });
  if (skelErr) throw new Error(`skeleton upsert failed: ${skelErr.message}`);

  // 3. Opening Round rows, then drop any unused opening slots.
  const openingRows = plan.openingGames.map((g) => ({
    game_slot: g.game_slot,
    round: g.round,
    region: g.region,
    next_game_slot: g.next_game_slot,
    slot_position: g.slot_position,
    scheduled_at: g.scheduled_at,
    espn_game_id: g.espn_game_id,
    team_a_id: teamId(g.team_a_espn_id),
    team_b_id: teamId(g.team_b_espn_id),
  }));
  if (openingRows.length > 0) {
    const { error } = await admin.from("games").upsert(openingRows, { onConflict: "game_slot" });
    if (error) throw new Error(`opening round upsert failed: ${error.message}`);
  }
  const { error: delErr } = await admin
    .from("games")
    .delete()
    .eq("round", "first_four")
    .gt("game_slot", SLOT_RANGES.first_four.start + openingRows.length - 1);
  if (delErr) warnings.push(`could not remove unused opening slots: ${delErr.message}`);

  // 4. First Round rows.
  const r1Rows = plan.firstRoundGames.map((g) => ({
    game_slot: g.game_slot,
    round: g.round,
    region: g.region,
    next_game_slot: g.next_game_slot,
    slot_position: g.slot_position,
    scheduled_at: g.scheduled_at,
    espn_game_id: g.espn_game_id,
    team_a_id: teamId(g.team_a_espn_id),
    team_b_id: teamId(g.team_b_espn_id),
  }));
  const { error: r1Err } = await admin.from("games").upsert(r1Rows, { onConflict: "game_slot" });
  if (r1Err) throw new Error(`first round upsert failed: ${r1Err.message}`);

  // 5. Config.
  const { data: config } = await admin
    .from("tournament_config")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  let configUpdated = false;
  if (config) {
    const { error } = await admin
      .from("tournament_config")
      .update({ year: plan.year, final_four_pairing: plan.finalFourPairing })
      .eq("id", 1);
    configUpdated = !error;
  } else {
    const defaults = YEAR_DEFAULTS[plan.year];
    const { error } = await admin.from("tournament_config").insert({
      id: 1,
      year: plan.year,
      bracket_lock_deadline: defaults?.lockDeadline ?? plan.firstRoundGames[0]?.scheduled_at,
      wager_creation_deadline: defaults?.wagerDeadline ?? plan.firstRoundGames[0]?.scheduled_at,
      scoring_multipliers: DEFAULT_SCORING,
      active_phase: "pre_tournament",
      final_four_pairing: plan.finalFourPairing,
    });
    configUpdated = !error;
    if (error) warnings.push(`config insert failed: ${error.message}`);
  }

  return {
    teamsUpserted: plan.teams.length,
    gamesUpserted: plan.skeleton.length + openingRows.length + r1Rows.length,
    openingGamesWritten: openingRows.length,
    configUpdated,
    warnings,
  };
}
