import { describe, it, expect, beforeEach, vi } from "vitest";
import { draftKey, saveDraft, loadDraft, clearDraft, isDraftNewer } from "../draft-storage";


// Node 26 defines a `localStorage` global (undefined without --localstorage-file)
// that shadows jsdom's, so give the window an in-memory one.
function installStorage() {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
  return store;
}

describe("draft-storage", () => {
  beforeEach(() => {
    installStorage();
  });

  it("draftKey scopes by user and bracket, with stable fallbacks", () => {
    expect(draftKey("u1", "b1")).toBe("bracket-draft:u1:b1");
    expect(draftKey("u1", undefined)).toBe("bracket-draft:u1:new");
    expect(draftKey(null, null)).toBe("bracket-draft:anon:new");
  });

  it("round-trips a draft and stamps savedAt", () => {
    const key = draftKey("u1", "b1");
    expect(
      saveDraft(key, {
        picks: [{ gameSlot: 13, round: "first_round", pickedTeamId: 7 }],
        bracketName: "Mine",
      })
    ).toBe(true);
    const loaded = loadDraft(key);
    expect(loaded).not.toBeNull();
    expect(loaded!.picks).toEqual([{ gameSlot: 13, round: "first_round", pickedTeamId: 7 }]);
    expect(loaded!.bracketName).toBe("Mine");
    expect(Number.isNaN(new Date(loaded!.savedAt).getTime())).toBe(false);
  });

  it("returns null for missing or malformed drafts and drops bad picks", () => {
    expect(loadDraft("nope")).toBeNull();
    window.localStorage.setItem("bad", "{not json");
    expect(loadDraft("bad")).toBeNull();
    window.localStorage.setItem("shape", JSON.stringify({ picks: "x", savedAt: "2027-01-01T00:00:00Z" }));
    expect(loadDraft("shape")).toBeNull();
    window.localStorage.setItem(
      "mixed",
      JSON.stringify({
        picks: [{ gameSlot: 1, round: "first_round", pickedTeamId: 2 }, { gameSlot: "x" }, null],
        bracketName: 5,
        savedAt: "2027-01-01T00:00:00Z",
      })
    );
    const mixed = loadDraft("mixed");
    expect(mixed!.picks).toHaveLength(1);
    expect(mixed!.bracketName).toBe("");
  });

  it("clearDraft removes the entry", () => {
    const key = draftKey("u1", "b1");
    saveDraft(key, { picks: [], bracketName: "x" });
    clearDraft(key);
    expect(loadDraft(key)).toBeNull();
  });

  it("isDraftNewer compares against the server timestamp", () => {
    const draft = { picks: [], bracketName: "", savedAt: "2027-03-15T12:00:00Z" };
    expect(isDraftNewer(draft, "2027-03-14T12:00:00Z")).toBe(true);
    expect(isDraftNewer(draft, "2027-03-16T12:00:00Z")).toBe(false);
    expect(isDraftNewer(draft, null)).toBe(true);
    expect(isDraftNewer(null, null)).toBe(false);
    expect(isDraftNewer({ ...draft, savedAt: "garbage" }, null)).toBe(false);
  });

  it("swallows storage failures", () => {
    const store = installStorage();
    const spy = vi.spyOn(store, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveDraft("k", { picks: [], bracketName: "" })).toBe(false);
    spy.mockRestore();
  });
});
