"use client";

import { useState } from "react";
import type { ImportReport } from "@/lib/bracket-import";
import { REGION_ORDER, YEAR_DEFAULTS } from "@/lib/tournament-structure";
import { useToast } from "@/hooks/useToast";
import { RawJson, runRequest, type ActionResult } from "./ResultPane";

interface Props {
  year: number;
  /** Called after a real (non-dry-run) import succeeds so the page can reload games. */
  onImported?: () => void;
}

type Mode = "current" | "replay2026";

const REPLAY_2026_DATES = ["20260317", "20260318", "20260319", "20260320"];
const EXPECTED: Record<Mode, { teams: number; opening: number }> = {
  current: { teams: 76, opening: 12 },
  replay2026: { teams: 68, opening: 4 },
};

function defaultDates(year: number, mode: Mode): string {
  if (mode === "replay2026") return REPLAY_2026_DATES.join(", ");
  return (YEAR_DEFAULTS[year]?.espnDates ?? []).join(", ");
}

function parseDates(input: string): { dates: string[]; invalid: string[] } {
  const parts = input
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    dates: parts.filter((p) => /^\d{8}$/.test(p)),
    invalid: parts.filter((p) => !/^\d{8}$/.test(p)),
  };
}

function Count({ label, value, expected }: { label: string; value: number; expected: number }) {
  const ok = value === expected;
  return (
    <div className="border-2 border-navy/20 rounded p-2">
      <p className="font-body text-xs text-navy/60">{label}</p>
      <p className={`font-display text-[0.7rem] mt-1 ${ok ? "text-forest" : "text-burnt-orange"}`}>
        {value} / {expected}
      </p>
    </div>
  );
}

function List({ title, items, tone = "warn" }: { title: string; items: string[]; tone?: "warn" | "error" | "info" }) {
  if (items.length === 0) return null;
  const color = tone === "error" ? "text-burnt-orange" : tone === "warn" ? "text-navy" : "text-navy/70";
  return (
    <div className="mt-3">
      <p className={`font-body text-xs font-bold ${color}`}>
        {title} ({items.length})
      </p>
      <ul className={`list-disc pl-4 font-body text-xs ${color} space-y-0.5 max-h-48 overflow-auto`}>
        {items.map((it, i) => (
          <li key={i} className="break-words">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportSummary({ report, status, dryRun }: { report: ImportReport; status: number; dryRun: boolean }) {
  const pass = report.errors.length === 0 && status < 400;
  const verdict =
    status === 409
      ? "REFUSED — games have already started (tick Force to re-import anyway)"
      : status === 422
        ? "FAILED validation — nothing was written"
        : pass
          ? dryRun
            ? "PASS — dry run, nothing written"
            : "PASS — bracket written"
          : "FAILED";
  return (
    <div className="mt-3">
      <p className={`font-display text-[0.6rem] ${pass && status < 400 ? "text-forest" : "text-burnt-orange"}`}>
        {verdict}
      </p>
      <p className="font-body text-xs text-navy/60 mt-1">
        {report.year} · fetched {report.datesFetched.join(", ")} · {report.espnEvents} ESPN events (
        {report.tournamentEvents} tournament, {report.ignoredEvents} ignored)
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <Count label="Teams" value={report.teams.count} expected={report.teams.expected} />
        <Count label="Opening Round games" value={report.openingRound.count} expected={report.openingRound.expected} />
        <Count label="First Round games" value={report.firstRound.count} expected={report.firstRound.expected} />
        <Count label="R1 with TBD side" value={report.firstRound.withTbdSide} expected={report.firstRound.expectedTbd} />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full font-body text-xs border-collapse">
          <caption className="text-left text-navy/60 mb-1">Seed coverage by region</caption>
          <thead>
            <tr className="text-left text-navy/60 border-b-2 border-navy/20">
              <th className="py-1 pr-2">Region</th>
              <th className="py-1 pr-2">Teams</th>
              <th className="py-1 pr-2">Missing seeds</th>
              <th className="py-1">Duplicate seeds</th>
            </tr>
          </thead>
          <tbody>
            {REGION_ORDER.map((r) => {
              const missing = report.teams.missingSeeds[r] ?? [];
              const dupes = report.teams.duplicateSeeds[r] ?? [];
              const bad = missing.length > 0 || dupes.length > 0;
              return (
                <tr key={r} className={`border-b border-navy/10 ${bad ? "text-burnt-orange" : ""}`}>
                  <td className="py-1 pr-2 capitalize">{r}</td>
                  <td className="py-1 pr-2">{report.teams.byRegion[r] ?? 0}</td>
                  <td className="py-1 pr-2">{missing.length ? missing.join(", ") : "—"}</td>
                  <td className="py-1">{dupes.length ? dupes.join(", ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {report.openingRound.games.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full font-body text-xs border-collapse">
            <caption className="text-left text-navy/60 mb-1">Opening Round</caption>
            <thead>
              <tr className="text-left text-navy/60 border-b-2 border-navy/20">
                <th className="py-1 pr-2">Slot</th>
                <th className="py-1 pr-2">Region</th>
                <th className="py-1 pr-2">Seed</th>
                <th className="py-1 pr-2">Matchup</th>
                <th className="py-1">Feeds</th>
              </tr>
            </thead>
            <tbody>
              {report.openingRound.games.map((g) => (
                <tr key={g.slot} className="border-b border-navy/10">
                  <td className="py-1 pr-2">{g.slot}</td>
                  <td className="py-1 pr-2 capitalize">{g.region}</td>
                  <td className="py-1 pr-2">{g.seed}</td>
                  <td className="py-1 pr-2">
                    {g.teamA} vs {g.teamB}
                  </td>
                  <td className="py-1">
                    slot {g.feedsSlot} ({g.position})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <List title="Errors" items={report.errors} tone="error" />
      <List title="Warnings" items={report.warnings} />
      <List title="Unmatched headlines" items={report.unmatchedHeadlines} tone="info" />
      <List title="Name collisions" items={report.teams.nameCollisions} tone="info" />
      <List title="Missing First Round slots" items={report.firstRound.missingSlots.map(String)} tone="error" />
      <List title="TBD slot mismatches" items={report.firstRound.tbdSlotMismatches} tone="error" />
    </div>
  );
}

const inputClass = "w-full border-2 border-navy p-2 text-base font-body bg-cream rounded-sm";

export function ImportPanel({ year, onImported }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("current");
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [dates, setDates] = useState(() => defaultDates(year, "current"));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ActionResult & { dryRun: boolean }) | null>(null);

  const { dates: parsedDates, invalid } = parseDates(dates);
  const canRun = !busy && invalid.length === 0 && parsedDates.length > 0 && parsedDates.length <= 8;

  const switchMode = (next: Mode) => {
    setMode(next);
    setDates(defaultDates(year, next));
    setResult(null);
  };

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    const res = await runRequest("/api/admin/import-bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dates: parsedDates, expected: EXPECTED[mode], dryRun, force }),
    });
    setResult({ ...res, dryRun });
    setBusy(false);
    if (res.ok && !dryRun) {
      toast("Bracket imported", "success");
      onImported?.();
    } else if (!res.ok) {
      const err = (res.body as { error?: string } | null)?.error;
      toast(err ?? `Import ${res.status === 422 ? "failed validation" : "failed"}`, "error");
    } else {
      toast("Dry run complete", "info");
    }
  };

  const body = (result?.body ?? null) as { report?: ImportReport; error?: string; written?: unknown } | null;

  return (
    <section className="retro-card p-4 sm:p-6" aria-busy={busy}>
      <h2 className="scoreboard-heading text-[0.6rem] rounded mb-4">IMPORT FROM ESPN</h2>
      <p className="font-body text-xs text-navy/70 mb-4">
        Reads the Opening Round + First Round scoreboards and builds teams and the 75-slot bracket. Always dry-run
        first; a real import is idempotent and can be re-run when ESPN posts games late.
      </p>

      <div className="flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label="Expected field size">
        {(
          [
            ["current", `${year}: expect 76 teams / 12 play-ins`],
            ["replay2026", "2026 replay: expect 68 / 4"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => switchMode(m)}
            className={`retro-btn text-[0.6rem] py-2 px-3 ${mode === m ? "retro-btn-primary" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
        <div>
          <label htmlFor="import-dates" className="font-body text-xs text-navy/70 block mb-1">
            ESPN dates (YYYYMMDD, comma-separated, max 8)
          </label>
          <input
            id="import-dates"
            type="text"
            value={dates}
            onChange={(e) => setDates(e.target.value)}
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
          />
          {invalid.length > 0 && (
            <p className="font-body text-xs text-burnt-orange mt-1">Not YYYYMMDD: {invalid.join(", ")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-4 font-body text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="w-4 h-4" />
            Dry run
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="w-4 h-4" />
            Force (even if games started)
          </label>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          className={`retro-btn text-[0.6rem] py-2 px-4 ${dryRun ? "retro-btn-secondary" : "retro-btn-primary"}`}
        >
          {busy ? "Importing…" : dryRun ? "Run dry run" : "Import for real"}
        </button>
        {!dryRun && (
          <span className="font-body text-xs text-burnt-orange">This writes teams and games to the database.</span>
        )}
      </div>

      {result && (
        <div className="mt-2" role="status" aria-live="polite">
          {body?.error && <p className="font-body text-xs text-burnt-orange font-bold mt-3">{body.error}</p>}
          {body?.report ? (
            <ReportSummary report={body.report} status={result.status} dryRun={result.dryRun} />
          ) : (
            !body?.error && <p className="font-body text-xs text-navy/60 mt-3">No report returned.</p>
          )}
          {body?.written != null && <RawJson value={body.written} label="Written rows" />}
          <RawJson value={result.body} />
        </div>
      )}
    </section>
  );
}
