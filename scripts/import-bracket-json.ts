/**
 * Manual fallback for the ESPN importer: feed saved ESPN scoreboard JSON files
 * (the raw `scoreboard?dates=...&groups=100` responses) through the same
 * plan/apply pipeline.
 *
 *   npm run db:import-json -- --year 2027 file1.json file2.json [--dry-run] [--expected-teams 76 --expected-opening 12]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { parseESPNScoreboard } from "../src/lib/espn";
import { classifyScoreboards, buildImportPlan } from "../src/lib/bracket-import";
import { applyImportPlan } from "../src/lib/bracket-import-apply";
import { YEAR_DEFAULTS } from "../src/lib/tournament-structure";

dotenv.config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const year = parseInt(arg("year") ?? "", 10);
  const defaults = YEAR_DEFAULTS[year];
  if (!defaults) {
    console.error("Usage: npm run db:import-json -- --year 2027 a.json b.json [--dry-run]");
    process.exit(1);
  }
  const files = process.argv.slice(2).filter((a) => a.endsWith(".json"));
  if (files.length === 0) {
    console.error("Pass at least one scoreboard JSON file");
    process.exit(1);
  }
  const boards = files.map((f) => parseESPNScoreboard(JSON.parse(fs.readFileSync(f, "utf8"))));
  const plan = buildImportPlan(classifyScoreboards(boards), {
    year,
    dates: defaults.dates,
    finalFourPairing: defaults.finalFourPairing,
    datesFetched: files,
    expected: {
      teams: arg("expected-teams") ? parseInt(arg("expected-teams")!, 10) : undefined,
      opening: arg("expected-opening") ? parseInt(arg("expected-opening")!, 10) : undefined,
    },
  });
  console.log(JSON.stringify(plan.report, null, 2));
  if (!plan.writable) {
    console.error("\nPlan has errors; nothing written.");
    process.exit(1);
  }
  if (flag("dry-run")) {
    console.log("\nDry run; nothing written.");
    return;
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const result = await applyImportPlan(supabase, plan);
  console.log("\nWritten:", result);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
