import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => mockSearchParams,
}));

const mockSignInEmail = vi.fn();
const mockSignInSocial = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
    signIn: {
      email: (...args: unknown[]) => mockSignInEmail(...args),
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
    signUp: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    updateUser: vi.fn(),
    changePassword: vi.fn(),
  },
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

import { LoginForm } from "../_components/LoginForm";

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
  fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInEmail.mockResolvedValue({ data: {}, error: null });
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });

    // Reset search params to default (no redirect / error param)
    mockSearchParams.delete("redirect");
    mockSearchParams.delete("error");
    mockSearchParams.delete("neon_auth_session_verifier");
  });

  it("renders email and password form fields", () => {
    render(<LoginForm />);

    expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^log in$/i })).toBeInTheDocument();
  });

  it("signs in with email and password", async () => {
    render(<LoginForm />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: "user@test.com",
        password: "secret123",
      });
    });
  });

  it("goes to the dashboard by default and refreshes the server layout", async () => {
    render(<LoginForm />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("redirects to the redirect search param on success", async () => {
    mockSearchParams.set("redirect", "/bracket/edit");

    render(<LoginForm />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/bracket/edit");
    });
  });

  it("ignores an unsafe redirect param", async () => {
    mockSearchParams.set("redirect", "https://evil.example/phish");

    render(<LoginForm />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows error on authentication failure", async () => {
    mockSignInEmail.mockResolvedValue({
      data: null,
      error: { message: "Invalid email or password" },
    });

    render(<LoginForm />);
    fillAndSubmit("user@test.com", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(mockPush).not.toHaveBeenCalled();
    // Re-enabled so the user can retry.
    expect(screen.getByRole("button", { name: /^log in$/i })).not.toBeDisabled();
  });

  it("shows loading state during submission", async () => {
    let resolveSignIn!: (value: { data: unknown; error: null }) => void;
    mockSignInEmail.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );

    render(<LoginForm />);
    fillAndSubmit("user@test.com", "secret123");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /logging in\.\.\./i })).toBeDisabled();
    });

    // Resolve to avoid act() warning
    resolveSignIn({ data: {}, error: null });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it("starts Google sign-in with a /callback URL that carries the redirect", async () => {
    mockSearchParams.set("redirect", "/wagers");

    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: `${window.location.origin}/callback?redirect=${encodeURIComponent("/wagers")}`,
      });
    });
    // On success the browser navigates away; the button stays disabled meanwhile.
    expect(screen.getByRole("button", { name: /redirecting to google/i })).toBeDisabled();
  });

  it("links every input to a label and links to forgot-password", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("EMAIL")).toHaveAttribute("id", "login-email");
    expect(screen.getByLabelText("PASSWORD")).toHaveAttribute("id", "login-password");
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute("href", "/signup");
  });

  it("toggles password visibility with an aria-pressed button", () => {
    render(<LoginForm />);
    const input = screen.getByPlaceholderText("Enter your password");
    const toggle = screen.getByRole("button", { name: /show password/i });

    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows the Google failure message from ?error=auth_failed", () => {
    mockSearchParams.set("error", "auth_failed");

    render(<LoginForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("Google sign-in failed — try again");
  });

  it("shows the Google failure message when the OAuth return lands here unexchanged", () => {
    mockSearchParams.set("neon_auth_session_verifier", "abc");
    render(<LoginForm />);
    expect(screen.getByText("Google sign-in failed — try again")).toBeInTheDocument();
  });

  it("surfaces OAuth errors and re-enables the Google button", async () => {
    mockSignInSocial.mockResolvedValue({
      data: null,
      error: { message: "Provider is not enabled" },
    });

    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provider is not enabled");
    expect(screen.getByRole("button", { name: /sign in with google/i })).not.toBeDisabled();
  });
});
