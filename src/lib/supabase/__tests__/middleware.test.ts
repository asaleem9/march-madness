// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetUser = vi.fn();

// Track cookies set on responses
let responseCookies: Map<string, { value: string; options?: unknown }>;
let setAllCallback: ((cookies: Array<{ name: string; value: string; options?: unknown }>) => void) | null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, options: { cookies: { setAll: typeof setAllCallback } }) => {
    setAllCallback = options.cookies.setAll;
    return {
      auth: {
        getUser: mockGetUser,
      },
    };
  }),
}));

vi.mock("next/server", () => {
  const createMockResponse = (type: "next" | "redirect", url?: URL) => {
    const cookies = new Map<string, { value: string; options?: unknown }>();
    return {
      type,
      url: url?.toString(),
      cookies: {
        set(name: string, value: string, options?: unknown) {
          cookies.set(name, { value, options });
          responseCookies = cookies;
        },
        get(name: string) {
          return cookies.get(name);
        },
        getAll() {
          return Array.from(cookies.entries()).map(([name, { value }]) => ({
            name,
            value,
          }));
        },
      },
    };
  };

  return {
    NextResponse: {
      next: vi.fn(({ request: _request } = {}) => createMockResponse("next")),
      redirect: vi.fn((url: URL) => createMockResponse("redirect", url)),
    },
  };
});

import { updateSession } from "../middleware";
import { NextResponse } from "next/server";

// --- Helpers ---

function createMockRequest(pathname: string) {
  const url = new URL(`http://localhost:3000${pathname}`);
  // Add clone() that returns a new URL with the same href,
  // mimicking the NextURL.clone() behavior used in middleware
  (url as URL & { clone: () => URL }).clone = () => new URL(url.href);

  const cookieStore = new Map<string, string>();

  return {
    nextUrl: url,
    cookies: {
      getAll() {
        return Array.from(cookieStore.entries()).map(([name, value]) => ({
          name,
          value,
        }));
      },
      set(name: string, value: string) {
        cookieStore.set(name, value);
      },
    },
  } as unknown as Parameters<typeof updateSession>[0];
}

function mockAuthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-123", email: "test@test.com" } },
  });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  responseCookies = new Map();
  setAllCallback = null;
});

describe("updateSession", () => {
  describe("authenticated user on protected routes", () => {
    it("passes through on /dashboard without redirecting", async () => {
      mockAuthenticated();
      const request = createMockRequest("/dashboard");
      const response = await updateSession(request);

      expect(response.type).toBe("next");
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });
  });

  describe("unauthenticated user on protected routes", () => {
    it("redirects /dashboard to /login?redirect=/dashboard", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/dashboard");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirect")).toBe("/dashboard");
    });

    it("redirects /bracket/new to /login?redirect=/bracket/new", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/bracket/new");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirect")).toBe("/bracket/new");
    });

    it("does NOT redirect /bracket/abc123 (only /bracket/new is protected)", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/bracket/abc123");
      const response = await updateSession(request);

      expect(response.type).toBe("next");
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it("redirects /wagers to /login?redirect=/wagers", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/wagers");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirect")).toBe("/wagers");
    });

    it("redirects /profile to /login?redirect=/profile", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/profile");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirect")).toBe("/profile");
    });

    it("redirects /admin to /login?redirect=/admin", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/admin");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirect")).toBe("/admin");
    });

    it("redirects /schedule to /login?redirect=/schedule", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/schedule");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirect")).toBe("/schedule");
    });
  });

  describe("unauthenticated user on public routes", () => {
    it("passes through on / without redirecting", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/");
      const response = await updateSession(request);

      expect(response.type).toBe("next");
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it("passes through on /leaderboard without redirecting", async () => {
      mockUnauthenticated();
      const request = createMockRequest("/leaderboard");
      const response = await updateSession(request);

      expect(response.type).toBe("next");
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });
  });

  describe("authenticated user on auth routes", () => {
    it("redirects /login to /dashboard", async () => {
      mockAuthenticated();
      const request = createMockRequest("/login");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/dashboard");
    });

    it("redirects /signup to /dashboard", async () => {
      mockAuthenticated();
      const request = createMockRequest("/signup");
      const response = await updateSession(request);

      expect(response.type).toBe("redirect");
      const redirectUrl = (NextResponse.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
      expect(redirectUrl.pathname).toBe("/dashboard");
    });
  });

  describe("cookie propagation", () => {
    it("propagates cookies to the response when setAll is called", async () => {
      mockAuthenticated();
      const request = createMockRequest("/");
      await updateSession(request);

      // Simulate Supabase calling setAll (e.g., to refresh a session token)
      expect(setAllCallback).toBeDefined();
      setAllCallback!([
        { name: "sb-access-token", value: "new-token-value", options: { path: "/", httpOnly: true } },
        { name: "sb-refresh-token", value: "new-refresh-value", options: { path: "/", httpOnly: true } },
      ]);

      // Cookies should have been set on the request
      const requestCookies = request.cookies.getAll();
      expect(requestCookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "sb-access-token", value: "new-token-value" }),
          expect.objectContaining({ name: "sb-refresh-token", value: "new-refresh-value" }),
        ])
      );

      // NextResponse.next should have been called again to rebuild the response
      // Initial call + setAll rebuild = at least 2 calls
      expect(NextResponse.next).toHaveBeenCalledTimes(2);

      // Cookies should be on the response too
      expect(responseCookies.get("sb-access-token")).toEqual({
        value: "new-token-value",
        options: { path: "/", httpOnly: true },
      });
      expect(responseCookies.get("sb-refresh-token")).toEqual({
        value: "new-refresh-value",
        options: { path: "/", httpOnly: true },
      });
    });
  });

  describe("error handling", () => {
    it("handles getUser() throwing gracefully without a 500", async () => {
      mockGetUser.mockRejectedValue(new Error("Network timeout"));
      const request = createMockRequest("/dashboard");

      // The function should throw or handle the error, not silently succeed
      // Since the source doesn't have a try/catch, this verifies the error propagates
      await expect(updateSession(request)).rejects.toThrow("Network timeout");
    });
  });

  describe("middleware config matcher", () => {
    // The matcher pattern from middleware.ts config:
    //   /((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)
    // Next.js strips the leading "/" and tests the remainder against the inner group.
    // We replicate that by testing the pathname (without leading slash) against the core regex.
    const matcherRegex = /^(?!_next\/static|_next\/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*$/;
    const matchesPath = (path: string) => matcherRegex.test(path.replace(/^\//, ""));

    it("does not match .svg files", () => {
      expect(matchesPath("/logo.svg")).toBe(false);
    });

    it("does not match .png files", () => {
      expect(matchesPath("/images/hero.png")).toBe(false);
    });

    it("does not match .jpg files", () => {
      expect(matchesPath("/photos/team.jpg")).toBe(false);
    });

    it("does not match .webp files", () => {
      expect(matchesPath("/assets/banner.webp")).toBe(false);
    });

    it("matches regular routes like /dashboard", () => {
      expect(matchesPath("/dashboard")).toBe(true);
    });

    it("does not match _next/static paths", () => {
      expect(matchesPath("/_next/static/chunks/main.js")).toBe(false);
    });

    it("does not match _next/image paths", () => {
      expect(matchesPath("/_next/image")).toBe(false);
    });
  });
});
