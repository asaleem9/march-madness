"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Wager {
  id: string;
  stakes: string;
  status: string;
  challenger_id: string;
  opponent_id: string;
  winner_id: string | null;
  created_at: string;
  challenger: { display_name: string } | null;
  opponent: { display_name: string } | null;
}

export default function WagersPage() {
  const supabase = createClient();
  const router = useRouter();
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [users, setUsers] = useState<{ id: string; display_name: string }[]>(
    []
  );
  const [brackets, setBrackets] = useState<
    { id: string; name: string; is_primary: boolean }[]
  >([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [opponentId, setOpponentId] = useState("");
  const [bracketId, setBracketId] = useState("");
  const [stakes, setStakes] = useState("");
  const [activeTab, setActiveTab] = useState<
    "pending" | "accepted" | "resolved"
  >("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      // Fetch wagers
      const { data: wagersData } = await supabase
        .from("wagers")
        .select(
          "*, challenger:profiles!challenger_id(display_name), opponent:profiles!opponent_id(display_name)"
        )
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      setWagers((wagersData as Wager[]) || []);

      // Fetch all users for creating wagers
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, display_name")
        .neq("id", user.id);

      setUsers(usersData || []);

      // Fetch user's brackets
      const { data: bracketsData } = await supabase
        .from("brackets")
        .select("id, name, is_primary")
        .eq("user_id", user.id);

      setBrackets(bracketsData || []);
      if (bracketsData?.length) {
        setBracketId(
          bracketsData.find((b) => b.is_primary)?.id || bracketsData[0].id
        );
      }

      setLoading(false);
    }
    load();
  }, [supabase, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentId || !bracketId || !stakes) return;

    const response = await fetch("/api/wagers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opponent_id: opponentId,
        challenger_bracket_id: bracketId,
        stakes,
      }),
    });

    if (response.ok) {
      setShowCreate(false);
      setStakes("");
      // Reload wagers
      const { data } = await supabase
        .from("wagers")
        .select(
          "*, challenger:profiles!challenger_id(display_name), opponent:profiles!opponent_id(display_name)"
        )
        .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      setWagers((data as Wager[]) || []);
    }
  };

  const handleRespond = async (wagerId: string, action: "accept" | "decline" | "revoke") => {
    const body: Record<string, string> = { wager_id: wagerId, action };
    if (action === "accept" && bracketId) {
      body.bracket_id = bracketId;
    }

    const response = await fetch("/api/wagers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      setWagers((prev) =>
        prev.map((w) =>
          w.id === wagerId
            ? { ...w, status: action === "accept" ? "accepted" : action === "revoke" ? "declined" : "declined" }
            : w
        )
      );
    } else {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Something went wrong. Try again.");
    }
  };

  const filteredWagers = wagers.filter((w) => {
    if (activeTab === "resolved") return w.status === "resolved" || w.status === "declined";
    return w.status === activeTab;
  });

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <span className="font-display text-xs text-navy/50 animate-pulse">
          Loading...
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display text-navy text-sm">WAGERS</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="retro-btn retro-btn-primary text-[0.5rem]"
        >
          {showCreate ? "Cancel" : "New Wager"}
        </button>
      </div>

      <p className="text-xs text-navy/50 mb-6">
        Challenge a friend to a friendly IOU wager. Whoever&apos;s bracket scores higher wins. Stakes are just for fun — loser honors the bet.
      </p>

      {/* Create wager form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="retro-card p-6 mb-6 space-y-4"
        >
          <div>
            <label className="font-display text-[0.55rem] text-navy block mb-2">
              CHALLENGE
            </label>
            <select
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              className="w-full border-2 border-navy p-2 font-body text-sm bg-cream"
              required
            >
              <option value="">Select a player</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-display text-[0.55rem] text-navy block mb-2">
              YOUR BRACKET
            </label>
            <select
              value={bracketId}
              onChange={(e) => setBracketId(e.target.value)}
              className="w-full border-2 border-navy p-2 font-body text-sm bg-cream"
              required
            >
              {brackets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_primary ? "(Primary)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-display text-[0.55rem] text-navy block mb-2">
              STAKES
            </label>
            <input
              type="text"
              value={stakes}
              onChange={(e) => setStakes(e.target.value)}
              placeholder="Loser buys winner dinner"
              className="w-full border-2 border-navy p-2 font-body text-sm bg-cream"
              required
            />
          </div>
          <button type="submit" className="retro-btn retro-btn-secondary">
            Send Challenge
          </button>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["pending", "accepted", "resolved"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`font-display text-[0.5rem] px-4 py-2 border-2 border-navy rounded transition-colors ${
              activeTab === tab
                ? "bg-navy text-gold"
                : "bg-cream text-navy hover:bg-navy/10"
            }`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Wager list */}
      <div className="space-y-3">
        {filteredWagers.length === 0 && (
          <div className="text-center py-8 text-navy/50 text-sm">
            No {activeTab} wagers
          </div>
        )}
        {filteredWagers.map((wager) => {
          const isChallenger = wager.challenger_id === userId;
          const otherPlayer = isChallenger
            ? wager.opponent?.display_name
            : wager.challenger?.display_name;
          const isPending =
            wager.status === "pending" && !isChallenger;

          return (
            <div key={wager.id} className="retro-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-navy/60">
                  {isChallenger ? "You challenged" : "Challenged by"}{" "}
                  <span className="font-bold">{otherPlayer}</span>
                </div>
                <div className="flex items-center gap-2">
                  {wager.status === "resolved" && (
                    <span
                      className={`font-display text-[0.5rem] px-2 py-1 rounded ${
                        wager.winner_id === userId
                          ? "bg-forest text-cream"
                          : "bg-burnt-orange text-cream"
                      }`}
                    >
                      {wager.winner_id === userId ? "WON" : "LOST"}
                    </span>
                  )}
                  {wager.status === "declined" && (
                    <span className="font-display text-[0.5rem] text-navy/40">
                      DECLINED
                    </span>
                  )}
                  {wager.status === "accepted" && (
                    <span className="font-display text-[0.5rem] text-forest">
                      ACTIVE
                    </span>
                  )}
                </div>
              </div>
              <div className="font-body text-sm font-bold mb-2">
                {wager.stakes}
              </div>
              {isPending && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleRespond(wager.id, "accept")}
                    className="retro-btn retro-btn-secondary text-[0.45rem] py-1.5 px-4"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespond(wager.id, "decline")}
                    className="retro-btn text-[0.45rem] py-1.5 px-4 bg-cream"
                  >
                    Decline
                  </button>
                </div>
              )}
              {wager.status === "pending" && isChallenger && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleRespond(wager.id, "revoke")}
                    className="retro-btn text-[0.45rem] py-1.5 px-4 bg-cream text-burnt-orange border-burnt-orange"
                  >
                    Revoke
                  </button>
                </div>
              )}
              <div className="text-[0.55rem] text-navy/40 mt-2">
                {new Date(wager.created_at).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
