/**
 * Pure builders for notification copy. No I/O — used by send-batch for push,
 * SMS and email, and unit-tested directly.
 *
 * Queue payloads (see process-final-game.ts, update-scores cron, api/wagers):
 *  - game_result:   { game_id, game_slot, round, team_a, team_b, winner, loser,
 *                     winner_seed, loser_seed, score, picked, correct, points }
 *  - wager_request: { wager_id, challenger_name, stakes }
 *  - wager_result:  { wager_id, stakes, opponent_id, opponent_name?, your_score,
 *                     their_score, won, tie }                       (final)
 *                   { wager_id, status, opponent_name, stakes }     (update)
 */

export interface QueueItemLike {
  type: string;
  payload: Record<string, unknown> | null;
  batch_key?: string | null;
  created_at?: string | null;
}

export interface BatchMessage {
  title: string;
  body: string;
  url: string;
}

/** How many individual picks to list before collapsing into "+N more". */
export const MAX_LISTED_PICKS = 4;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/** Items that belong to the same cron run (batch_key) or, failing that, the same UTC day. */
function recencyKey(item: QueueItemLike): string {
  return item.batch_key ?? item.created_at?.slice(0, 10) ?? "";
}

function sortByCreated(items: QueueItemLike[]): QueueItemLike[] {
  return [...items].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? "")
  );
}

/** One "Duke ✓ +20" / "Kansas ✗" fragment for a game_result payload. */
export function formatPickResult(payload: Record<string, unknown> | null): string {
  const p = payload ?? {};
  const picked = str(p.picked) ?? str(p.winner);
  if (!picked) return "Game decided";
  if (p.correct === true) {
    const points = num(p.points);
    return points != null && points > 0
      ? `${picked} ✓ +${formatPoints(points)}`
      : `${picked} ✓`;
  }
  if (p.correct === false) return `${picked} ✗`;
  const winner = str(p.winner);
  return winner ? `${winner} won` : picked;
}

function buildGameLines(games: QueueItemLike[]): string[] {
  if (games.length === 0) return [];
  const sorted = sortByCreated(games);
  const latestKey = recencyKey(sorted[sorted.length - 1]);
  const recent = sorted.filter((g) => recencyKey(g) === latestKey);
  const earlier = sorted.filter((g) => recencyKey(g) !== latestKey);

  const lines: string[] = [];

  const fragments = recent
    .slice(0, MAX_LISTED_PICKS)
    .map((g) => formatPickResult(g.payload));
  if (recent.length > MAX_LISTED_PICKS) {
    fragments.push(`+${recent.length - MAX_LISTED_PICKS} more`);
  }
  const rightToday = recent.filter((g) => g.payload?.correct === true).length;
  fragments.push(`${rightToday} of ${recent.length} right today`);
  lines.push(fragments.join(" · "));

  if (earlier.length > 0) {
    const rightEarlier = earlier.filter((g) => g.payload?.correct === true).length;
    lines.push(
      `${earlier.length} earlier game${earlier.length === 1 ? "" : "s"}: ${rightEarlier} right`
    );
  }
  return lines;
}

function buildWagerRequestLine(payload: Record<string, unknown> | null): string {
  const p = payload ?? {};
  const name = str(p.challenger_name) ?? "Someone";
  const stakes = str(p.stakes);
  return stakes ? `${name} challenged you: ${stakes}` : `${name} challenged you to a wager`;
}

function buildWagerResultLine(payload: Record<string, unknown> | null): {
  title: string;
  line: string;
} {
  const p = payload ?? {};
  const stakes = str(p.stakes);
  const name = str(p.opponent_name) ?? "your opponent";
  const status = str(p.status);

  // Status updates from api/wagers (accept / decline / revoke).
  if (status) {
    const suffix = stakes ? `: ${stakes}` : "";
    if (status === "accepted") {
      return { title: "Wager accepted", line: `${name} accepted your wager${suffix}` };
    }
    if (status === "declined") {
      return { title: "Wager declined", line: `${name} declined your wager${suffix}` };
    }
    if (status === "revoked") {
      return { title: "Wager revoked", line: `${name} revoked the wager${suffix}` };
    }
    return { title: "Wager update", line: `Wager with ${name} is now ${status}${suffix}` };
  }

  // Final result from the championship cron.
  const verb = p.tie === true ? "tied" : p.won === true ? "won" : "lost";
  const yours = num(p.your_score);
  const theirs = num(p.their_score);
  const scoreBit = yours != null && theirs != null ? ` (${yours}–${theirs})` : "";
  const stakesBit = stakes ? `: ${stakes}` : "";
  return {
    title: `Wager ${verb}`,
    line: `You ${verb} the wager with ${name}${stakesBit}${scoreBit}`,
  };
}

/**
 * Consolidate every pending queue item for one user into a single message.
 * Returns null when nothing in `items` is worth sending.
 */
export function buildBatchMessage(items: QueueItemLike[]): BatchMessage | null {
  const games = items.filter((i) => i.type === "game_result");
  const requests = items.filter((i) => i.type === "wager_request");
  const results = sortByCreated(items.filter((i) => i.type === "wager_result"));
  const bracketUpdates = items.filter((i) => i.type === "bracket_update");

  const lines: string[] = [];
  let title: string | null = null;
  let url = "/dashboard";

  // Wager outcomes are the most consequential, so they lead.
  for (const r of results) {
    const { title: t, line } = buildWagerResultLine(r.payload);
    lines.push(line);
    if (!title) title = t;
    url = "/wagers";
  }
  for (const r of requests) {
    lines.push(buildWagerRequestLine(r.payload));
    if (!title) title = "New wager challenge";
    url = "/wagers";
  }

  const gameLines = buildGameLines(games);
  if (gameLines.length > 0) {
    lines.push(...gameLines);
    if (!title) {
      title = `${games.length} game${games.length === 1 ? "" : "s"} decided`;
    }
  }

  if (bracketUpdates.length > 0) {
    lines.push("Your bracket was updated");
    if (!title) title = "Bracket update";
  }

  if (lines.length === 0) return null;
  return { title: title ?? "March Madness update", body: lines.join("\n"), url };
}

/** Single-line form for SMS. */
export function toSmsText(message: BatchMessage): string {
  return `${message.title}: ${message.body.replace(/\n/g, " · ")}`;
}
