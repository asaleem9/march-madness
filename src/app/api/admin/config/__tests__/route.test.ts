// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Must use vi.hoisted so the env var is set BEFORE the route module evaluates
// its top-level `const adminEmails = process.env.ADMIN_EMAILS...`
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "admin@test.com,other@admin.com";
});

// --- Mocks ---

const mockGetUser = vi.fn();
const mockAdminSelect = vi.fn();
const mockAdminUpdate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "tournament_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockAdminSelect,
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => mockAdminUpdate()),
          })),
        };
      }
      return {};
    }),
  })),
}));

// --- Import after mocks and env setup ---

import { GET, PUT } from "../route";

// --- Helpers ---

function mockAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "admin@test.com" } },
  });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-2", email: "normie@test.com" } },
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/config", () => {
  it("returns 403 for non-admin users", async () => {
    mockNonAdmin();

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("returns tournament config for admin users", async () => {
    mockAdmin();
    const configData = {
      id: 1,
      bracket_lock_date: "2026-03-17T00:00:00Z",
      tournament_start_date: "2026-03-17",
      scoring_multipliers: { first_round: 10 },
    };
    mockAdminSelect.mockResolvedValue({ data: configData });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(configData);
  });
});

describe("PUT /api/admin/config", () => {
  it("returns 403 for non-admin users", async () => {
    mockNonAdmin();

    const request = new NextRequest("http://localhost:3000/api/admin/config", {
      method: "PUT",
      body: JSON.stringify({ bracket_lock_date: "2026-03-20T00:00:00Z" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("updates config and returns success for admin users", async () => {
    mockAdmin();
    mockAdminUpdate.mockResolvedValue({ error: null });

    const request = new NextRequest("http://localhost:3000/api/admin/config", {
      method: "PUT",
      body: JSON.stringify({ bracket_lock_date: "2026-03-20T00:00:00Z" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
