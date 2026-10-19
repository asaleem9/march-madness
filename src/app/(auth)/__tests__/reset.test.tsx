import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => mockSearchParams,
}));

const mockResetPassword = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
    updateUser: vi.fn(),
    changePassword: vi.fn(),
  },
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ResetPasswordPage from "../reset/page";

function fillAndSubmit(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("NEW PASSWORD"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("CONFIRM PASSWORD"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: /set new password/i }));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete("token");
    mockSearchParams.delete("error");
    mockResetPassword.mockResolvedValue({ data: {}, error: null });
  });

  it("shows the expired-link state when there is no token", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(/missing or has expired/i);
    expect(screen.queryByLabelText("NEW PASSWORD")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new one/i })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
  });

  it("shows the expired-link state when the link carries an error", () => {
    mockSearchParams.set("token", "tok");
    mockSearchParams.set("error", "INVALID_TOKEN");
    render(<ResetPasswordPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/missing or has expired/i);
  });

  it("shows the form when the link carries a token", () => {
    mockSearchParams.set("token", "tok");
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText("NEW PASSWORD")).toHaveAttribute("id", "reset-password");
    expect(screen.getByLabelText("CONFIRM PASSWORD")).toHaveAttribute("id", "reset-confirm");
  });

  it("resets the password with the token and sends the user to log in", async () => {
    mockSearchParams.set("token", "tok");
    render(<ResetPasswordPage />);
    fillAndSubmit("newpass123", "newpass123");

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({ newPassword: "newpass123", token: "tok" });
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("rejects mismatched passwords without calling resetPassword", async () => {
    mockSearchParams.set("token", "tok");
    render(<ResetPasswordPage />);
    fillAndSubmit("newpass123", "different");

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("rejects a short password without calling resetPassword", async () => {
    mockSearchParams.set("token", "tok");
    render(<ResetPasswordPage />);
    fillAndSubmit("short", "short");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters"
    );
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("shows the auth error when the token is no longer valid", async () => {
    mockSearchParams.set("token", "stale");
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid token" },
    });
    render(<ResetPasswordPage />);
    fillAndSubmit("newpass123", "newpass123");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid token");
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /set new password/i })).not.toBeDisabled();
  });
});
