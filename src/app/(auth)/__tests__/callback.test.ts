// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() keeps references accessible inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

// Mock NextResponse.redirect to capture the URL instead of actually redirecting
vi.mock("next/server", () => ({
  NextResponse: {
    redirect: vi.fn((url: string | URL) => ({
      type: "redirect",
      url: url.toString(),
    })),
  },
}));

import { GET } from "../callback/route";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

const user = { id: "u1", email: "user@test.com", name: "User", image: null };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(user);
  });

  it("sends a signed-in user on to the redirect param", async () => {
    await GET(buildRequest({ redirect: "/bracket/edit" }));

    expect(mockGetCurrentUser).toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalledWith("http://localhost:3000/bracket/edit");
  });

  it("redirects to /dashboard when no redirect param is provided", async () => {
    await GET(buildRequest({}));

    expect(NextResponse.redirect).toHaveBeenCalledWith("http://localhost:3000/dashboard");
  });

  it("ignores an unsafe redirect param", async () => {
    await GET(buildRequest({ redirect: "https://evil.example/phish" }));

    expect(NextResponse.redirect).toHaveBeenCalledWith("http://localhost:3000/dashboard");
  });

  it("redirects to /login?error=auth_failed when there is no session", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET(buildRequest({ redirect: "/dashboard" }));

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/login?error=auth_failed"
    );
  });
});
