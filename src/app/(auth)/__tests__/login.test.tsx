import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import LoginPage from "../login/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText("your@email.com"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText("********"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    // Reset search params to default (no redirect param)
    mockSearchParams.delete("redirect");
  });

  it("renders email and password form fields", () => {
    render(<LoginPage />);

    expect(
      screen.getByPlaceholderText("your@email.com"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("********")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /log in/i }),
    ).toBeInTheDocument();
  });

  it("calls signInWithPassword with email and password", async () => {
    render(<LoginPage />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "user@test.com",
        password: "secret123",
      });
    });
  });

  it("redirects to the redirect search param on success", async () => {
    mockSearchParams.set("redirect", "/bracket/edit");

    render(<LoginPage />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/bracket/edit");
    });
  });

  it("shows error on authentication failure", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    render(<LoginPage />);
    fillAndSubmit("user@test.com", "wrong");

    await waitFor(() => {
      expect(
        screen.getByText("Invalid login credentials"),
      ).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows loading state during submission", async () => {
    let resolveSignIn!: (value: { error: null }) => void;
    mockSignInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );

    render(<LoginPage />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /logging in\.\.\./i }),
      ).toBeInTheDocument();
    });

    // Resolve to avoid act() warning
    resolveSignIn({ error: null });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it("passes correct redirectTo to Google OAuth", async () => {
    mockSearchParams.set("redirect", "/wagers");

    render(<LoginPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/callback?redirect=/wagers`,
        },
      });
    });
  });
});
