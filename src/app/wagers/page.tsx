"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader } from "@/components/Loader";
import { isPastWagerDeadline } from "@/lib/tournament-config";

interface Wager {
  id: string;
  stakes: string;
  status: string;
  challenger_id: string;
  opponent_id: string;
  challenger_bracket_id: string | null;
  opponent_bracket_id: string | null;
  winner_id: string | null;
  created_at: string;
  challenger: { display_name: string } | null;
  opponent: { display_name: string } | null;
}

interface BracketLite {
  id: string;
  user_id: string;
  name: string;
  is_primary: boolean;
  score: number | null;
}

interface PlayerOption {
  id: string;
  display_name: string;
  hasBracket: boolean;
}

type Tab = "pending" | "accepted" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "PENDING" },
  { key: "accepted", label: "ACTIVE" },
  { key: "history", label: "HISTORY" },
];

const STAKES_MAX_LENGTH = 120;
const selectClass = "w-full border-2 border-navy p-3 font-body text-base bg-cream disabled:opacity-50";

const WAGER_SELECT =
  "*, challenger:profiles!challenger_id(display_name), opponent:profiles!opponent_id(display_name)";

/** `?tab=pending|active|history` (the dashboard deep-links here); `accepted` is accepted as an alias. */
function tabFromParam(value: string | null): Tab {
  switch (value) {
    case "pending":
    case "history":
      return value;
    case "active":
    case "accepted":
      return "accepted";
    default:
      return "pending";
  }
}

export default function WagersPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Loader />
        </div>
      }
    >
      <WagersContent />
    </Suspense>
  );
}

function WagersContent() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [brackets, setBrackets] = useState<BracketLite[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [opponentId, setOpponentId] = useState("");
  const [bracketId, setBracketId] = useState("");
  const [stakes, setStakes] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const [createError, setCreateError] = useState("");
  const [respondError, setRespondError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wagerDeadline, setWagerDeadline] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadWagers = useCallback(
    async (uid: string) => {
      const { data } = await supabase
        .from("wagers")
        .select(WAGER_SELECT)
        .or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`)
        .order("created_at", { ascending: false });
      setWagers((data as unknown as Wager[]) || []);
    },
    [supabase]
  );

  const loadBrackets = useCallback(async () => {
    // Every bracket is readable by signed-in users; one query gives us both
    // "who has a bracket" for the picker and the scores for the cards.
    const { data } = await supabase
      .from("brackets")
      .select("id, user_id, name, is_primary, score");
    const list = (data as BracketLite[] | null) ?? [];
    setBrackets(list);
    return list;
  }, [supabase]);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?redirect=/wagers");
        return;
      }
      setUserId(user.id);

      const [, allBrackets, { data: profiles }, { data: configData }] = await Promise.all([
        loadWagers(user.id),
        loadBrackets(),
        supabase.from("profiles").select("id, display_name").neq("id", user.id),
        supabase
          .from("tournament_config")
          .select("wager_creation_deadline")
          .eq("id", 1)
          .single(),
      ]);

      const usersWithBrackets = new Set(allBrackets.map((b) => b.user_id));
      setPlayers(
        ((profiles as { id: string; display_name: string | null }[] | null) ?? [])
          .map((p) => ({
            id: p.id,
            display_name: p.display_name || "Unnamed player",
            hasBracket: usersWithBrackets.has(p.id),
          }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }))
      );

      const mine = allBrackets.filter((b) => b.user_id === user.id);
      if (mine.length) {
        setBracketId(mine.find((b) => b.is_primary)?.id || mine[0].id);
      }

      if (configData?.wager_creation_deadline) {
        setWagerDeadline(configData.wager_creation_deadline);
      }

      setLoading(false);
    }
    load();
  }, [supabase, router, loadWagers, loadBrackets]);

  const myBrackets = brackets.filter((b) => b.user_id === userId);
  const bracketById = new Map(brackets.map((b) => [b.id, b]));
  const bracketByUser = new Map<string, BracketLite>();
  for (const b of brackets) {
    if (!bracketByUser.has(b.user_id) || b.is_primary) bracketByUser.set(b.user_id, b);
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentId || !bracketId || !stakes.trim() || submitting) return;
    setCreateError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/wagers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponent_id: opponentId,
          challenger_bracket_id: bracketId,
          stakes: stakes.trim(),
        }),
      });

      if (response.ok) {
        setShowCreate(false);
        setStakes("");
        setOpponentId("");
        if (userId) await loadWagers(userId);
      } else {
        const data = await response.json().catch(() => null);
        setCreateError(data?.error || "Failed to create wager. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const wagerClosed = isPastWagerDeadline(
    wagerDeadline ? { wager_creation_deadline: wagerDeadline } : null
  );

  const handleRespond = async (wagerId: string, action: "accept" | "decline" | "revoke") => {
    setRespondingId(wagerId);
    setRespondError("");
    const body: Record<string, string> = { wager_id: wagerId, action };
    if (action === "accept" && bracketId) {
      body.bracket_id = bracketId;
    }

    try {
      const response = await fetch("/api/wagers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setWagers((prev) =>
          prev.map((w) =>
            w.id === wagerId
              ? {
                  ...w,
                  status: action === "accept" ? "accepted" : "declined",
                  opponent_bracket_id:
                    action === "accept" ? bracketId || w.opponent_bracket_id : w.opponent_bracket_id,
                }
              : w
          )
        );
      } else {
        const data = await response.json().catch(() => null);
        setRespondError(data?.error || "Something went wrong. Try again.");
      }
    } finally {
      setRespondingId(null);
    }
  };

  const filteredWagers = wagers.filter((w) => {
    if (activeTab === "history") return w.status === "resolved" || w.status === "declined";
    return w.status === activeTab;
  });
  const activeLabel = TABS.find((t) => t.key === activeTab)!.label.toLowerCase();

  /** Scores for the two sides of a wager, from the attached brackets (or the user's primary one). */
  const scoresFor = (wager: Wager, isChallenger: boolean) => {
    const challengerBracket =
      (wager.challenger_bracket_id && bracketById.get(wager.challenger_bracket_id)) ||
      bracketByUser.get(wager.challenger_id);
    const opponentBracket =
      (wager.opponent_bracket_id && bracketById.get(wager.opponent_bracket_id)) ||
      bracketByUser.get(wager.opponent_id);
    const mine = isChallenger ? challengerBracket : opponentBracket;
    const theirs = isChallenger ? opponentBracket : challengerBracket;
    if (!mine || !theirs) return null;
    return { mine: mine.score ?? 0, theirs: theirs.score ?? 0 };
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Loader />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display text-navy text-sm">WAGERS</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          disabled={wagerClosed && !showCreate}
          className="retro-btn retro-btn-primary text-[0.6rem] disabled:opacity-50"
          title={wagerClosed ? "The wager deadline has passed" : undefined}
        >
          {showCreate ? "Cancel" : "New Wager"}
        </button>
      </div>

      <p className="text-xs text-navy/50 mb-4">
        Challenge a friend to a friendly IOU wager. Whoever&apos;s bracket scores higher wins; a tie is a push. Stakes are just for fun — loser honors the bet.
      </p>

      {wagerDeadline && (
        <div className="text-[0.6rem] font-display text-navy/50 mb-6">
          WAGER DEADLINE: {new Date(wagerDeadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
          {wagerClosed && (
            <span className="text-burnt-orange ml-2">— CLOSED</span>
          )}
        </div>
      )}

      {/* Create wager form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="retro-card p-6 mb-6 space-y-4"
        >
          {createError && (
            <div role="alert" className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 rounded">
              {createError}
            </div>
          )}
          {myBrackets.length === 0 && (
            <div className="bg-gold/20 border-2 border-gold text-navy text-xs p-3 rounded">
              You need to <Link href="/bracket/new" className="text-burnt-orange font-bold hover:underline">create a bracket</Link> before you can wager.
            </div>
          )}
          <div>
            <label htmlFor="wager-opponent" className="font-display text-[0.6rem] text-navy block mb-2">
              CHALLENGE
            </label>
            <select
              id="wager-opponent"
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              className={selectClass}
              required
            >
              <option value="">Select a player</option>
              {players.map((u) => (
                <option key={u.id} value={u.id} disabled={!u.hasBracket}>
                  {u.display_name}
                  {u.hasBracket ? "" : " (no bracket)"}
                </option>
              ))}
            </select>
            <p className="font-body text-xs text-navy/50 mt-1">
              Players without a bracket can&apos;t be challenged yet.
            </p>
          </div>
          <div>
            <label htmlFor="wager-bracket" className="font-display text-[0.6rem] text-navy block mb-2">
              YOUR BRACKET
            </label>
            <select
              id="wager-bracket"
              value={bracketId}
              onChange={(e) => setBracketId(e.target.value)}
              className={selectClass}
              required
              disabled={myBrackets.length === 0}
            >
              {myBrackets.length === 0 && <option value="">No brackets available</option>}
              {myBrackets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_primary ? "(Primary)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wager-stakes" className="font-display text-[0.6rem] text-navy block mb-2">
              STAKES
            </label>
            <input
              id="wager-stakes"
              type="text"
              value={stakes}
              onChange={(e) => setStakes(e.target.value)}
              placeholder="Loser buys winner dinner"
              maxLength={STAKES_MAX_LENGTH}
              className="w-full border-2 border-navy p-3 font-body text-base bg-cream"
              required
            />
            <p className="font-body text-xs text-navy/50 mt-1 text-right">
              {stakes.length}/{STAKES_MAX_LENGTH}
            </p>
          </div>
          {wagerClosed && (
            <p className="text-burnt-orange text-xs">
              The wager deadline has passed — new wagers are closed.
            </p>
          )}
          <button
            type="submit"
            className="retro-btn retro-btn-secondary disabled:opacity-50"
            disabled={myBrackets.length === 0 || submitting || wagerClosed}
          >
            {submitting ? "Sending…" : "Send Challenge"}
          </button>
        </form>
      )}

      {respondError && (
        <div role="alert" className="bg-burnt-orange/10 border-2 border-burnt-orange text-burnt-orange text-xs p-3 mb-4 rounded">
          {respondError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6" role="tablist" aria-label="Wager status">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`font-display text-[0.6rem] px-4 py-2.5 min-h-11 border-2 border-navy rounded transition-colors ${
              activeTab === tab.key
                ? "bg-navy text-gold"
                : "bg-cream text-navy hover:bg-navy/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Wager list */}
      <div className="space-y-3">
        {filteredWagers.length === 0 && (
          <div className="text-center py-8 text-navy/50 text-sm">
            No {activeLabel} wagers
          </div>
        )}
        {filteredWagers.map((wager) => {
          const isChallenger = wager.challenger_id === userId;
          const otherPlayer = isChallenger
            ? wager.opponent?.display_name
            : wager.challenger?.display_name;
          const awaitingMe = wager.status === "pending" && !isChallenger;
          const isTie = wager.status === "resolved" && wager.winner_id === null;
          const iWon = wager.status === "resolved" && wager.winner_id === userId;
          const scores =
            wager.status === "accepted" || wager.status === "resolved"
              ? scoresFor(wager, isChallenger)
              : null;

          return (
            <div key={wager.id} className="retro-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-navy/60">
                  {isChallenger ? "You challenged" : "Challenged by"}{" "}
                  <span className="font-bold">{otherPlayer}</span>
                </div>
                <div className="flex items-center gap-2">
                  {wager.status === "resolved" && isTie && (
                    <span className="font-display text-[0.6rem] px-2 py-1 rounded bg-navy/10 text-navy border-2 border-navy/30">
                      TIE
                    </span>
                  )}
                  {wager.status === "resolved" && !isTie && (
                    <div className="flex items-center gap-1">
                      <Image
                        src={iWon ? "/images/wagers/won.png" : "/images/wagers/lost.png"}
                        alt=""
                        width={24}
                        height={24}
                      />
                      <span
                        className={`font-display text-[0.6rem] px-2 py-1 rounded ${
                          iWon ? "bg-forest text-cream" : "bg-burnt-orange text-cream"
                        }`}
                      >
                        {iWon ? "WON" : "LOST"}
                      </span>
                    </div>
                  )}
                  {wager.status === "declined" && (
                    <span className="font-display text-[0.6rem] text-navy/40">
                      {isChallenger ? "REVOKED" : "DECLINED"}
                    </span>
                  )}
                  {wager.status === "pending" && (
                    <div className="flex items-center gap-1">
                      <Image
                        src="/images/wagers/pending.png"
                        alt=""
                        width={24}
                        height={24}
                      />
                      <span className="font-display text-[0.6rem] text-gold">
                        PENDING
                      </span>
                    </div>
                  )}
                  {wager.status === "accepted" && (
                    <div className="flex items-center gap-1">
                      <Image
                        src="/images/wagers/accepted.png"
                        alt=""
                        width={24}
                        height={24}
                      />
                      <span className="font-display text-[0.6rem] text-forest">
                        ACTIVE
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="font-body text-sm font-bold mb-2">
                {wager.stakes}
              </div>
              {scores && (
                <div className="font-body text-xs text-navy/70 mb-2 flex items-center gap-2">
                  <span className="font-display text-[0.6rem] text-navy/40">
                    {wager.status === "resolved" ? "FINAL" : "LIVE"}
                  </span>
                  <span>
                    You <strong className="text-navy">{scores.mine}</strong> –{" "}
                    <strong className="text-navy">{scores.theirs}</strong> Them
                  </span>
                </div>
              )}
              {awaitingMe && myBrackets.length === 0 && (
                <div className="bg-gold/20 border-2 border-gold text-navy text-xs p-3 rounded mt-3">
                  <Link href="/bracket/new" className="text-burnt-orange font-bold hover:underline">
                    Create a bracket first
                  </Link>{" "}
                  — a wager is scored against your bracket.
                </div>
              )}
              {awaitingMe && myBrackets.length > 0 && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleRespond(wager.id, "accept")}
                    disabled={respondingId === wager.id}
                    className="retro-btn retro-btn-secondary text-[0.6rem] py-2.5 px-4 min-h-11 disabled:opacity-50"
                  >
                    {respondingId === wager.id ? "..." : "Accept"}
                  </button>
                  <button
                    onClick={() => handleRespond(wager.id, "decline")}
                    disabled={respondingId === wager.id}
                    className="retro-btn text-[0.6rem] py-2.5 px-4 min-h-11 bg-cream disabled:opacity-50"
                  >
                    {respondingId === wager.id ? "..." : "Decline"}
                  </button>
                </div>
              )}
              {wager.status === "pending" && isChallenger && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setShowRevokeConfirm(wager.id)}
                    disabled={respondingId === wager.id}
                    className="retro-btn text-[0.6rem] py-2.5 px-4 min-h-11 bg-cream text-burnt-orange border-burnt-orange disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              )}
              <div className="font-body text-xs text-navy/40 mt-2">
                {new Date(wager.created_at).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Revoke confirmation modal */}
      {showRevokeConfirm && (() => {
        const wager = wagers.find((w) => w.id === showRevokeConfirm);
        if (!wager) return null;
        const otherPlayer = wager.challenger_id === userId
          ? wager.opponent?.display_name
          : wager.challenger?.display_name;
        return (
          <div className="fixed inset-0 bg-navy/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="revoke-heading">
            <div className="retro-card bg-cream max-w-md w-full p-6 space-y-4 border-4 border-navy">
              <h2 id="revoke-heading" className="font-display text-[0.6rem] text-navy text-center">
                REVOKE WAGER?
              </h2>
              <p className="font-body text-sm text-navy/80 text-center">
                Revoke your wager &ldquo;{wager.stakes}&rdquo; with{" "}
                <strong>{otherPlayer}</strong>? This can&apos;t be undone.
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => setShowRevokeConfirm(null)}
                  className="retro-btn retro-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleRespond(wager.id, "revoke");
                    setShowRevokeConfirm(null);
                  }}
                  className="retro-btn retro-btn-primary bg-burnt-orange border-burnt-orange"
                >
                  Revoke It
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
