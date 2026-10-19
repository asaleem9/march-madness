import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockRequestPasswordReset = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
    resetPassword: vi.fn(),
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

import ForgotPasswordPage from "../forgot-password/page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestPasswordReset.mockResolvedValue({ data: {}, error: null });
  });

  it("requests the reset email with a /reset redirect and shows the sent state", async () => {
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "user@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: "user@test.com",
        redirectTo: `${window.location.origin}/reset`,
      });
    });
    expect(await screen.findByText("CHECK YOUR EMAIL")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("user@test.com");
    expect(screen.getByRole("link", { name: /back to login/i })).toHaveAttribute("href", "/login");
  });

  it("shows the error when the request is rejected", async () => {
    mockRequestPasswordReset.mockResolvedValue({
      data: null,
      error: { message: "Too many requests" },
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "user@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    expect(screen.queryByText("CHECK YOUR EMAIL")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send reset link/i })).not.toBeDisabled();
  });

  it("disables the button while sending", async () => {
    let resolve!: (v: { data: unknown; error: null }) => void;
    mockRequestPasswordReset.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("EMAIL"), { target: { value: "user@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sending\.\.\./i })).toBeDisabled();
    });
    resolve({ data: {}, error: null });
    expect(await screen.findByText("CHECK YOUR EMAIL")).toBeInTheDocument();
  });

  it("links back to login", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: /^log in$/i })).toHaveAttribute("href", "/login");
  });
});
