"use client";

import { useState } from "react";

export interface ActionResult {
  ok: boolean;
  status: number;
  body: unknown;
  at: string;
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Collapsible raw JSON — used under every result so nothing is hidden. */
export function RawJson({ value, label = "Raw JSON" }: { value: unknown; label?: string }) {
  return (
    <details className="mt-2">
      <summary className="font-body text-xs text-navy/60 cursor-pointer hover:text-burnt-orange">
        {label}
      </summary>
      <pre className="mt-1 max-h-72 overflow-auto bg-navy text-cream font-body text-[11px] leading-snug p-2 rounded">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/**
 * Generic result renderer for admin actions: an error line, then every
 * top-level scalar as a key/value row, then `details[]` as a list, then the
 * raw JSON. Keeps each button's output readable without a bespoke layout.
 */
export function ResultPane({ result }: { result: ActionResult | null }) {
  const [showAll, setShowAll] = useState(false);
  if (!result) return null;

  const body = (result.body ?? {}) as Record<string, unknown>;
  const error = typeof body.error === "string" ? body.error : !result.ok ? `HTTP ${result.status}` : null;
  const scalars = Object.entries(body).filter(([k, v]) => k !== "error" && k !== "timestamp" && isScalar(v));
  const details = Array.isArray(body.details) ? (body.details as unknown[]).map(String) : [];
  const shown = showAll ? details : details.slice(0, 12);

  return (
    <div
      className={`mt-2 border-2 rounded p-2 font-body text-xs ${
        error ? "border-burnt-orange bg-burnt-orange/5" : "border-forest/40 bg-forest/5"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex justify-between gap-2 text-navy/60">
        <span>{error ? "Failed" : "OK"}</span>
        <time dateTime={result.at}>{new Date(result.at).toLocaleTimeString()}</time>
      </div>
      {error && <p className="text-burnt-orange font-bold mt-1">{error}</p>}
      {scalars.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-1">
          {scalars.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-navy/60">{k}</dt>
              <dd className="text-navy font-bold break-all">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {details.length > 0 && (
        <div className="mt-2">
          <p className="text-navy/60">details ({details.length})</p>
          <ul className="list-disc pl-4 space-y-0.5 max-h-56 overflow-auto">
            {shown.map((d, i) => (
              <li key={i} className="break-words">
                {d}
              </li>
            ))}
          </ul>
          {details.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-1 text-burnt-orange hover:underline"
            >
              Show all {details.length}
            </button>
          )}
        </div>
      )}
      <RawJson value={result.body} />
    </div>
  );
}

/** Run a fetch and normalise it into an `ActionResult` (never throws). */
export async function runRequest(input: string, init?: RequestInit): Promise<ActionResult> {
  const at = new Date().toISOString();
  try {
    const res = await fetch(input, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = { error: `Non-JSON response (HTTP ${res.status})` };
    }
    return { ok: res.ok, status: res.status, body, at };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { error: err instanceof Error ? err.message : "Network error" },
      at,
    };
  }
}
