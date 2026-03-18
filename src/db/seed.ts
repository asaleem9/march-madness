import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2026 Tournament Teams
const teams = [
  // EAST
  { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", record: "32-2", espn_id: "150" },
  { name: "Siena", abbreviation: "SIENA", seed: 16, region: "east", record: "23-11", espn_id: "2561" },
  { name: "Ohio St.", abbreviation: "OSU", seed: 8, region: "east", record: "21-12", espn_id: "194" },
  { name: "TCU", abbreviation: "TCU", seed: 9, region: "east", record: "22-11", espn_id: "2628" },
  { name: "St. John's", abbreviation: "SJU", seed: 5, region: "east", record: "28-6", espn_id: "2599" },
  { name: "Northern Iowa", abbreviation: "UNI", seed: 12, region: "east", record: "23-12", espn_id: "2460" },
  { name: "Kansas", abbreviation: "KU", seed: 4, region: "east", record: "23-10", espn_id: "2305" },
  { name: "Cal Baptist", abbreviation: "CBU", seed: 13, region: "east", record: "25-8", espn_id: "2856" },
  { name: "Louisville", abbreviation: "LOU", seed: 6, region: "east", record: "23-10", espn_id: "97" },
  { name: "South Florida", abbreviation: "USF", seed: 11, region: "east", record: "25-8", espn_id: "58" },
  { name: "Michigan St.", abbreviation: "MSU", seed: 3, region: "east", record: "25-7", espn_id: "127" },
  { name: "North Dakota St.", abbreviation: "NDSU", seed: 14, region: "east", record: "27-7", espn_id: "2449" },
  { name: "UCLA", abbreviation: "UCLA", seed: 7, region: "east", record: "23-11", espn_id: "26" },
  { name: "UCF", abbreviation: "UCF", seed: 10, region: "east", record: "21-11", espn_id: "2116" },
  { name: "UConn", abbreviation: "CONN", seed: 2, region: "east", record: "29-5", espn_id: "41" },
  { name: "Furman", abbreviation: "FUR", seed: 15, region: "east", record: "22-12", espn_id: "231" },

  // WEST
  { name: "Arizona", abbreviation: "ARIZ", seed: 1, region: "west", record: "32-2", espn_id: "12" },
  { name: "Long Island", abbreviation: "LIU", seed: 16, region: "west", record: "24-10", espn_id: "112358" },
  { name: "Villanova", abbreviation: "NOVA", seed: 8, region: "west", record: "24-8", espn_id: "222" },
  { name: "Utah St.", abbreviation: "USU", seed: 9, region: "west", record: "28-6", espn_id: "328" },
  { name: "Wisconsin", abbreviation: "WIS", seed: 5, region: "west", record: "24-10", espn_id: "275" },
  { name: "High Point", abbreviation: "HPU", seed: 12, region: "west", record: "30-4", espn_id: "2272" },
  { name: "Arkansas", abbreviation: "ARK", seed: 4, region: "west", record: "26-8", espn_id: "8" },
  { name: "Hawaii", abbreviation: "HAW", seed: 13, region: "west", record: "24-8", espn_id: "62" },
  { name: "BYU", abbreviation: "BYU", seed: 6, region: "west", record: "23-11", espn_id: "252" },
  // NC State and Texas are First Four, will be added as 11 seeds
  { name: "NC State", abbreviation: "NCST", seed: 11, region: "west", record: "First Four", espn_id: "152" },
  { name: "Texas", abbreviation: "TEX", seed: 11, region: "west", record: "First Four", espn_id: "251" },
  { name: "Gonzaga", abbreviation: "GONZ", seed: 3, region: "west", record: "30-3", espn_id: "2250" },
  { name: "Kennesaw St.", abbreviation: "KSU", seed: 14, region: "west", record: "21-13", espn_id: "2306" },
  { name: "Miami FL", abbreviation: "MIA", seed: 7, region: "west", record: "25-8", espn_id: "2390" },
  { name: "Missouri", abbreviation: "MIZ", seed: 10, region: "west", record: "20-12", espn_id: "142" },
  { name: "Purdue", abbreviation: "PUR", seed: 2, region: "west", record: "27-8", espn_id: "2509" },
  { name: "Queens NC", abbreviation: "QNC", seed: 15, region: "west", record: "21-13", espn_id: "2511" },

  // SOUTH
  { name: "Florida", abbreviation: "FLA", seed: 1, region: "south", record: "26-7", espn_id: "57" },
  // Lehigh and Prairie View A&M are First Four
  { name: "Lehigh", abbreviation: "LEH", seed: 16, region: "south", record: "First Four", espn_id: "2329" },
  { name: "Prairie View A&M", abbreviation: "PVAM", seed: 16, region: "south", record: "First Four", espn_id: "2504" },
  { name: "Clemson", abbreviation: "CLEM", seed: 8, region: "south", record: "24-10", espn_id: "228" },
  { name: "Iowa", abbreviation: "IOWA", seed: 9, region: "south", record: "21-12", espn_id: "2294" },
  { name: "Vanderbilt", abbreviation: "VAN", seed: 5, region: "south", record: "26-8", espn_id: "238" },
  { name: "McNeese", abbreviation: "MCN", seed: 12, region: "south", record: "28-5", espn_id: "2377" },
  { name: "Nebraska", abbreviation: "NEB", seed: 4, region: "south", record: "26-6", espn_id: "158" },
  { name: "Troy", abbreviation: "TROY", seed: 13, region: "south", record: "22-11", espn_id: "2653" },
  { name: "North Carolina", abbreviation: "UNC", seed: 6, region: "south", record: "24-8", espn_id: "153" },
  { name: "VCU", abbreviation: "VCU", seed: 11, region: "south", record: "27-7", espn_id: "2670" },
  { name: "Illinois", abbreviation: "ILL", seed: 3, region: "south", record: "24-8", espn_id: "356" },
  { name: "Penn", abbreviation: "PENN", seed: 14, region: "south", record: "18-11", espn_id: "219" },
  { name: "Saint Mary's", abbreviation: "SMC", seed: 7, region: "south", record: "27-5", espn_id: "2608" },
  { name: "Texas A&M", abbreviation: "TAMU", seed: 10, region: "south", record: "21-11", espn_id: "245" },
  { name: "Houston", abbreviation: "HOU", seed: 2, region: "south", record: "28-6", espn_id: "248" },
  { name: "Idaho", abbreviation: "IDHO", seed: 15, region: "south", record: "21-14", espn_id: "70" },

  // MIDWEST
  { name: "Michigan", abbreviation: "MICH", seed: 1, region: "midwest", record: "31-3", espn_id: "130" },
  // Howard and UMBC are First Four
  { name: "Howard", abbreviation: "HOW", seed: 16, region: "midwest", record: "First Four", espn_id: "47" },
  { name: "UMBC", abbreviation: "UMBC", seed: 16, region: "midwest", record: "First Four", espn_id: "2378" },
  { name: "Georgia", abbreviation: "UGA", seed: 8, region: "midwest", record: "22-10", espn_id: "61" },
  { name: "Saint Louis", abbreviation: "SLU", seed: 9, region: "midwest", record: "28-5", espn_id: "139" },
  { name: "Texas Tech", abbreviation: "TTU", seed: 5, region: "midwest", record: "22-10", espn_id: "2641" },
  { name: "Akron", abbreviation: "AKR", seed: 12, region: "midwest", record: "29-5", espn_id: "2006" },
  { name: "Alabama", abbreviation: "BAMA", seed: 4, region: "midwest", record: "23-9", espn_id: "333" },
  { name: "Hofstra", abbreviation: "HOF", seed: 13, region: "midwest", record: "24-10", espn_id: "2275" },
  { name: "Tennessee", abbreviation: "TENN", seed: 6, region: "midwest", record: "22-11", espn_id: "2633" },
  // SMU and Miami Ohio are First Four
  { name: "SMU", abbreviation: "SMU", seed: 11, region: "midwest", record: "First Four", espn_id: "2567" },
  { name: "Miami Ohio", abbreviation: "M-OH", seed: 11, region: "midwest", record: "First Four", espn_id: "193" },
  { name: "Virginia", abbreviation: "UVA", seed: 3, region: "midwest", record: "29-5", espn_id: "258" },
  { name: "Wright St.", abbreviation: "WRST", seed: 14, region: "midwest", record: "23-11", espn_id: "2750" },
  { name: "Kentucky", abbreviation: "UK", seed: 7, region: "midwest", record: "21-13", espn_id: "96" },
  { name: "Santa Clara", abbreviation: "SCU", seed: 10, region: "midwest", record: "26-8", espn_id: "2541" },
  { name: "Iowa St.", abbreviation: "ISU", seed: 2, region: "midwest", record: "27-7", espn_id: "66" },
  { name: "Tennessee St.", abbreviation: "TNST", seed: 15, region: "midwest", record: "23-9", espn_id: "2634" },
];

// Game slot structure for a 68-team bracket
// First Four: slots 1-4
// First Round: slots 5-36 (32 games)
// Second Round: slots 37-52 (16 games)
// Sweet 16: slots 53-60 (8 games)
// Elite Eight: slots 61-64 (4 games)
// Final Four: slots 65-66 (2 games)
// Championship: slot 67

interface GameSeed {
  game_slot: number;
  round: string;
  region: string | null;
  next_game_slot: number | null;
  slot_position: string | null;
  scheduled_at: string | null;
}

function buildGameSlots(): GameSeed[] {
  const games: GameSeed[] = [];

  // First Four (slots 1-4)
  const firstFourSchedule = [
    { slot: 1, region: "midwest", next: 29, pos: "bottom", date: "2026-03-17T18:00:00Z" }, // Howard vs UMBC → Midwest 1v16
    { slot: 2, region: "south", next: 21, pos: "bottom", date: "2026-03-17T20:30:00Z" },  // Lehigh vs Prairie View → South 1v16
    { slot: 3, region: "west", next: 17, pos: "bottom", date: "2026-03-18T18:00:00Z" },   // Texas vs NC State → West 6v11
    { slot: 4, region: "midwest", next: 33, pos: "bottom", date: "2026-03-18T20:30:00Z" },// SMU vs Miami Ohio → Midwest 6v11
  ];

  for (const ff of firstFourSchedule) {
    games.push({
      game_slot: ff.slot,
      round: "first_four",
      region: ff.region,
      next_game_slot: ff.next,
      slot_position: ff.pos,
      scheduled_at: ff.date,
    });
  }

  // First Round (slots 5-36, 8 games per region)
  const regions = ["east", "west", "south", "midwest"];
  let slot = 5;
  for (let r = 0; r < 4; r++) {
    for (let g = 0; g < 8; g++) {
      const secondRoundSlot = 37 + r * 4 + Math.floor(g / 2);
      games.push({
        game_slot: slot,
        round: "first_round",
        region: regions[r],
        next_game_slot: secondRoundSlot,
        slot_position: g % 2 === 0 ? "top" : "bottom",
        scheduled_at: g < 4 ? "2026-03-19T12:00:00Z" : "2026-03-20T12:00:00Z",
      });
      slot++;
    }
  }

  // Second Round (slots 37-52, 4 games per region)
  for (let r = 0; r < 4; r++) {
    for (let g = 0; g < 4; g++) {
      const sweet16Slot = 53 + r * 2 + Math.floor(g / 2);
      games.push({
        game_slot: slot,
        round: "second_round",
        region: regions[r],
        next_game_slot: sweet16Slot,
        slot_position: g % 2 === 0 ? "top" : "bottom",
        scheduled_at: g < 2 ? "2026-03-21T12:00:00Z" : "2026-03-22T12:00:00Z",
      });
      slot++;
    }
  }

  // Sweet 16 (slots 53-60, 2 games per region)
  for (let r = 0; r < 4; r++) {
    for (let g = 0; g < 2; g++) {
      const eliteSlot = 61 + r;
      games.push({
        game_slot: slot,
        round: "sweet_16",
        region: regions[r],
        next_game_slot: eliteSlot,
        slot_position: g === 0 ? "top" : "bottom",
        scheduled_at: r < 2 ? "2026-03-26T19:00:00Z" : "2026-03-27T19:00:00Z",
      });
      slot++;
    }
  }

  // Elite Eight (slots 61-64, 1 game per region)
  // 2026 Final Four pairings: East vs South (slot 65), West vs Midwest (slot 66)
  const eliteToFinalFour: Record<number, { next: number; pos: string }> = {
    0: { next: 65, pos: "top" },    // east -> 65 top
    1: { next: 66, pos: "top" },    // west -> 66 top
    2: { next: 65, pos: "bottom" }, // south -> 65 bottom
    3: { next: 66, pos: "bottom" }, // midwest -> 66 bottom
  };
  for (let r = 0; r < 4; r++) {
    const mapping = eliteToFinalFour[r];
    games.push({
      game_slot: slot,
      round: "elite_eight",
      region: regions[r],
      next_game_slot: mapping.next,
      slot_position: mapping.pos,
      scheduled_at: r < 2 ? "2026-03-28T18:00:00Z" : "2026-03-29T18:00:00Z",
    });
    slot++;
  }

  // Final Four (slots 65-66)
  games.push({
    game_slot: slot,
    round: "final_four",
    region: null,
    next_game_slot: 67,
    slot_position: "top",
    scheduled_at: "2026-04-04T18:00:00Z",
  });
  slot++;
  games.push({
    game_slot: slot,
    round: "final_four",
    region: null,
    next_game_slot: 67,
    slot_position: "bottom",
    scheduled_at: "2026-04-04T20:30:00Z",
  });
  slot++;

  // Championship (slot 67)
  games.push({
    game_slot: slot,
    round: "championship",
    region: null,
    next_game_slot: null,
    slot_position: null,
    scheduled_at: "2026-04-06T21:00:00Z",
  });

  return games;
}

async function seed() {
  console.log("Seeding database...");

  // Insert teams (with ESPN logo URLs)
  const teamsWithLogos = teams.map((t) => ({
    ...t,
    logo_url: t.espn_id
      ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.espn_id}.png`
      : null,
  }));
  console.log(`Inserting ${teamsWithLogos.length} teams...`);
  const { error: teamsError } = await supabase.from("teams").insert(teamsWithLogos);
  if (teamsError) {
    console.error("Error inserting teams:", teamsError);
    return;
  }

  // Fetch teams back to get IDs
  const { data: dbTeams } = await supabase.from("teams").select("*");
  if (!dbTeams) {
    console.error("Failed to fetch teams");
    return;
  }

  // Build team lookup by region+seed+name
  const teamLookup = new Map<string, number>();
  for (const t of dbTeams) {
    teamLookup.set(`${t.region}-${t.seed}-${t.name}`, t.id);
  }

  // Insert game slots
  const gameSlots = buildGameSlots();
  console.log(`Inserting ${gameSlots.length} game slots...`);

  // Assign initial teams to First Round matchups
  // Standard bracket seeding: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
  const seedMatchups = [
    [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15],
  ];

  const gamesWithTeams = gameSlots.map((game) => {
    const result: Record<string, unknown> = { ...game };

    if (game.round === "first_round" && game.region) {
      // Determine which matchup this is (0-7 within region)
      const regionGames = gameSlots.filter(
        (g) => g.round === "first_round" && g.region === game.region
      );
      const gameIndex = regionGames.indexOf(game);
      const matchup = seedMatchups[gameIndex];

      if (matchup) {
        // Find teams by region and seed
        const teamA = dbTeams.find(
          (t) =>
            t.region === game.region &&
            t.seed === matchup[0] &&
            t.record !== "First Four"
        );
        const teamB = dbTeams.find(
          (t) =>
            t.region === game.region &&
            t.seed === matchup[1] &&
            t.record !== "First Four"
        );

        if (teamA) result.team_a_id = teamA.id;
        if (teamB) result.team_b_id = teamB.id;
      }
    }

    // Assign First Four teams
    if (game.round === "first_four") {
      if (game.game_slot === 1) {
        // Howard vs UMBC (Midwest 16)
        const howard = dbTeams.find((t) => t.name === "Howard");
        const umbc = dbTeams.find((t) => t.name === "UMBC");
        if (howard) result.team_a_id = howard.id;
        if (umbc) result.team_b_id = umbc.id;
      } else if (game.game_slot === 2) {
        // Lehigh vs Prairie View A&M (South 16)
        const lehigh = dbTeams.find((t) => t.name === "Lehigh");
        const pvam = dbTeams.find((t) => t.name === "Prairie View A&M");
        if (lehigh) result.team_a_id = lehigh.id;
        if (pvam) result.team_b_id = pvam.id;
      } else if (game.game_slot === 3) {
        // Texas vs NC State (West 11)
        const texas = dbTeams.find((t) => t.name === "Texas");
        const ncstate = dbTeams.find((t) => t.name === "NC State");
        if (texas) result.team_a_id = texas.id;
        if (ncstate) result.team_b_id = ncstate.id;
      } else if (game.game_slot === 4) {
        // SMU vs Miami Ohio (Midwest 11)
        const smu = dbTeams.find((t) => t.name === "SMU");
        const miamiOH = dbTeams.find((t) => t.name === "Miami Ohio");
        if (smu) result.team_a_id = smu.id;
        if (miamiOH) result.team_b_id = miamiOH.id;
      }
    }

    return result;
  });

  const { error: gamesError } = await supabase
    .from("games")
    .insert(gamesWithTeams);
  if (gamesError) {
    console.error("Error inserting games:", gamesError);
    return;
  }

  // Insert tournament config
  console.log("Inserting tournament config...");
  const { error: configError } = await supabase
    .from("tournament_config")
    .insert({
      id: 1,
      year: 2026,
      bracket_lock_deadline: "2026-03-19T12:00:00Z",
      wager_creation_deadline: "2026-03-19T12:00:00Z",
      scoring_multipliers: {
        first_round: 10,
        second_round: 20,
        sweet_16: 40,
        elite_eight: 80,
        final_four: 160,
        championship: 320,
      },
      active_phase: "pre_tournament",
    });

  if (configError) {
    console.error("Error inserting config:", configError);
    return;
  }

  console.log("Seed complete!");
  console.log(`  - ${dbTeams.length} teams`);
  console.log(`  - ${gamesWithTeams.length} games`);
  console.log("  - 1 tournament config");
}

seed().catch(console.error);
