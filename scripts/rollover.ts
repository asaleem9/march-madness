/**
 * Yearly rollover: wipe last tournament's data (keeping user accounts, push
 * subscriptions and the email waitlist), insert the new tournament_config row
 * and the 75-slot bracket skeleton. Teams and first-round matchups come later
 * from the admin "Import from ESPN" action on Selection Sunday.
 *
 *   npm run db:rollover -- --year 2027 --confirm [--lock ISO] [--wager-deadline ISO] [--no-skeleton]
 */
import * as dotenv from "dotenv";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
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

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is required");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

// Children first so FK constraints (wagers → brackets has no cascade) hold.
const tables = [
  { name: "notification_queue", table: schema.notificationQueue },
  { name: "notifications_log", table: schema.notificationsLog },
  { name: "bracket_picks", table: schema.bracketPicks },
  { name: "wagers", table: schema.wagers },
  { name: "user_achievements", table: schema.userAchievements },
  { name: "brackets", table: schema.brackets },
  { name: "games", table: schema.games },
  { name: "teams", table: schema.teams },
  { name: "tournament_config", table: schema.tournamentConfig },
  // kept: profiles, push_subscriptions, email_waitlist
] as const;

async function countRows(table: (typeof tables)[number]["table"]): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

function redact(connection: string): string {
  try {
    const u = new URL(connection);
    return `${u.protocol}//${u.username ? `${u.username}@` : ""}${u.host}${u.pathname}`;
  } catch {
    return "(database)";
  }
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

  console.log(`Target: ${redact(url!)}`);
  console.log("Current row counts:");
  for (const t of tables) console.log(`  ${t.name.padEnd(20)} ${await countRows(t.table)}`);
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
    return;
  }

  await db.transaction(async (tx) => {
    console.log("\nDeleting...");
    for (const t of tables) {
      const deleted = await tx.delete(t.table).returning();
      console.log(`  [OK]   ${t.name} — ${deleted.length} rows deleted`);
    }

    await tx.insert(schema.tournamentConfig).values({
      id: 1,
      year,
      bracketLockDeadline: new Date(lock),
      wagerCreationDeadline: new Date(wager),
      scoringMultipliers: DEFAULT_SCORING,
      activePhase: "pre_tournament",
      finalFourPairing: pairing,
    });
    console.log("Inserted tournament_config.");

    if (!flag("no-skeleton") && defaults) {
      const rows = buildGameSlots({ dates: defaults.dates, finalFourPairing: pairing });
      await tx.insert(schema.games).values(
        rows.map((g) => ({
          gameSlot: g.game_slot,
          round: g.round,
          region: g.region,
          nextGameSlot: g.next_game_slot,
          slotPosition: g.slot_position,
          scheduledAt: g.scheduled_at ? new Date(g.scheduled_at) : null,
        }))
      );
      console.log(`Inserted ${rows.length} game slots.`);
    }
  });

  console.log("\nDone. Next: on Selection Sunday run Import from ESPN on the admin page.");
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
