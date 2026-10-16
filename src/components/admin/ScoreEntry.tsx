"use client";

import { useState } from "react";
import { useToast } from "@/hooks/useToast";
import { phaseLabel, readError, type GameForAdmin } from "./types";

interface Props {
  games: GameForAdmin[];
  onGameUpdated: (game: GameForAdmin) => void;
}

interface FormState {
  gameId: number;
  scoreA: string;
  scoreB: string;
  /** null = follow the scores; a number = admin override. */
  winnerOverride: number | null;
  status: "final" | "in_progress";
}

/** Winner implied by the scores: higher score wins, tie → none. */
export function deriveWinner(game: GameForAdmin, scoreA: string, scoreB: string): number | null {
  const a = Number(scoreA);
  const b = Number(scoreB);
  if (scoreA === "" || scoreB === "" || Number.isNaN(a) || Number.isNaN(b)) return null;
  if (a > b) return game.team_a?.id ?? null;
  if (b > a) return game.team_b?.id ?? null;
  return null;
}

const inputClass = "w-full border-2 border-navy p-2 text-base font-body bg-cream rounded-sm";

function TeamLabel({ team }: { team: GameForAdmin["team_a"] }) {
  if (!team) return <span className="text-navy/40">TBD</span>;
  return (
    <span>
      <span className="seed-badge mr-1">{team.seed}</span>
      {team.name}
    </span>
  );
}

export function ScoreEntry({ games, onGameUpdated }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = games.filter((g) => g.status !== "final" && g.team_a && g.team_b);
  const waiting = games.filter((g) => g.status !== "final" && (!g.team_a || !g.team_b)).length;
  const finals = games.filter((g) => g.status === "final");

  const open = (game: GameForAdmin) => {
    setError(null);
    setForm({
      gameId: game.id,
      scoreA: game.score_a != null ? String(game.score_a) : "",
      scoreB: game.score_b != null ? String(game.score_b) : "",
      winnerOverride: null,
      status: "final",
    });
  };

  const close = () => {
    setForm(null);
    setError(null);
  };

  const submit = async (game: GameForAdmin) => {
    if (!form || form.gameId !== game.id) return;
    const scoreA = Number(form.scoreA);
    const scoreB = Number(form.scoreB);
    if (form.scoreA === "" || form.scoreB === "" || !Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
      setError("Enter whole-number scores for both teams");
      return;
    }
    const winnerId = form.status === "final" ? (form.winnerOverride ?? deriveWinner(game, form.scoreA, form.scoreB)) : null;
    if (form.status === "final" && !winnerId) {
      setError("A final game needs a winner — scores are tied, pick one");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id: game.id,
          score_a: scoreA,
          score_b: scoreB,
          winner_id: winnerId,
          status: form.status,
        }),
      });
      if (!res.ok) {
        setError(await readError(res, "Score update failed"));
        return;
      }
      onGameUpdated({
        ...game,
        score_a: scoreA,
        score_b: scoreB,
        winner_id: winnerId,
        status: form.status,
        clock: null,
        period: null,
      });
      toast(form.status === "final" ? `Slot ${game.game_slot} final — picks scored` : `Slot ${game.game_slot} updated`, "success");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = (game: GameForAdmin) => {
    if (!form || form.gameId !== game.id) return null;
    const derived = deriveWinner(game, form.scoreA, form.scoreB);
    const winner = form.winnerOverride ?? derived;
    return (
      <form
        className="mt-3 border-t-2 border-navy/10 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(game);
        }}
        aria-busy={submitting}
      >
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-3 items-end">
          <div>
            <label htmlFor={`score-a-${game.id}`} className="font-body text-xs text-navy/70 block mb-1 truncate">
              {game.team_a?.name}
            </label>
            <input
              id={`score-a-${game.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={form.scoreA}
              onChange={(e) => setForm({ ...form, scoreA: e.target.value, winnerOverride: null })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`score-b-${game.id}`} className="font-body text-xs text-navy/70 block mb-1 truncate">
              {game.team_b?.name}
            </label>
            <input
              id={`score-b-${game.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={form.scoreB}
              onChange={(e) => setForm({ ...form, scoreB: e.target.value, winnerOverride: null })}
              className={inputClass}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`winner-${game.id}`} className="font-body text-xs text-navy/70 block mb-1">
              Winner {form.winnerOverride == null && derived ? "(from scores)" : ""}
            </label>
            <select
              id={`winner-${game.id}`}
              value={winner ?? ""}
              onChange={(e) => setForm({ ...form, winnerOverride: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
              disabled={form.status !== "final"}
            >
              <option value="">— none —</option>
              <option value={game.team_a!.id}>{game.team_a!.name}</option>
              <option value={game.team_b!.id}>{game.team_b!.name}</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`status-${game.id}`} className="font-body text-xs text-navy/70 block mb-1">
              Status
            </label>
            <select
              id={`status-${game.id}`}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}
              className={inputClass}
            >
              <option value="final">Final</option>
              <option value="in_progress">In progress</option>
            </select>
          </div>
        </div>
        {error && (
          <p className="font-body text-xs text-burnt-orange font-bold mt-2" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="submit" disabled={submitting} className="retro-btn retro-btn-primary text-[0.6rem] py-2 px-4">
            {submitting ? "Saving…" : game.status === "final" ? "Re-submit" : "Submit"}
          </button>
          <button type="button" onClick={close} disabled={submitting} className="retro-btn text-[0.6rem] py-2 px-4">
            Cancel
          </button>
        </div>
      </form>
    );
  };

  const header = (game: GameForAdmin) => (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="font-body text-sm text-navy min-w-0">
        <TeamLabel team={game.team_a} />
        <span className="text-navy/50 mx-1">vs</span>
        <TeamLabel team={game.team_b} />
      </div>
      <div className="font-body text-xs text-navy/60 flex flex-wrap gap-x-2">
        <span>slot {game.game_slot}</span>
        <span>{phaseLabel(game.round)}</span>
        {game.region && <span className="capitalize">{game.region}</span>}
        {game.status === "in_progress" && (
          <span className="text-burnt-orange font-bold">
            LIVE{game.period != null ? ` · H${game.period}` : ""}
            {game.clock ? ` ${game.clock}` : ""}
            {game.score_a != null && game.score_b != null ? ` · ${game.score_a}–${game.score_b}` : ""}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <section className="retro-card p-4 sm:p-6">
      <h2 className="scoreboard-heading text-[0.6rem] rounded mb-4">MANUAL SCORE ENTRY</h2>
      <p className="font-body text-xs text-navy/70 mb-4">
        Fallback when ESPN is down or wrong. Submitting a final runs the same pipeline as the cron (advance, score,
        notify, resolve wagers) and is safe to repeat.
      </p>

      {pending.length === 0 ? (
        <p className="font-body text-xs text-navy/50">No games are waiting for a score.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((game) => (
            <li key={game.id} className="border-2 border-navy/20 rounded p-3">
              {header(game)}
              {form?.gameId === game.id ? (
                renderForm(game)
              ) : (
                <button
                  type="button"
                  onClick={() => open(game)}
                  className="mt-2 font-body text-xs text-burnt-orange hover:underline"
                >
                  Enter score
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {waiting > 0 && (
        <p className="font-body text-xs text-navy/50 mt-3">{waiting} more game(s) are waiting on teams.</p>
      )}

      <details className="mt-5">
        <summary className="font-body text-xs text-navy/70 cursor-pointer hover:text-burnt-orange">
          Final games ({finals.length})
        </summary>
        {finals.length === 0 ? (
          <p className="font-body text-xs text-navy/50 mt-2">None yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {finals.map((game) => {
              const winner = game.winner_id === game.team_a?.id ? game.team_a : game.winner_id === game.team_b?.id ? game.team_b : null;
              return (
                <li key={game.id} className="border-2 border-navy/10 rounded p-3">
                  {header(game)}
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-1 font-body text-xs">
                    <span className="text-navy/70">
                      {game.score_a ?? "?"}–{game.score_b ?? "?"} · winner: {winner?.name ?? "unknown"}
                    </span>
                    {form?.gameId !== game.id && (
                      <button type="button" onClick={() => open(game)} className="text-burnt-orange hover:underline">
                        Edit
                      </button>
                    )}
                  </div>
                  {form?.gameId === game.id && renderForm(game)}
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </section>
  );
}
