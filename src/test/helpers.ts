import { vi } from "vitest";
import type {
  Team,
  GameWithTeams,
  BracketPick,
  Region,
  Round,
  GameStatus,
} from "@/types";

// ─── NextRequest Builder ────────────────────────────────────────────
export function mockNextRequest(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    cookies?: Record<string, string>;
  }
) {
  const fullUrl = url.startsWith("http") ? url : `http://localhost:3000${url}`;
  const nextUrl = new URL(fullUrl);

  const cookieStore = new Map<string, { name: string; value: string }>();
  if (init?.cookies) {
    for (const [name, value] of Object.entries(init.cookies)) {
      cookieStore.set(name, { name, value });
    }
  }

  return {
    method: init?.method || "GET",
    url: fullUrl,
    nextUrl,
    headers: new Headers(init?.headers),
    cookies: {
      getAll: () => Array.from(cookieStore.values()),
      get: (name: string) => cookieStore.get(name),
      set: (name: string, value: string) =>
        cookieStore.set(name, { name, value }),
      delete: (name: string) => cookieStore.delete(name),
    },
    json: vi.fn().mockResolvedValue(init?.body || {}),
  };
}

// ─── Fixture Builders ───────────────────────────────────────────────
let teamIdCounter = 1;

export function mockTeam(overrides: Partial<Team> = {}): Team {
  const id = overrides.id ?? teamIdCounter++;
  return {
    id,
    name: `Team ${id}`,
    abbreviation: `T${id}`,
    seed: 1,
    region: "east" as Region,
    record: "30-5",
    logoUrl: null,
    eliminated: false,
    espnId: `espn-${id}`,
    ...overrides,
  };
}

export function mockGame(overrides: Partial<GameWithTeams> = {}): GameWithTeams {
  const teamA = overrides.teamA ?? mockTeam({ seed: 1 });
  const teamB = overrides.teamB ?? mockTeam({ seed: 16 });
  return {
    id: 1,
    round: "first_round" as Round,
    region: "east" as Region,
    gameSlot: 5,
    nextGameSlot: 37,
    slotPosition: "top",
    teamAId: teamA?.id ?? null,
    teamBId: teamB?.id ?? null,
    winnerId: null,
    scoreA: null,
    scoreB: null,
    scheduledAt: null,
    status: "scheduled" as GameStatus,
    espnGameId: null,
    teamA,
    teamB,
    winner: null,
    ...overrides,
  };
}

export function mockBracketPick(
  overrides: Partial<BracketPick> = {}
): BracketPick {
  return {
    id: 1,
    bracketId: "bracket-123",
    gameSlot: 5,
    round: "first_round" as Round,
    pickedTeamId: 1,
    isCorrect: null,
    pointsEarned: 0,
    ...overrides,
  };
}

export function mockPicks(count: number): { game_slot: number; round: string; picked_team_id: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    game_slot: i + 5,
    round: "first_round",
    picked_team_id: i + 1,
  }));
}

// ─── Reset Counter ──────────────────────────────────────────────────
export function resetFixtures() {
  teamIdCounter = 1;
}
