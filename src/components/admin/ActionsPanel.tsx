"use client";

import { useState } from "react";
import { useToast } from "@/hooks/useToast";
import { ResultPane, runRequest, type ActionResult } from "./ResultPane";

interface Props {
  /** Called after an action that may have changed games/scores so the page can reload. */
  onDataChanged?: () => void;
}

interface Action {
  key: string;
  label: string;
  hint: string;
  input: string;
  init?: RequestInit;
  /** Reload games after success. */
  reloads?: boolean;
  variant?: "primary" | "secondary" | "gold";
}

const ACTIONS: Action[] = [
  {
    key: "update-scores",
    label: "Run score update now",
    hint: "Same job as the cron: fetch ESPN, score finals, auto-lock, resolve wagers.",
    input: "/api/cron/update-scores",
    init: { method: "POST" },
    reloads: true,
    variant: "primary",
  },
  {
    key: "lock",
    label: "Lock brackets now",
    hint: "Finalize every complete draft once the deadline has passed.",
    input: "/api/admin/lock-brackets",
    init: { method: "POST" },
    variant: "secondary",
  },
  {
    key: "send-batch",
    label: "Send notification batch",
    hint: "Deliver queued notifications (respects quiet hours and the daily cap).",
    input: "/api/notifications/send-batch",
    init: { method: "POST" },
    variant: "secondary",
  },
  {
    key: "sync",
    label: "Sync from ESPN",
    hint: "Full-tournament scan: match unmatched games by team, fix advancement.",
    input: "/api/admin/backfill-advancement?sync=true",
    reloads: true,
  },
  {
    key: "backfill",
    label: "Backfill scoring",
    hint: "Re-run the final-game pipeline for every final game (idempotent).",
    input: "/api/admin/backfill-advancement",
    reloads: true,
  },
  {
    key: "verify",
    label: "Verify scores",
    hint: "Recompute every bracket's score and report mismatches.",
    input: "/api/admin/backfill-advancement?verify=true",
  },
  {
    key: "diagnose",
    label: "Diagnose bracket",
    hint: "List games missing a team or a result.",
    input: "/api/admin/backfill-advancement?diagnose=true",
  },
];

const variantClass = (v?: Action["variant"]) =>
  v === "primary" ? "retro-btn-primary" : v === "secondary" ? "retro-btn-secondary" : v === "gold" ? "retro-btn-gold" : "";

const inputClass = "w-full border-2 border-navy p-2 text-base font-body bg-cream rounded-sm";

export function ActionsPanel({ onDataChanged }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ActionResult>>({});

  const run = async (action: Action) => {
    if (busy) return;
    setBusy(action.key);
    const res = await runRequest(action.input, action.init);
    setResults((r) => ({ ...r, [action.key]: res }));
    setBusy(null);
    if (res.ok) {
      toast(`${action.label}: done`, "success");
      if (action.reloads) onDataChanged?.();
    } else {
      const err = (res.body as { error?: string } | null)?.error;
      toast(`${action.label}: ${err ?? `HTTP ${res.status}`}`, "error");
    }
  };

  // --- Waitlist announcement ---
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [announceDry, setAnnounceDry] = useState(true);
  const [confirmSend, setConfirmSend] = useState(false);
  const [announceResult, setAnnounceResult] = useState<ActionResult | null>(null);
  const announceBusy = busy === "announce";
  const canAnnounce = !busy && subject.trim().length > 0 && text.trim().length > 0;

  const announce = async () => {
    if (!canAnnounce) return;
    if (!announceDry && !confirmSend) {
      setConfirmSend(true);
      return;
    }
    setBusy("announce");
    const res = await runRequest("/api/admin/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.trim(), text: text.trim(), dryRun: announceDry }),
    });
    setAnnounceResult(res);
    setBusy(null);
    setConfirmSend(false);
    const body = res.body as { recipients?: number; sent?: number; failed?: number; error?: string } | null;
    if (!res.ok) toast(body?.error ?? `Announce failed (HTTP ${res.status})`, "error");
    else if (announceDry) toast(`Dry run: ${body?.recipients ?? 0} recipient(s)`, "info");
    else toast(`Sent ${body?.sent ?? 0}, failed ${body?.failed ?? 0}`, body?.failed ? "error" : "success");
  };

  const dryRecipients =
    announceResult?.ok && (announceResult.body as { dryRun?: boolean } | null)?.dryRun
      ? (announceResult.body as { recipients?: number }).recipients
      : null;

  return (
    <section className="retro-card p-4 sm:p-6">
      <h2 className="scoreboard-heading text-[0.6rem] rounded mb-4">ACTIONS</h2>
      <ul className="space-y-3">
        {ACTIONS.map((a) => (
          <li key={a.key}>
            <button
              type="button"
              onClick={() => run(a)}
              disabled={busy !== null}
              aria-busy={busy === a.key}
              className={`retro-btn text-[0.6rem] py-2 px-3 w-full ${variantClass(a.variant)}`}
            >
              {busy === a.key ? "Working…" : a.label}
            </button>
            <p className="font-body text-xs text-navy/60 mt-1">{a.hint}</p>
            <ResultPane result={results[a.key] ?? null} />
          </li>
        ))}
      </ul>

      <h3 className="scoreboard-heading text-[0.6rem] rounded mt-6 mb-3">EMAIL THE WAITLIST</h3>
      <div className="space-y-3" aria-busy={announceBusy}>
        <div>
          <label htmlFor="announce-subject" className="font-body text-xs text-navy/70 block mb-1">
            Subject
          </label>
          <input
            id="announce-subject"
            type="text"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setConfirmSend(false);
            }}
            className={inputClass}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="announce-text" className="font-body text-xs text-navy/70 block mb-1">
            Message (plain text; an opt-out line is appended)
          </label>
          <textarea
            id="announce-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setConfirmSend(false);
            }}
            rows={5}
            className={inputClass}
            maxLength={10000}
          />
        </div>
        <label className="flex items-center gap-2 font-body text-xs">
          <input
            type="checkbox"
            checked={announceDry}
            onChange={(e) => {
              setAnnounceDry(e.target.checked);
              setConfirmSend(false);
            }}
            className="w-4 h-4"
          />
          Dry run (count recipients only)
        </label>
        {confirmSend && (
          <p className="font-body text-xs text-burnt-orange" role="alert">
            This emails everyone on the waitlist{dryRecipients != null ? ` (${dryRecipients} recipients)` : ""}. Click
            again to confirm.
          </p>
        )}
        <button
          type="button"
          onClick={announce}
          disabled={!canAnnounce}
          className={`retro-btn text-[0.6rem] py-2 px-3 w-full ${announceDry ? "retro-btn-secondary" : "retro-btn-primary"}`}
        >
          {announceBusy ? "Working…" : announceDry ? "Count recipients" : confirmSend ? "Confirm send" : "Send to waitlist"}
        </button>
        {dryRecipients != null && (
          <p className="font-body text-xs text-forest" role="status">
            {dryRecipients} unique recipient(s) on the waitlist.
          </p>
        )}
        <ResultPane result={announceResult} />
      </div>
    </section>
  );
}
