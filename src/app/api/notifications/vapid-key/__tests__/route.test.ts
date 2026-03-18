// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Tests ---

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/notifications/vapid-key", () => {
  it("returns the VAPID public key when env var is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPxM3g9tHkm1dP...");

    // Re-import to pick up the stubbed env
    const { GET } = await import("../route");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.publicKey).toBe("BPxM3g9tHkm1dP...");
  });

  it("returns empty string when env var is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");

    const { GET } = await import("../route");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.publicKey).toBe("");
  });
});
