/**
 * Pure helpers for the admin config form: `datetime-local` inputs work in
 * the browser's local zone with no offset, so converting to/from ISO has to
 * go through the local Date getters — `toISOString().slice(0, 16)` would
 * silently shift the value by the UTC offset.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO (any offset) → `YYYY-MM-DDTHH:mm` in the browser's local zone; "" when empty/invalid. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value (local zone) → UTC ISO string; null when empty/invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

/** `2027-03-18 16:00 UTC` for display beside a local input; "" when invalid. */
export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

/** True when both are valid instants at the same time (tolerates `Z` vs `+00:00`). */
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta === tb;
}

/** "just now", "4 min ago", "3 h ago", "2 d ago", or "in 5 min" for future instants. */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  const diffSec = Math.round((now.getTime() - t) / 1000);
  const abs = Math.abs(diffSec);
  const future = diffSec < 0;
  let text: string;
  if (abs < 45) return "just now";
  else if (abs < 3600) text = `${Math.round(abs / 60)} min`;
  else if (abs < 86400) text = `${Math.round(abs / 3600)} h`;
  else text = `${Math.round(abs / 86400)} d`;
  return future ? `in ${text}` : `${text} ago`;
}
