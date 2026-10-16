import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

type AuthHandler = (event: string, session: unknown) => void;
let authHandler: AuthHandler | null = null;
const mockUnsubscribe = vi.fn();
const mockGetSession = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: AuthHandler) => {
        authHandler = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
      getSession: mockGetSession,
      updateUser: mockUpdateUser,
    },
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

import ResetPasswordPage from "../reset/page";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authHandler = null;
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  it("waits for the recovery session before showing the form", async () => {
    render(<ResetPasswordPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/verifying your link/i);
    expect(screen.queryByLabelText("NEW PASSWORD")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new one/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );

    await act(async () => {
      authHandler?.("PASSWORD_RECOVERY", { access_token: "tok" });
    });

    expect(screen.getByLabelText("NEW PASSWORD")).toBeInTheDocument();
  });

  it("shows the form immediately when a session already exists", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });

    render(<ResetPasswordPage />);

    expect(await screen.findByLabelText("NEW PASSWORD")).toBeInTheDocument();
  });

  it("updates the password and redirects to the dashboard", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });

    render(<ResetPasswordPage />);
    await screen.findByLabelText("NEW PASSWORD");

    fireEvent.change(screen.getByLabelText("NEW PASSWORD"), {
      target: { value: "newpass123" },
    });
    fireEvent.change(screen.getByLabelText("CONFIRM PASSWORD"), {
      target: { value: "newpass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newpass123" });
    });
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects mismatched passwords without calling updateUser", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });

    render(<ResetPasswordPage />);
    await screen.findByLabelText("NEW PASSWORD");

    fireEvent.change(screen.getByLabelText("NEW PASSWORD"), {
      target: { value: "newpass123" },
    });
    fireEvent.change(screen.getByLabelText("CONFIRM PASSWORD"), {
      target: { value: "different" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
