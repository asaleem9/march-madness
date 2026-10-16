/**
 * Local-draft persistence for the bracket builder.
 *
 * Picks are mirrored into localStorage while the bracket is dirty so a lost
 * session, a reload or a failed save never throws away someone's work. Every
 * call is wrapped in try/catch: storage can be missing, full or blocked
 * (private windows, SSR), and the builder must keep working without it.
 */

export interface StoredDraftPick {
  gameSlot: number;
  round: string;
  pickedTeamId: number;
}

export interface StoredDraft {
  picks: StoredDraftPick[];
  bracketName: string;
  /** ISO timestamp of when the draft was written. */
  savedAt: string;
}

const PREFIX = "bracket-draft";

/** Storage key for a user's draft of a bracket (`"new"` for an unsaved bracket). */
export function draftKey(userId: string | null | undefined, bracketId: string | null | undefined): string {
  return `${PREFIX}:${userId ?? "anon"}:${bracketId ?? "new"}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, draft: Omit<StoredDraft, "savedAt"> & { savedAt?: string }): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const payload: StoredDraft = {
      picks: draft.picks,
      bracketName: draft.bracketName,
      savedAt: draft.savedAt ?? new Date().toISOString(),
    };
    store.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(key: string): StoredDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (!parsed || !Array.isArray(parsed.picks) || typeof parsed.savedAt !== "string") return null;
    const picks = parsed.picks.filter(
      (p): p is StoredDraftPick =>
        !!p &&
        typeof p.gameSlot === "number" &&
        typeof p.pickedTeamId === "number" &&
        typeof p.round === "string"
    );
    return {
      picks,
      bracketName: typeof parsed.bracketName === "string" ? parsed.bracketName : "",
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // ignore
  }
}

/** True when the local draft was written after the server's `updated_at`. */
export function isDraftNewer(draft: StoredDraft | null, serverUpdatedAt: string | null | undefined): boolean {
  if (!draft) return false;
  const draftTime = new Date(draft.savedAt).getTime();
  if (Number.isNaN(draftTime)) return false;
  if (!serverUpdatedAt) return true;
  const serverTime = new Date(serverUpdatedAt).getTime();
  if (Number.isNaN(serverTime)) return true;
  return draftTime > serverTime;
}
