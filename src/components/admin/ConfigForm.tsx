"use client";

import { useMemo, useState } from "react";
import type { Region } from "@/types";
import { REGION_ORDER, type FinalFourPairing } from "@/lib/tournament-structure";
import { useToast } from "@/hooks/useToast";
import { toLocalInput, fromLocalInput, formatUtc, sameInstant } from "./datetime";
import {
  PHASES,
  phaseLabel,
  MULTIPLIER_KEYS,
  DEFAULT_MULTIPLIERS,
  readError,
  type AdminConfig,
  type Multipliers,
  type MultiplierKey,
} from "./types";

interface Props {
  config: AdminConfig;
  onSaved: (next: AdminConfig) => void;
}

interface Draft {
  year: string;
  lock: string;
  wager: string;
  phase: AdminConfig["active_phase"];
  multipliers: Record<MultiplierKey, string>;
  pairing: [Region, Region, Region, Region];
}

const DEFAULT_PAIRING: [Region, Region, Region, Region] = ["east", "west", "south", "midwest"];

function draftFrom(config: AdminConfig): Draft {
  const m = { ...DEFAULT_MULTIPLIERS, ...(config.scoring_multipliers ?? {}) };
  const p = config.final_four_pairing;
  return {
    year: String(config.year ?? ""),
    lock: toLocalInput(config.bracket_lock_deadline),
    wager: toLocalInput(config.wager_creation_deadline),
    phase: config.active_phase ?? "pre_tournament",
    multipliers: Object.fromEntries(MULTIPLIER_KEYS.map((k) => [k, String(m[k])])) as Record<MultiplierKey, string>,
    pairing: p ? [p[0][0], p[0][1], p[1][0], p[1][1]] : DEFAULT_PAIRING,
  };
}

type Updates = {
  year?: number;
  bracket_lock_deadline?: string;
  wager_creation_deadline?: string;
  active_phase?: AdminConfig["active_phase"];
  scoring_multipliers?: Multipliers;
  final_four_pairing?: FinalFourPairing;
};

/** Diff the draft against the saved config → the PUT body (only changed fields) + validation errors. */
export function diffConfig(config: AdminConfig, draft: Draft): { updates: Updates; errors: string[] } {
  const updates: Updates = {};
  const errors: string[] = [];

  const year = Number(draft.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push("Year must be between 2000 and 2100");
  else if (year !== config.year) updates.year = year;

  const lockIso = fromLocalInput(draft.lock);
  if (!lockIso) errors.push("Bracket lock deadline is not a valid date/time");
  else if (!sameInstant(lockIso, config.bracket_lock_deadline)) updates.bracket_lock_deadline = lockIso;

  const wagerIso = fromLocalInput(draft.wager);
  if (!wagerIso) errors.push("Wager deadline is not a valid date/time");
  else if (!sameInstant(wagerIso, config.wager_creation_deadline)) updates.wager_creation_deadline = wagerIso;

  if (draft.phase !== config.active_phase) updates.active_phase = draft.phase;

  const saved = { ...DEFAULT_MULTIPLIERS, ...(config.scoring_multipliers ?? {}) };
  const next = {} as Multipliers;
  let multChanged = false;
  for (const k of MULTIPLIER_KEYS) {
    const n = Number(draft.multipliers[k]);
    if (!Number.isInteger(n) || n <= 0) errors.push(`${phaseLabel(k)} multiplier must be a positive whole number`);
    next[k] = n;
    if (n !== saved[k]) multChanged = true;
  }
  if (multChanged) updates.scoring_multipliers = next;

  if (new Set(draft.pairing).size !== 4) errors.push("Final Four pairing must use each region exactly once");
  else {
    const pairing: FinalFourPairing = [
      [draft.pairing[0], draft.pairing[1]],
      [draft.pairing[2], draft.pairing[3]],
    ];
    const savedP = config.final_four_pairing;
    if (!savedP || JSON.stringify(savedP) !== JSON.stringify(pairing)) updates.final_four_pairing = pairing;
  }

  return { updates, errors };
}

const inputClass = "w-full border-2 border-navy p-2 text-base font-body bg-cream rounded-sm";
const labelClass = "font-body text-xs text-navy/70 block mb-1";

export function ConfigForm({ config, onSaved }: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(config));
  const [saving, setSaving] = useState(false);
  const [confirmPhase, setConfirmPhase] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const { updates, errors } = useMemo(() => diffConfig(config, draft), [config, draft]);
  const changedKeys = Object.keys(updates);
  const dirty = changedKeys.length > 0;
  const canSave = dirty && errors.length === 0 && !saving;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setStatus(null);
    setConfirmPhase(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const save = async () => {
    if (!canSave) return;
    if (updates.active_phase && !confirmPhase) {
      setConfirmPhase(true);
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const message = await readError(res, "Save failed");
        setStatus({ kind: "error", message });
        toast(message, "error");
        return;
      }
      const next: AdminConfig = { ...config, ...updates };
      onSaved(next);
      setDraft(draftFrom(next));
      const message = `Saved ${changedKeys.map((k) => k.replace(/_/g, " ")).join(", ")}`;
      setStatus({ kind: "success", message });
      toast("Config saved", "success");
    } finally {
      setSaving(false);
      setConfirmPhase(false);
    }
  };

  const reset = () => {
    setDraft(draftFrom(config));
    setStatus(null);
    setConfirmPhase(false);
  };

  const lockIso = fromLocalInput(draft.lock);
  const wagerIso = fromLocalInput(draft.wager);
  const pairingDupes = new Set(draft.pairing).size !== 4;

  return (
    <form
      className="retro-card p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      aria-busy={saving}
    >
      <h2 className="scoreboard-heading text-[0.6rem] rounded mb-4">TOURNAMENT CONFIG</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cfg-year" className={labelClass}>
            Year
          </label>
          <input
            id="cfg-year"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            value={draft.year}
            onChange={(e) => set("year", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="cfg-phase" className={labelClass}>
            Active phase
          </label>
          <select
            id="cfg-phase"
            value={draft.phase}
            onChange={(e) => set("phase", e.target.value as AdminConfig["active_phase"])}
            className={inputClass}
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {phaseLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cfg-lock" className={labelClass}>
            Bracket lock deadline (your local time)
          </label>
          <input
            id="cfg-lock"
            type="datetime-local"
            value={draft.lock}
            onChange={(e) => set("lock", e.target.value)}
            className={inputClass}
          />
          <p className="font-body text-xs text-navy/60 mt-1" data-testid="lock-utc">
            {lockIso ? formatUtc(lockIso) : "Invalid date"}
          </p>
        </div>
        <div>
          <label htmlFor="cfg-wager" className={labelClass}>
            Wager creation deadline (your local time)
          </label>
          <input
            id="cfg-wager"
            type="datetime-local"
            value={draft.wager}
            onChange={(e) => set("wager", e.target.value)}
            className={inputClass}
          />
          <p className="font-body text-xs text-navy/60 mt-1" data-testid="wager-utc">
            {wagerIso ? formatUtc(wagerIso) : "Invalid date"}
          </p>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="font-body text-xs text-navy/70 mb-2">Points per correct pick</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MULTIPLIER_KEYS.map((k) => (
            <div key={k}>
              <label htmlFor={`cfg-mult-${k}`} className="font-body text-xs text-navy/60 block mb-1">
                {phaseLabel(k)}
              </label>
              <input
                id={`cfg-mult-${k}`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={draft.multipliers[k]}
                onChange={(e) => set("multipliers", { ...draft.multipliers, [k]: e.target.value })}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="font-body text-xs text-navy/70 mb-2">
          Final Four pairing (which regions meet in each semifinal)
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["Semi A top", "Semi A bottom", "Semi B top", "Semi B bottom"] as const).map((label, i) => (
            <div key={label}>
              <label htmlFor={`cfg-pair-${i}`} className="font-body text-xs text-navy/60 block mb-1">
                {label}
              </label>
              <select
                id={`cfg-pair-${i}`}
                value={draft.pairing[i]}
                onChange={(e) => {
                  const next = [...draft.pairing] as Draft["pairing"];
                  next[i] = e.target.value as Region;
                  set("pairing", next);
                }}
                className={`${inputClass} capitalize ${pairingDupes ? "border-burnt-orange" : ""}`}
              >
                {REGION_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="font-body text-xs text-navy/60 mt-2">
          Changing the pairing rewires the Elite Eight; it&apos;s refused once an Elite Eight or Final Four game is final.
        </p>
      </fieldset>

      {errors.length > 0 && (
        <ul className="mt-4 font-body text-xs text-burnt-orange list-disc pl-4 space-y-0.5" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {confirmPhase && updates.active_phase && (
        <div
          className="mt-4 border-2 border-gold bg-gold/10 rounded p-3 font-body text-xs text-navy"
          role="alertdialog"
          aria-label="Confirm phase change"
        >
          <p className="mb-2">
            Change the active phase from <strong>{phaseLabel(config.active_phase)}</strong> to{" "}
            <strong>{phaseLabel(updates.active_phase)}</strong>? This changes what the homepage and dashboard show.
          </p>
          <div className="flex gap-2">
            <button type="submit" className="retro-btn retro-btn-primary text-[0.6rem] py-2 px-3" disabled={saving}>
              Yes, save
            </button>
            <button
              type="button"
              onClick={() => setConfirmPhase(false)}
              className="retro-btn text-[0.6rem] py-2 px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!canSave} className="retro-btn retro-btn-primary text-[0.6rem] py-2 px-4">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={reset} disabled={!dirty || saving} className="retro-btn text-[0.6rem] py-2 px-4">
          Reset
        </button>
        <span className="font-body text-xs text-navy/60" aria-live="polite">
          {status ? (
            <span className={status.kind === "error" ? "text-burnt-orange" : "text-forest"}>{status.message}</span>
          ) : dirty ? (
            `Unsaved: ${changedKeys.map((k) => k.replace(/_/g, " ")).join(", ")}`
          ) : (
            "No unsaved changes"
          )}
        </span>
      </div>
    </form>
  );
}
