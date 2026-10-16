/**
 * Yearly rollover: wipe last tournament's data (keeping user accounts, push
 * subscriptions and the email waitlist), insert the new tournament_config row
 * and the 75-slot bracket skeleton. Teams and first-round matchups come later
 * from the admin "Import from ESPN" action on Selection Sunday.
 *
 *   npm run db:rollover -- --year 2027 --confirm [--lock ISO] [--wager-deadline ISO] [--no-skeleton]
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  YEAR_DEFAULTS,
  buildGameSlots,
  type FinalFourPairing,
} from "../src/lib/tournament-structure";
import { DEFAULT_SCORING } from "../src/lib/utils";

dotenv.config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const supabase = createClient(url, key);

// Children first so FK constraints (wagers → brackets has no cascade) hold.
const tables: { name: string; idType: "int" | "uuid" }[] = [
  { name: "notification_queue", idType: "int" },
  { name: "notifications_log", idType: "int" },
  { name: "bracket_picks", idType: "int" },
  { name: "wagers", idType: "uuid" },
  { name: "user_achievements", idType: "int" },
  { name: "brackets", idType: "uuid" },
  { name: "games", idType: "int" },
  { name: "teams", idType: "int" },
  { name: "tournament_config", idType: "int" },
  // kept: profiles, push_subscriptions, email_waitlist
];

async function countRows(table: string): Promise<number | null> {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? null;
}

async function main() {
  const year = parseInt(arg("year") ?? "", 10);
  if (!year) {
    console.error("Usage: npm run db:rollover -- --year 2027 --confirm");
    process.exit(1);
  }
  const defaults = YEAR_DEFAULTS[year];
  const lock = arg("lock") ?? defaults?.lockDeadline;
  const wager = arg("wager-deadline") ?? arg("lock") ?? defaults?.wagerDeadline;
  if (!lock || !wager) {
    console.error(`No defaults for ${year}; pass --lock and --wager-deadline (ISO timestamps).`);
    process.exit(1);
  }
  const pairing: FinalFourPairing =
    defaults?.finalFourPairing ?? [["east", "west"], ["south", "midwest"]];

  console.log(`Target: ${url}`);
  console.log("Current row counts:");
  for (const t of tables) console.log(`  ${t.name.padEnd(20)} ${await countRows(t.name) ?? "?"}`);
  console.log("\nWill insert tournament_config:", {
    year,
    bracket_lock_deadline: lock,
    wager_creation_deadline: wager,
    active_phase: "pre_tournament",
    final_four_pairing: pairing,
  });
  console.log(flag("no-skeleton") ? "Skipping bracket skeleton." : "Will insert the 75-slot bracket skeleton.");

  if (!flag("confirm")) {
    console.log("\nDry run. Re-run with --confirm to wipe the tables above and seed the new season.");
    process.exit(0);
  }

  console.log("\nDeleting...");
  for (const t of tables) {
    const q = supabase.from(t.name).delete({ count: "exact" });
    const { error, count } =
      t.idType === "uuid"
        ? await q.neq("id", "00000000-0000-0000-0000-000000000000")
        : await q.neq("id", -999999);
    if (error) {
      console.error(`  [FAIL] ${t.name}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  [OK]   ${t.name} — ${count ?? "?"} rows deleted`);
  }

  const { error: cfgError } = await supabase.from("tournament_config").insert({
    id: 1,
    year,
    bracket_lock_deadline: lock,
    wager_creation_deadline: wager,
    scoring_multipliers: DEFAULT_SCORING,
    active_phase: "pre_tournament",
    final_four_pairing: pairing,
  });
  if (cfgError) {
    console.error("Failed to insert tournament_config:", cfgError.message);
    process.exit(1);
  }
  console.log("Inserted tournament_config.");

  if (!flag("no-skeleton") && defaults) {
    const rows = buildGameSlots({ dates: defaults.dates, finalFourPairing: pairing });
    const { error } = await supabase.from("games").insert(rows);
    if (error) {
      console.error("Failed to insert game skeleton:", error.message);
      process.exit(1);
    }
    console.log(`Inserted ${rows.length} game slots.`);
  }

  console.log("\nDone. Next: on Selection Sunday run Import from ESPN on the admin page.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
