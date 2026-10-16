import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRecordingClient } from "@/test/helpers";

// ── Mocks ────────────────────────────────────────────────────────────────────

let client: ReturnType<typeof createRecordingClient> & {
  auth: { getUser: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };
};
let updateError: { code?: string; message: string } | null = null;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => client,
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

function makeClient() {
  const base = createRecordingClient();
  // Let a test inject a Supabase-style error on profile writes.
  base.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const record = (method: string) =>
      (...args: unknown[]) => {
        base.calls.push({ table, method, args });
        return proxy;
      };
    const proxy = new Proxy(chain, {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) =>
            resolve({ data: null, error: table === "profiles" ? updateError : null });
        }
        return record(String(prop));
      },
    });
    return proxy;
  });
  return Object.assign(base, {
    auth: {
      getUser: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
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
  client = makeClient();
  updateError = null;
  mockToast.mockReset();
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: "America/Chicago",
  } as Intl.ResolvedDateTimeFormatOptions);
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("keeps SMS disabled until the phone number is valid, then normalizes it on save", async () => {
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
    const [update] = client.updates("profiles");
    expect(update.args[0]).toMatchObject({
      display_name: "Ali",
      phone: "+15551234567",
      notification_preferences: expect.objectContaining({ sms: true }),
    });
    expect(mockToast).toHaveBeenCalledWith("Profile saved", "success");
  });

  it("maps a unique-violation on display_name to 'That name is taken'", async () => {
    updateError = { code: "23505", message: 'duplicate key value violates "profiles_display_name_key"' };
    render(<ProfileClient {...baseProps} />);

    fireEvent.change(screen.getByLabelText("DISPLAY NAME"), { target: { value: "Taken" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That name is taken");
    expect(mockToast).toHaveBeenCalledWith("That name is taken", "error");
  });

  it("adopts the browser timezone when the profile still has the trigger default", async () => {
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
      expect(client.updates("profiles")[0]?.args[0]).toMatchObject({ timezone: "Europe/London" });
    });
    expect(screen.getByLabelText("TIMEZONE")).toHaveValue("Europe/London");
    expect(mockToast).toHaveBeenCalledWith("Timezone set to Europe/London", "info");
  });

  it("leaves a deliberately chosen timezone alone", () => {
    (Intl.DateTimeFormat.prototype.resolvedOptions as ReturnType<typeof vi.fn>).mockReturnValue({
      timeZone: "Europe/London",
    });
    render(<ProfileClient {...baseProps} />);
    expect(client.updates("profiles")).toHaveLength(0);
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
    Object.defineProperty(window, "location", {
      value: { href: "/profile" },
      writable: true,
      configurable: true,
    });
    render(<ProfileClient {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    expect(client.auth.signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    await waitFor(() => {
      expect(client.auth.signOut).toHaveBeenCalled();
    });
    expect(window.location.href).toBe("/");
  });
});
