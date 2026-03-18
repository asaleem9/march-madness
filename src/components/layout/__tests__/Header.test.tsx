import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Header } from "../Header";

// --- Mocks ---

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockSignOut = vi.fn().mockResolvedValue({});
let mockUser: { id: string; email: string } | null = null;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser } }),
      onAuthStateChange: (_callback: unknown) => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: mockSignOut,
    },
  }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// --- Tests ---

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it("shows Sign Up / Log In when no user", async () => {
    mockUser = null;

    await act(async () => {
      render(<Header />);
    });

    await waitFor(() => {
      expect(screen.getByText("Log In")).toBeInTheDocument();
      expect(screen.getByText("Sign Up")).toBeInTheDocument();
    });

    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows nav links and Sign Out when authenticated", async () => {
    mockUser = { id: "user-1", email: "test@example.com" };

    await act(async () => {
      render(<Header />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sign Out")).toBeInTheDocument();
    });

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Bracket")).toBeInTheDocument();
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Wagers")).toBeInTheDocument();
    expect(screen.queryByText("Log In")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign Up")).not.toBeInTheDocument();
  });

  it("Sign Out calls signOut and redirects", async () => {
    mockUser = { id: "user-1", email: "test@example.com" };

    // Mock window.location by defining a writable href
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, href: "" },
    });

    await act(async () => {
      render(<Header />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sign Out")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Sign Out"));
    });

    expect(mockSignOut).toHaveBeenCalled();

    await waitFor(() => {
      expect(window.location.href).toBe("/");
    });

    // Restore
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });
});
