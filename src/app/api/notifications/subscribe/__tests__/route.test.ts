// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      upsert: mockUpsert,
    })),
  })),
}));

// --- Import after mocks ---

import { POST } from "../route";

// --- Helpers ---

function createSubscriptionRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/notifications/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/notifications/subscribe", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = createSubscriptionRequest({
      endpoint: "https://push.example.com/sub/123",
      keys: { p256dh: "key1", auth: "key2" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts subscription and returns success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-abc" } },
    });
    mockUpsert.mockResolvedValue({ error: null });

    const subscription = {
      endpoint: "https://push.example.com/sub/456",
      keys: { p256dh: "pubkey", auth: "authkey" },
    };
    const request = createSubscriptionRequest(subscription);

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-abc",
        endpoint: "https://push.example.com/sub/456",
        keys: { p256dh: "pubkey", auth: "authkey" },
      },
      { onConflict: "user_id" }
    );
  });

  it("returns 500 when database upsert fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-abc" } },
    });
    mockUpsert.mockResolvedValue({
      error: { message: "duplicate key violates unique constraint" },
    });

    const request = createSubscriptionRequest({
      endpoint: "https://push.example.com/sub/789",
      keys: { p256dh: "k1", auth: "k2" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Something went wrong. Please try again.");
  });
});
