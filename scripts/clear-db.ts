import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Tables with their ID type, in deletion order (children first)
const tables: { name: string; idType: "int" | "uuid" }[] = [
  { name: "notification_queue", idType: "int" },
  { name: "notifications_log", idType: "int" },
  { name: "push_subscriptions", idType: "int" },
  { name: "bracket_picks", idType: "int" },
  { name: "wagers", idType: "uuid" },
  { name: "user_achievements", idType: "int" },
  { name: "brackets", idType: "uuid" },
  { name: "games", idType: "int" },
  { name: "teams", idType: "int" },
  { name: "tournament_config", idType: "int" },
  // "profiles" — skipped; auto-created by auth trigger
];

async function clearDatabase() {
  console.log("Clearing all database tables (service role, bypasses RLS)...\n");

  for (const table of tables) {
    // Use a filter that matches all rows — Supabase requires a filter for delete
    const query = supabase.from(table.name).delete({ count: "exact" });
    const { error, count } =
      table.idType === "uuid"
        ? await query.neq("id", "00000000-0000-0000-0000-000000000000")
        : await query.neq("id", -999999);

    if (error) {
      console.error(`  [FAIL] ${table.name}: ${error.message}`);
    } else {
      console.log(`  [OK]   ${table.name} — ${count ?? "?"} rows deleted`);
    }
  }

  console.log("\nDone. Run `npm run db:seed` to re-seed teams, games, and config.");
}

clearDatabase().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
