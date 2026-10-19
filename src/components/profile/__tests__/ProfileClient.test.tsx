import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockSignOut = vi.fn();
const mockChangePassword = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    updateUser: vi.fn(),
    changePassword: (...args: unknown[]) => mockChangePassword(...args),
  },
}));

const mockToast = vi.fn();
vi.mock("@/hooks/useToast", () => ({ useToast: () => mockToast }));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));

import { ProfileClient } from "../ProfileClient";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Every PATCH /api/profile body the component sent, in order. */
const patches: Record<string, unknown>[] = [];
let patchResponse: { status: number; body?: unknown } = { status: 200 };

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== "/api/profile" || init?.method !== "PATCH") {
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    }
    patches.push(JSON.parse(String(init.body)));
    return {
      ok: patchResponse.status >= 200 && patchResponse.status < 300,
      status: patchResponse.status,
      json: async () => patchResponse.body ?? {},
    } as Response;
  });
}

const baseProps = {
  userId: "user-1",
  email: "me@example.com",
  profileExists: true,
  initial: {
    displayName: "Ali",
    phone: "",
    timezone: "America/Chicago",
    preferences: { push: false, sms: false, email: false, digest_only: false },
  },
  earned: ["fortune_teller" as const],
  channels: { sms: true, email: true },
  vapidPublicKey: "key",
};

beforeEach(() => {
  patches.length = 0;
  patchResponse = { status: 200 };
  vi.stubGlobal("fetch", mockFetch());
  mockToast.mockReset();
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ data: null, error: null });
  mockChangePassword.mockReset().mockResolvedValue({ data: null, error: null });
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: "America/Chicago",
  } as Intl.ResolvedDateTimeFormatOptions);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ProfileClient", () => {
  it("shows the account email on the email option and hides unconfigured channels", () => {
    const { rerender } = render(<ProfileClient {...baseProps} />);
    expect(screen.getByText("(me@example.com)")).toBeInTheDocument();
    expect(screen.getByLabelText("SMS")).toBeInTheDocument();

    rerender(<ProfileClient {...baseProps} channels={{ sms: false, email: false }} />);
    expect(screen.queryByLabelText("SMS")).not.toBeInTheDocument();
    expect(screen.queryByText("(me@example.com)")).not.toBeInTheDocument();
  });

  it("keeps SMS disabled until the phone number is valid, then saves through the API", async () => {
    render(<ProfileClient {...baseProps} />);
    const sms = screen.getByLabelText("SMS");
    expect(sms).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/phone number for sms/i), {
      target: { value: "(555) 123-4567" },
    });
    expect(sms).not.toBeDisabled();
    expect(screen.getByText("Texts go to +15551234567.")).toBeInTheDocument();
    fireEvent.click(sms);

    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Profile saved");
    });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      displayName: "Ali",
      phone: "+15551234567",
      timezone: "America/Chicago",
      notificationPreferences: { push: false, sms: true, email: false, digest_only: false },
    });
    expect(screen.getByLabelText(/phone number for sms/i)).toHaveValue("+15551234567");
    expect(mockToast).toHaveBeenCalledWith("Profile saved", "success");
  });

  it("maps a 409 from the API to 'That name is taken'", async () => {
    patchResponse = { status: 409, body: { error: "That name is taken" } };
    render(<ProfileClient {...baseProps} />);

    fireEvent.change(screen.getByLabelText("DISPLAY NAME"), { target: { value: "Taken" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That name is taken");
    expect(mockToast).toHaveBeenCalledWith("That name is taken", "error");
  });

  it("surfaces other API errors", async () => {
    patchResponse = { status: 400, body: { error: "Unknown timezone" } };
    render(<ProfileClient {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to save: Unknown timezone");
  });

  it("refuses an empty display name without calling the API", async () => {
    render(<ProfileClient {...baseProps} />);
    fireEvent.change(screen.getByLabelText("DISPLAY NAME"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Display name can't be empty");
    expect(patches).toHaveLength(0);
  });

  it("adopts the browser timezone when the profile still has the default", async () => {
    (Intl.DateTimeFormat.prototype.resolvedOptions as ReturnType<typeof vi.fn>).mockReturnValue({
      timeZone: "Europe/London",
    });
    render(
      <ProfileClient
        {...baseProps}
        initial={{ ...baseProps.initial, timezone: "America/New_York" }}
      />
    );

    await waitFor(() => {
      expect(patches[0]).toEqual({ timezone: "Europe/London" });
    });
    await waitFor(() => {
      expect(screen.getByLabelText("TIMEZONE")).toHaveValue("Europe/London");
    });
    expect(mockToast).toHaveBeenCalledWith("Timezone set to Europe/London", "info");
  });

  it("leaves a deliberately chosen timezone alone", () => {
    (Intl.DateTimeFormat.prototype.resolvedOptions as ReturnType<typeof vi.fn>).mockReturnValue({
      timeZone: "Europe/London",
    });
    render(<ProfileClient {...baseProps} />);
    expect(patches).toHaveLength(0);
  });

  it("warns when every channel is off", () => {
    render(<ProfileClient {...baseProps} />);
    expect(screen.getByRole("status")).toHaveTextContent(/all channels are off/i);
  });

  it("renders all five badges with the earned one highlighted", () => {
    render(<ProfileClient {...baseProps} />);
    expect(screen.getByText("1 of 5 earned", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("Locked")).toHaveLength(4);
    expect(screen.getByText("Fortune Teller")).toBeInTheDocument();
  });

  it("signs out only after confirmation", async () => {
    render(<ProfileClient {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  describe("change password", () => {
    function fill(current: string, next: string, confirm: string) {
      fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: current } });
      fireEvent.change(screen.getByLabelText("NEW PASSWORD"), { target: { value: next } });
      fireEvent.change(screen.getByLabelText("CONFIRM NEW PASSWORD"), {
        target: { value: confirm },
      });
      fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    }

    it("calls changePassword and clears the form on success", async () => {
      render(<ProfileClient {...baseProps} />);
      fill("oldpass123", "newpass123", "newpass123");

      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith({
          currentPassword: "oldpass123",
          newPassword: "newpass123",
          revokeOtherSessions: true,
        });
      });
      expect(await screen.findByText("Password changed")).toBeInTheDocument();
      expect(screen.getByLabelText("NEW PASSWORD")).toHaveValue("");
      expect(mockToast).toHaveBeenCalledWith("Password changed", "success");
    });

    it("rejects mismatched passwords without calling the API", async () => {
      render(<ProfileClient {...baseProps} />);
      fill("oldpass123", "newpass123", "different");
      expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it("shows the auth error when the current password is wrong", async () => {
      mockChangePassword.mockResolvedValue({
        data: null,
        error: { message: "Invalid password" },
      });
      render(<ProfileClient {...baseProps} />);
      fill("wrong", "newpass123", "newpass123");
      expect(await screen.findByText("Invalid password")).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith("Invalid password", "error");
    });
  });

  it("says the email can't be changed here", () => {
    render(<ProfileClient {...baseProps} />);
    expect(screen.getByText(/can't be changed here/i)).toBeInTheDocument();
  });
});
