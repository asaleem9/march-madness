import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockResetPasswordForEmail = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  }),
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
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("sends the reset email with a /reset redirect and shows the sent state", async () => {
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "user@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith("user@test.com", {
        redirectTo: `${window.location.origin}/reset`,
      });
    });
    expect(await screen.findByText("CHECK YOUR EMAIL")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("user@test.com");
  });

  it("shows the error when Supabase rejects the request", async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "user@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email rate limit exceeded");
    expect(screen.queryByText("CHECK YOUR EMAIL")).not.toBeInTheDocument();
  });
});
