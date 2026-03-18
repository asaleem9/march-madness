import { vi } from "vitest";
import type {
  Team,
  GameWithTeams,
  BracketPick,
  Region,
  Round,
  GameStatus,
} from "@/types";

// ─── Mock User ──────────────────────────────────────────────────────
export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-123",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: { display_name: "TestUser" },
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Chainable Supabase Mock ────────────────────────────────────────
// Mimics the `.from().select().eq().single()` chaining pattern.
// Call `mockSupabaseClient()` then set `.result` to control return values.

interface MockQueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

export function createMockQueryBuilder(defaultResult?: MockQueryResult) {
  const result: MockQueryResult = defaultResult || { data: null, error: null };

  const builder: Record<string, unknown> = {};
  const chainMethods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "in",
    "is",
    "not",
    "gte",
    "lte",
    "gt",
    "lt",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
    "filter",
    "match",
    "or",
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods return the result
  builder.single = vi.fn().mockResolvedValue(result);
  builder.then = undefined; // Make it thenable when awaited directly
  Object.defineProperty(builder, "then", {
    get() {
      return (resolve: (val: MockQueryResult) => void) => resolve(result);
    },
    configurable: true,
  });

  // Allow overriding the result
  (builder as Record<string, unknown>)._result = result;
  (builder as Record<string, unknown>)._setResult = (r: MockQueryResult) => {
    Object.assign(result, r);
  };

  return builder;
}

export function mockSupabaseClient(options?: {
  user?: ReturnType<typeof mockUser> | null;
  getUserError?: Error | null;
}) {
  const queryBuilders = new Map<string, ReturnType<typeof createMockQueryBuilder>>();

  const getOrCreateBuilder = (table: string) => {
    if (!queryBuilders.has(table)) {
      queryBuilders.set(table, createMockQueryBuilder());
    }
    return queryBuilders.get(table)!;
  };

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options?.user ?? null },
        error: options?.getUserError ?? null,
      }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: options?.user ?? null },
          error: null,
        }),
      },
    },
    from: vi.fn((table: string) => getOrCreateBuilder(table)),
    _builders: queryBuilders,
    _getBuilder: getOrCreateBuilder,
  };

  return client;
}

export function mockAdminClient() {
  return mockSupabaseClient();
}

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
