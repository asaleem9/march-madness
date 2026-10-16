"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRealtimeGames } from "@/hooks/useRealtimeGames";
import { useChangedSlots } from "@/hooks/useChangedSlots";
import { ROUND_DISPLAY_NAMES, REGION_DISPLAY_NAMES } from "@/lib/utils";
import { espnGameUrl } from "@/lib/espn";

export interface ScheduleTeam {
  id: number;
  name: string;
  seed: number;
  abbreviation: string;
  logo_url: string | null;
  eliminated?: boolean | null;
}

export interface ScheduleGame {
  id: number;
  round: string;
  region: string | null;
  game_slot: number;
  team_a_id: number | null;
  team_b_id: number | null;
  winner_id: number | null;
  status: string;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
  espn_game_id?: string | null;
  clock?: string | null;
  period?: number | null;
  team_a: ScheduleTeam | null;
  team_b: ScheduleTeam | null;
}

export type ScheduleFilter = "all" | "live" | "today" | "mine";

interface ScheduleClientProps {
  games: ScheduleGame[];
  userPicks?: Record<number, number>;
  isLoggedIn?: boolean;
  /** ISO timestamp of the last cron run (`tournament_config.last_score_update_at`). */
  lastUpdatedAt?: string | null;
}

export const ET = "America/New_York";

const ROUND_ORDER = [
  "first_four",
  "first_round",
  "second_round",
  "sweet_16",
  "elite_eight",
  "final_four",
  "championship",
];

/** Calendar-day key (YYYY-MM-DD) for a timestamp in the given zone. */
export function dayKey(iso: string, timeZone: string = ET): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDay(iso: string, timeZone: string = ET): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function formatTime(iso: string, timeZone: string = ET): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

export function formatDateTime(iso: string, timeZone: string = ET): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

/** "1H", "2H", "OT", "2OT"… for a basketball period number. */
export function periodLabel(period: number | null | undefined): string | null {
  if (!period || period < 1) return null;
  if (period === 1) return "1H";
  if (period === 2) return "2H";
  const ot = period - 2;
  return ot === 1 ? "OT" : `${ot}OT`;
}

/** "2H 4:32" — what a live card shows next to LIVE. */
export function liveStatusLabel(game: Pick<ScheduleGame, "clock" | "period">): string | null {
  const p = periodLabel(game.period);
  const clock = game.clock?.trim();
  if (p && clock) return `${p} ${clock}`;
  if (p) return p;
  if (clock) return clock;
  return null;
}

interface DayGroup {
  key: string;
  label: string;
  isToday: boolean;
  games: ScheduleGame[];
}

interface RoundGroup {
  round: string;
  days: DayGroup[];
}

const NO_DATE = "tbd";

export function groupGames(games: ScheduleGame[], todayKey: string): RoundGroup[] {
  return ROUND_ORDER.map((round) => {
    const inRound = games.filter((g) => g.round === round);
    const byDay = new Map<string, DayGroup>();
    for (const g of inRound) {
      const key = g.scheduled_at ? dayKey(g.scheduled_at) : NO_DATE;
      let day = byDay.get(key);
      if (!day) {
        day = {
          key,
          label: g.scheduled_at ? formatDay(g.scheduled_at) : "Date TBD",
          isToday: key === todayKey,
          games: [],
        };
        byDay.set(key, day);
      }
      day.games.push(g);
    }
    // Dated days first (already in scheduled_at order), undated at the end.
    const days = Array.from(byDay.values()).sort((a, b) => {
      if (a.key === NO_DATE) return 1;
      if (b.key === NO_DATE) return -1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    return { round, days };
  }).filter((group) => group.days.length > 0);
}

/** The game the page should scroll to on load: first live, else next upcoming. */
export function findFocusGame(games: ScheduleGame[], now: Date): ScheduleGame | null {
  const live = games.find((g) => g.status === "in_progress");
  if (live) return live;
  const upcoming = games
    .filter((g) => g.status === "scheduled" && g.scheduled_at)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  return (
    upcoming.find((g) => new Date(g.scheduled_at!).getTime() >= now.getTime()) ??
    upcoming[0] ??
    null
  );
}

const subscribeNever = () => () => {};
function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ET;
  } catch {
    return ET;
  }
}

export function ScheduleClient({
  games,
  userPicks = {},
  isLoggedIn = false,
  lastUpdatedAt = null,
}: ScheduleClientProps) {
  useRealtimeGames();
  const changedSlots = useChangedSlots((s) => s.slots);

  // Times render in ET on the server and during hydration (server snapshot),
  // then switch to the viewer's zone — no hydration mismatch.
  const timeZone = useSyncExternalStore(subscribeNever, getLocalTimeZone, () => ET);

  const [todayKey] = useState(() => dayKey(new Date().toISOString()));
  const [filter, setFilter] = useState<ScheduleFilter>("all");

  const teamById = useMemo(() => {
    const map = new Map<number, ScheduleTeam>();
    for (const g of games) {
      if (g.team_a) map.set(g.team_a.id, g.team_a);
      if (g.team_b) map.set(g.team_b.id, g.team_b);
    }
    return map;
  }, [games]);

  const liveCount = games.filter((g) => g.status === "in_progress").length;
  const todayCount = games.filter(
    (g) => g.scheduled_at && dayKey(g.scheduled_at) === todayKey
  ).length;
  const hasPicks = Object.keys(userPicks).length > 0;

  const filtered = useMemo(() => {
    switch (filter) {
      case "live":
        return games.filter((g) => g.status === "in_progress");
      case "today":
        return games.filter((g) => g.scheduled_at && dayKey(g.scheduled_at) === todayKey);
      case "mine":
        return games.filter((g) => userPicks[g.game_slot] !== undefined);
      default:
        return games;
    }
  }, [games, filter, todayKey, userPicks]);

  const grouped = useMemo(() => groupGames(filtered, todayKey), [filtered, todayKey]);

  // Auto-scroll once to the first live or next upcoming game.
  const focusId = useMemo(() => findFocusGame(games, new Date())?.id ?? null, [games]);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || focusId === null) return;
    scrolledRef.current = true;
    // Nothing to scroll past if the target is already the first card.
    if (games[0]?.id === focusId) return;
    const el = document.getElementById(`game-${focusId}`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, [focusId, games]);

  const chips: { id: ScheduleFilter; label: string; count?: number; show: boolean }[] = [
    { id: "all", label: "All", show: true },
    { id: "live", label: "Live", count: liveCount, show: true },
    { id: "today", label: "Today", count: todayCount, show: true },
    { id: "mine", label: "My picks", show: isLoggedIn && hasPicks },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter games" className="flex flex-wrap gap-2">
          {chips
            .filter((c) => c.show)
            .map((c) => {
              const active = filter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(c.id)}
                  className={`retro-btn text-[0.6rem] px-3 py-2 ${
                    active ? "retro-btn-primary" : ""
                  }`}
                >
                  {c.label}
                  {c.count !== undefined && c.count > 0 && (
                    <span className="font-body text-xs ml-1.5 opacity-80">({c.count})</span>
                  )}
                </button>
              );
            })}
        </div>
        <p className="font-body text-xs text-navy/60">
          {isLoggedIn ? (
            lastUpdatedAt ? (
              <>Last updated {formatDateTime(lastUpdatedAt, timeZone)}</>
            ) : (
              <>Scores update automatically</>
            )
          ) : (
            <>
              <a href="/login?redirect=/schedule" className="text-burnt-orange underline">
                Log in
              </a>{" "}
              for live updates
              {lastUpdatedAt && <> · Last updated {formatDateTime(lastUpdatedAt, timeZone)}</>}
            </>
          )}
        </p>
      </div>

      {grouped.map((group) => (
        <section key={group.round} aria-labelledby={`round-${group.round}`}>
          <h2
            id={`round-${group.round}`}
            className="scoreboard-heading text-[0.6rem] rounded mb-4"
          >
            {ROUND_DISPLAY_NAMES[group.round as keyof typeof ROUND_DISPLAY_NAMES] || group.round}
          </h2>
          <div className="space-y-5">
            {group.days.map((day) => (
              <div key={day.key}>
                <h3 className="flex items-center gap-2 font-body text-xs font-bold uppercase tracking-wide text-navy/60 mb-2">
                  {day.label}
                  {day.isToday && (
                    <span className="font-display text-[0.6rem] bg-gold text-navy px-2 py-0.5 rounded">
                      Today
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {day.games.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      pick={userPicks[game.game_slot]}
                      pickedTeam={
                        userPicks[game.game_slot] !== undefined
                          ? teamById.get(userPicks[game.game_slot]) ?? null
                          : null
                      }
                      timeZone={timeZone}
                      flash={changedSlots.includes(game.game_slot)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {grouped.length === 0 && (
        <div className="text-center py-12 text-navy/50 text-sm">
          {games.length === 0
            ? "No games scheduled yet. Check back once the tournament bracket is set."
            : filter === "live"
            ? "No games are live right now."
            : filter === "today"
            ? "No games today."
            : filter === "mine"
            ? "None of your picks are on the schedule yet."
            : "No games match this filter."}
        </div>
      )}
    </div>
  );
}

interface GameCardProps {
  game: ScheduleGame;
  pick: number | undefined;
  pickedTeam: ScheduleTeam | null;
  timeZone: string;
  flash: boolean;
}

function GameCard({ game, pick, pickedTeam, timeZone, flash }: GameCardProps) {
  const isLive = game.status === "in_progress";
  const isFinal = game.status === "final";
  const live = isLive ? liveStatusLabel(game) : null;

  // The user's pick isn't one of the two teams here. Once both teams are set
  // (or the picked team has been eliminated) that pick is dead for this slot.
  const bothTeamsSet = game.team_a_id !== null && game.team_b_id !== null;
  const pickIsPresent = pick !== undefined && (pick === game.team_a_id || pick === game.team_b_id);
  const pickIsOut =
    pick !== undefined && !pickIsPresent && (bothTeamsSet || pickedTeam?.eliminated === true);

  return (
    <article
      id={`game-${game.id}`}
      aria-label={`${game.team_a?.name ?? "TBD"} vs ${game.team_b?.name ?? "TBD"}`}
      className={`retro-card p-4 scroll-mt-20 ${
        isLive ? "border-burnt-orange" : isFinal ? "opacity-80" : ""
      } ${flash ? "flash-update" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          {isLive && (
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display text-[0.6rem] text-burnt-orange animate-pulse">
                LIVE
              </span>
              {live && (
                <span className="font-body text-xs font-bold text-navy" aria-label={`Game clock ${live}`}>
                  {live}
                </span>
              )}
            </div>
          )}
          {game.region && (
            <div className="font-body text-xs text-navy/50">
              {REGION_DISPLAY_NAMES[game.region] || game.region}
            </div>
          )}
        </div>
        {game.espn_game_id && (
          <a
            href={espnGameUrl(game.espn_game_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-xs text-burnt-orange underline shrink-0"
            aria-label="Open this game on ESPN (opens in a new tab)"
          >
            ESPN ↗
          </a>
        )}
      </div>

      <div className="space-y-1">
        {[
          { team: game.team_a, score: game.score_a },
          { team: game.team_b, score: game.score_b },
        ].map(({ team, score }, i) => {
          const isPicked = !!team && pick === team.id;
          const isPickCorrect = isPicked && isFinal && game.winner_id === team!.id;
          const isPickWrong = isPicked && isFinal && game.winner_id !== team!.id;
          const isWinner = !!team && isFinal && game.winner_id === team.id;
          const showScore = score !== null && game.status !== "scheduled";

          return (
            <div
              key={i}
              className={`flex items-center justify-between rounded px-1.5 py-0.5 -mx-1.5 ${
                isPicked
                  ? isPickCorrect
                    ? "bg-forest/10 border-l-2 border-forest"
                    : isPickWrong
                    ? "bg-burnt-orange/10 border-l-2 border-burnt-orange"
                    : "bg-gold/10 border-l-2 border-gold"
                  : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {team ? (
                  <>
                    {team.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={team.logo_url}
                        alt=""
                        className="w-5 h-5 object-contain shrink-0"
                      />
                    ) : (
                      <div
                        className="w-5 h-5 rounded-full bg-navy/15 shrink-0 flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <span className="text-[0.5rem] font-body font-bold text-navy">
                          {team.abbreviation.slice(0, 3)}
                        </span>
                      </div>
                    )}
                    <span className="font-body text-xs text-navy/50 shrink-0">{team.seed}</span>
                    <span
                      className={`font-body text-xs truncate ${isWinner ? "font-bold" : ""}`}
                    >
                      {team.name}
                    </span>
                    {isPicked && (
                      <span
                        className={`font-body text-xs font-bold px-1 py-0.5 rounded shrink-0 ${
                          isPickCorrect
                            ? "bg-forest/20 text-forest"
                            : isPickWrong
                            ? "bg-burnt-orange/20 text-burnt-orange line-through"
                            : "bg-gold/30 text-navy"
                        }`}
                      >
                        {isPickCorrect ? "Correct" : isPickWrong ? "Wrong" : "Your pick"}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-body text-xs text-navy/40">TBD</span>
                )}
              </div>
              {showScore ? (
                <span className={`font-display text-xs ${isWinner ? "text-forest" : ""}`}>
                  {score}
                </span>
              ) : team ? (
                <span className="font-display text-xs text-navy/20">&mdash;</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {pickIsOut && (
        <div className="game-slot-ghost mt-2 -mx-1.5 rounded-b" data-testid="ghost-pick">
          Your pick ({pickedTeam?.abbreviation ?? "—"}) is out
        </div>
      )}

      {game.scheduled_at && game.status === "scheduled" && (
        <div className="font-body text-xs text-navy/50 mt-2">
          <time dateTime={game.scheduled_at}>{formatTime(game.scheduled_at, timeZone)}</time>
        </div>
      )}
      {isFinal && (
        <div className="flex items-center gap-2 mt-2">
          <span className="font-display text-[0.6rem] text-forest">FINAL</span>
          {game.scheduled_at && (
            <time dateTime={game.scheduled_at} className="font-body text-xs text-navy/50">
              {formatDay(game.scheduled_at, timeZone)}
            </time>
          )}
        </div>
      )}
    </article>
  );
}
