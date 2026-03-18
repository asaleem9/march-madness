import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockGet = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGet }),
}));

const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

// next/link: render a plain <a> so we can assert on it without router context
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

import SignupPage from "../signup/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillAndSubmitForm() {
  fireEvent.change(screen.getByPlaceholderText("BracketKing42"), {
    target: { value: "TestUser" },
  });
  fireEvent.change(screen.getByPlaceholderText("your@email.com"), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("Min. 6 characters"), {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null); // no redirect param by default
    mockSignUp.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it("renders form fields for display name, email, and password", () => {
    render(<SignupPage />);

    expect(
      screen.getByPlaceholderText("BracketKing42"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("your@email.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Min. 6 characters"),
    ).toBeInTheDocument();
  });

  it("shows error when password is shorter than 6 characters", async () => {
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText("BracketKing42"), {
      target: { value: "Player1" },
    });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Min. 6 characters"), {
      target: { value: "short" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 6 characters"),
      ).toBeInTheDocument();
    });

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("calls signUp with email, password, and display_name", async () => {
    render(<SignupPage />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
        options: { data: { display_name: "TestUser" } },
      });
    });
  });

  it("shows error message when signUp fails", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null },
      error: { message: "Email already registered" },
    });

    render(<SignupPage />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(
        screen.getByText("Email already registered"),
      ).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("redirects to /dashboard on successful signup with session", async () => {
    render(<SignupPage />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("redirects to custom redirect param on successful signup with session", async () => {
    mockGet.mockReturnValue("/bracket/my-bracket");

    render(<SignupPage />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/bracket/my-bracket");
    });
  });

  it("shows check-your-email message when signup returns no session", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<SignupPage />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(
        screen.getByText("CHECK YOUR EMAIL"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/confirmation link/i),
    ).toBeInTheDocument();

    // Should NOT have redirected
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows loading state during submission", async () => {
    // Keep signUp hanging so we can observe the loading state
    let resolveSignUp!: (value: { data: { session: { access_token: string } }; error: null }) => void;
    mockSignUp.mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve;
      }),
    );

    render(<SignupPage />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /creating account\.\.\./i }),
      ).toBeInTheDocument();
    });

    // Resolve to avoid act() warning
    resolveSignUp({ data: { session: { access_token: "tok" } }, error: null });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it("calls signInWithOAuth with default redirect when no param", async () => {
    render(<SignupPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /sign up with google/i }),
    );

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/callback?redirect=/dashboard`,
        },
      });
    });
  });

  it("calls signInWithOAuth with custom redirect param", async () => {
    mockGet.mockReturnValue("/wagers");

    render(<SignupPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /sign up with google/i }),
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
