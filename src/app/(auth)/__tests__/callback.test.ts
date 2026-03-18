// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() keeps references accessible inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockExchangeCodeForSession } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("exchanges code for session and redirects to the redirect param", async () => {
    const request = buildRequest({
      code: "abc123",
      redirect: "/bracket/edit",
    });

    await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/bracket/edit",
    );
  });

  it("redirects to /dashboard when no redirect param is provided", async () => {
    const request = buildRequest({ code: "abc123" });

    await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/dashboard",
    );
  });

  it("redirects to /login?error=auth_failed when code exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid code" },
    });

    const request = buildRequest({ code: "bad-code", redirect: "/dashboard" });

    await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("bad-code");
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/login?error=auth_failed",
    );
  });

  it("redirects to /login?error=auth_failed when no code param is present", async () => {
    const request = buildRequest({});

    await GET(request);

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/login?error=auth_failed",
    );
  });
});
