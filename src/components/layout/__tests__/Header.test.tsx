import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Header } from "../Header";

// --- Mocks ---

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// next/image's real loader throws on relative src under jsdom — render a plain img.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const mockUseSession = vi.fn();
const mockSignOut = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const user = { id: "user-1", email: "test@example.com", name: "Test", image: null };
const session = (u: typeof user | null) => ({
  data: u ? { user: u } : null,
  isPending: false,
});

// --- Tests ---

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({});
    mockUseSession.mockReturnValue(session(null));
  });

  it("shows Sign Up / Log In when no user", () => {
    render(<Header />);

    expect(screen.getByText("Log In")).toBeInTheDocument();
    expect(screen.getByText("Sign Up")).toBeInTheDocument();
    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    // Public pages stay reachable when logged out.
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
  });

  it("shows nav links and Sign Out when authenticated", () => {
    mockUseSession.mockReturnValue(session(user));
    render(<Header initialUser={user} />);

    expect(screen.getByText("Sign Out")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Bracket")).toBeInTheDocument();
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Wagers")).toBeInTheDocument();
    expect(screen.queryByText("Log In")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign Up")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("renders the server-seeded user while the browser session is still loading", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    render(<Header initialUser={user} />);
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
    expect(screen.queryByText("Log In")).not.toBeInTheDocument();
  });

  it("follows the browser session once it has loaded", () => {
    // Server said logged in, but the session has since gone away.
    mockUseSession.mockReturnValue(session(null));
    render(<Header initialUser={user} />);
    expect(screen.getByText("Log In")).toBeInTheDocument();
    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
  });

  it("shows the Admin link only for admins", () => {
    mockUseSession.mockReturnValue(session(user));
    render(<Header initialUser={user} isAdmin />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("Sign Out asks for confirmation, then signs out and goes home", async () => {
    mockUseSession.mockReturnValue(session(user));
    render(<Header initialUser={user} />);

    // Signing out asks for confirmation first so a stray tap can't log you out.
    fireEvent.click(screen.getByText("Sign Out"));
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("No"));
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Sign Out"));
    fireEvent.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("opens the mobile drawer with the member links", () => {
    mockUseSession.mockReturnValue(session(user));
    render(<Header initialUser={user} />);

    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    const drawer = document.getElementById("mobile-nav");
    expect(drawer).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getAllByText("Profile")).toHaveLength(2);
  });
});
