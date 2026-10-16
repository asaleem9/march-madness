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
const mockResend = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      resend: mockResend,
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
  fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
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
    mockResend.mockResolvedValue({ error: null });

    // Reset search params to default (no redirect / error param)
    mockSearchParams.delete("redirect");
    mockSearchParams.delete("error");
  });

  it("renders email and password form fields", () => {
    render(<LoginPage />);

    expect(
      screen.getByPlaceholderText("your@email.com"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
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
          redirectTo: `${window.location.origin}/callback?redirect=${encodeURIComponent("/wagers")}`,
        },
      });
    });
  });

  it("links every input to a label and links to forgot-password", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("EMAIL")).toHaveAttribute("id", "login-email");
    expect(screen.getByLabelText("PASSWORD")).toHaveAttribute("id", "login-password");
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("toggles password visibility with an aria-pressed button", () => {
    render(<LoginPage />);
    const input = screen.getByPlaceholderText("Enter your password");
    const toggle = screen.getByRole("button", { name: /show password/i });

    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the Google failure message from ?error=auth_failed", () => {
    mockSearchParams.set("error", "auth_failed");

    render(<LoginPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google sign-in failed — try again",
    );
  });

  it("disables the Google button while redirecting and surfaces OAuth errors", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      error: { message: "Provider is not enabled" },
    });

    render(<LoginPage />);
    const google = screen.getByRole("button", { name: /sign in with google/i });
    fireEvent.click(google);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Provider is not enabled");
    });
    // Re-enabled after the failure so the user can retry.
    expect(screen.getByRole("button", { name: /sign in with google/i })).not.toBeDisabled();
  });

  it("offers to resend the confirmation email when the account is not confirmed", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Email not confirmed" },
    });

    render(<LoginPage />);
    fillAndSubmit("new@test.com", "secret123");

    const resend = await screen.findByRole("button", { name: /resend email/i });
    fireEvent.click(resend);

    await waitFor(() => {
      expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "new@test.com" });
    });
    // Cooldown kicks in after a successful resend.
    expect(
      await screen.findByRole("button", { name: /resend in 60s/i }),
    ).toBeDisabled();
  });

  it("does not show the resend button for other login errors", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    render(<LoginPage />);
    fillAndSubmit("user@test.com", "wrong");

    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /resend/i })).not.toBeInTheDocument();
  });
});
