// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { bracketPicks, brackets, games, teams, tournamentConfig } from "@/db/schema";
import { seedProfile, seedUserId, type TestDb } from "@/test/db";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: await createTestDb() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/tournament", () => ({ getTournamentConfig: vi.fn() }));
vi.mock("@/components/schedule/ScheduleClient", () => ({
  ScheduleClient: (props: Record<string, unknown>) => <div data-props={JSON.stringify(props)} />,
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getTournamentConfig } from "@/lib/tournament";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";
import SchedulePage from "../page";

const USER = seedUserId(1);

/** The props the page handed to the (mocked) client component. */
function clientProps(tree: React.ReactElement): Record<string, unknown> {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.type === ScheduleClient && el.props) found.push(el.props);
    if (el.props?.children) walk(el.props.children);
  };
  walk(tree);
  return found[0];
}

beforeAll(async () => {
  await seedProfile(db as unknown as TestDb, { id: USER });
  await db.insert(tournamentConfig).values({
    id: 1,
    year: 2027,
    bracketLockDeadline: new Date("2027-03-18T16:00:00Z"),
    wagerCreationDeadline: new Date("2027-03-18T16:00:00Z"),
    lastScoreUpdateAt: new Date("2027-03-19T01:00:00Z"),
  });
  const [duke, unc] = await db
    .insert(teams)
    .values([
      { name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", logoUrl: "https://x/duke.png" },
      { name: "UNC", abbreviation: "UNC", seed: 16, region: "east" },
    ])
    .returning();
  await db.insert(games).values([
    // Undated game first in slot order; it must sort last.
    { gameSlot: 13, round: "first_round", region: "east", teamAId: null, teamBId: null },
    {
      gameSlot: 14,
      round: "first_round",
      region: "east",
      teamAId: duke.id,
      teamBId: unc.id,
      scheduledAt: new Date("2027-03-19T17:00:00Z"),
      status: "final",
      scoreA: 80,
      scoreB: 60,
      winnerId: duke.id,
      clock: "0:00",
      period: 2,
    },
    { gameSlot: 15, round: "first_round", region: "east", scheduledAt: new Date("2027-03-19T15:00:00Z") },
  ]);
  const [bracket] = await db.insert(brackets).values({ userId: USER, name: "Mine" }).returning();
  await db
    .insert(bracketPicks)
    .values({ bracketId: bracket.id, gameSlot: 14, round: "first_round", pickedTeamId: duke.id });
  vi.mocked(getTournamentConfig).mockResolvedValue({
    id: 1,
    year: 2027,
    bracket_lock_deadline: "2027-03-18T16:00:00Z",
    wager_creation_deadline: "2027-03-18T16:00:00Z",
    scoring_multipliers: null,
    active_phase: "first_round",
    final_four_pairing: null,
    last_score_update_at: "2027-03-19T01:00:00.000Z",
  });
});

describe("SchedulePage", () => {
  it("orders games by tip time with undated games last and joins both teams", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const props = clientProps(await SchedulePage());
    const list = props.games as { game_slot: number; scheduled_at: string | null; team_a: unknown }[];
    expect(list.map((g) => g.game_slot)).toEqual([15, 14, 13]);
    expect(list[1].scheduled_at).toBe("2027-03-19T17:00:00.000Z");
    expect(list[1].team_a).toMatchObject({ name: "Duke", seed: 1, logo_url: "https://x/duke.png" });
    expect(list[1]).toMatchObject({ score_a: 80, score_b: 60, status: "final", clock: "0:00", period: 2 });
    expect(list[2].team_a).toBeNull();
    expect(props.isLoggedIn).toBe(false);
    expect(props.userPicks).toEqual({});
    expect(props.lastUpdatedAt).toBe("2027-03-19T01:00:00.000Z");
  });

  it("highlights the signed-in user's picks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: USER, email: "u@example.com", name: null, image: null });
    const props = clientProps(await SchedulePage());
    const duke = (props.games as { game_slot: number; team_a_id: number }[]).find((g) => g.game_slot === 14)!;
    expect(props.isLoggedIn).toBe(true);
    expect(props.userPicks).toEqual({ 14: duke.team_a_id });
  });
});
