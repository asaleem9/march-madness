// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "admin@test.com";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "March Madness <brackets@example.com>";
});

const mockGetUser = vi.fn();
const mockWaitlistSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "email_waitlist") return { select: mockWaitlistSelect };
      throw new Error(`unexpected table ${table}`);
    }),
  })),
}));

import { POST } from "../route";

const fetchMock = vi.fn();

function asAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "admin@test.com" } } });
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/announce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function waitlist(emails: string[]) {
  mockWaitlistSelect.mockResolvedValue({ data: emails.map((email) => ({ email })), error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/admin/announce", () => {
  it("returns 403 for non-admins", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u2", email: "normie@test.com" } } });
    const res = await POST(req({ subject: "Hi", text: "Hello", dryRun: true }));
    expect(res.status).toBe(403);
    expect(mockWaitlistSelect).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid body", async () => {
    asAdmin();
    const res = await POST(req({ subject: "", text: "Hello" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/subject/);

    const res2 = await POST(req("not json"));
    expect(res2.status).toBe(400);
  });

  it("dry run counts deduped recipients and sends nothing", async () => {
    asAdmin();
    waitlist(["a@x.com", "A@X.com ", "b@x.com", "", "junk"]);
    const res = await POST(req({ subject: "Brackets open", text: "Come play", dryRun: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recipients: 2, dryRun: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends via Resend batch with the opt-out line and reports counts", async () => {
    asAdmin();
    waitlist(["a@x.com", "b@x.com"]);
    const res = await POST(req({ subject: "Brackets open", text: "Come play" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recipients: 2, sent: 2, failed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails/batch");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    const payload = JSON.parse(init.body);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      from: "March Madness <brackets@example.com>",
      to: "a@x.com",
      subject: "Brackets open",
    });
    expect(payload[0].text).toContain("Come play");
    expect(payload[0].text).toContain("Reply STOP to be removed");
  });

  it("chunks recipients into batches of 100 and counts failed chunks", async () => {
    asAdmin();
    waitlist(Array.from({ length: 250 }, (_, i) => `user${i}@x.com`));
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "bad" })
      .mockRejectedValueOnce(new Error("network"));

    const res = await POST(req({ subject: "S", text: "T", dryRun: false }));
    const json = await res.json();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toHaveLength(50);
    expect(json).toEqual({ recipients: 250, sent: 100, failed: 150 });
  });

  it("short-circuits with zero recipients without calling Resend", async () => {
    asAdmin();
    waitlist([]);
    const res = await POST(req({ subject: "S", text: "T" }));
    expect(await res.json()).toEqual({ recipients: 0, sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when RESEND_API_KEY is missing for a real send", async () => {
    asAdmin();
    waitlist(["a@x.com"]);
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const res = await POST(req({ subject: "S", text: "T" }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toMatch(/RESEND_API_KEY/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env.RESEND_API_KEY = saved;
    }
  });

  it("returns 500 when the waitlist read fails", async () => {
    asAdmin();
    mockWaitlistSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await POST(req({ subject: "S", text: "T", dryRun: true }));
    expect(res.status).toBe(500);
  });
});
