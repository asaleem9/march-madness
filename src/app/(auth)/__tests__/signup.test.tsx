import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockGet = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => ({ get: mockGet }),
}));

const mockSignUpEmail = vi.fn();
const mockSignInSocial = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
    signIn: {
      email: vi.fn(),
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
    signUp: { email: (...args: unknown[]) => mockSignUpEmail(...args) },
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    updateUser: vi.fn(),
    changePassword: vi.fn(),
  },
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

import { SignupForm } from "../_components/SignupForm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillAndSubmitForm(password = "password123", confirm = password) {
  fireEvent.change(screen.getByPlaceholderText("BracketKing42"), {
    target: { value: "TestUser" },
  });
  fireEvent.change(screen.getByPlaceholderText("your@email.com"), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), {
    target: { value: password },
  });
  // Confirm password is a required field — leaving it empty makes jsdom's
  // form validation block submission, so fill it too.
  fireEvent.change(screen.getByPlaceholderText("Retype your password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SignupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null); // no redirect param by default
    mockSignUpEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
  });

  it("renders form fields for display name, email, and password", () => {
    render(<SignupForm />);

    expect(screen.getByPlaceholderText("BracketKing42")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Min. 8 characters")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Retype your password")).toBeInTheDocument();
  });

  it("shows error when password is shorter than 8 characters", async () => {
    render(<SignupForm />);
    fillAndSubmitForm("short");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters"
    );
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("renders a mismatch in a role=alert box without signing up", async () => {
    render(<SignupForm />);
    fillAndSubmitForm("abcdefgh", "abcdefgi");

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("signs up with email, password, and the display name as the account name", async () => {
    render(<SignupForm />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(mockSignUpEmail).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
        name: "TestUser",
      });
    });
  });

  it("shows error message when sign-up fails", async () => {
    mockSignUpEmail.mockResolvedValue({
      data: null,
      error: { message: "User already exists" },
    });

    render(<SignupForm />);
    fillAndSubmitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("User already exists");
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /create account/i })).not.toBeDisabled();
  });

  it("redirects to /dashboard after a successful signup (no email confirmation step)", async () => {
    render(<SignupForm />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.queryByText("CHECK YOUR EMAIL")).not.toBeInTheDocument();
  });

  it("redirects to the custom redirect param after signup", async () => {
    mockGet.mockReturnValue("/bracket/my-bracket");

    render(<SignupForm />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/bracket/my-bracket");
    });
  });

  it("shows loading state during submission", async () => {
    // Keep signUp hanging so we can observe the loading state
    let resolveSignUp!: (value: { data: unknown; error: null }) => void;
    mockSignUpEmail.mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve;
      })
    );

    render(<SignupForm />);
    fillAndSubmitForm();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /creating account\.\.\./i })).toBeDisabled();
    });

    // Resolve to avoid act() warning
    resolveSignUp({ data: {}, error: null });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it("starts Google sign-in with the default redirect when there is no param", async () => {
    render(<SignupForm />);

    fireEvent.click(screen.getByRole("button", { name: /sign up with google/i }));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: `${window.location.origin}/callback?redirect=${encodeURIComponent("/dashboard")}`,
      });
    });
  });

  it("starts Google sign-in with the custom redirect param", async () => {
    mockGet.mockReturnValue("/wagers");

    render(<SignupForm />);

    fireEvent.click(screen.getByRole("button", { name: /sign up with google/i }));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: `${window.location.origin}/callback?redirect=${encodeURIComponent("/wagers")}`,
      });
    });
  });

  it("pairs every input with a label and links to login", () => {
    render(<SignupForm />);

    expect(screen.getByLabelText("DISPLAY NAME")).toHaveAttribute("id", "signup-display-name");
    expect(screen.getByLabelText("EMAIL")).toHaveAttribute("id", "signup-email");
    expect(screen.getByLabelText("PASSWORD")).toHaveAttribute("id", "signup-password");
    expect(screen.getByLabelText("CONFIRM PASSWORD")).toHaveAttribute(
      "id",
      "signup-confirm-password"
    );
    expect(screen.getByRole("link", { name: /^log in$/i })).toHaveAttribute("href", "/login");
  });

  it("surfaces OAuth errors and re-enables the Google button", async () => {
    mockSignInSocial.mockResolvedValue({
      data: null,
      error: { message: "Provider is not enabled" },
    });

    render(<SignupForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign up with google/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provider is not enabled");
    expect(screen.getByRole("button", { name: /sign up with google/i })).not.toBeDisabled();
  });
});
