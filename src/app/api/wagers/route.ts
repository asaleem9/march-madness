import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeError } from "@/lib/sanitizeError";
import { isPastWagerDeadline } from "@/lib/tournament-config";

const STAKES_MAX_LENGTH = 120;

type Admin = ReturnType<typeof createAdminClient>;

/** Display name from `profiles` (the source of truth), never user_metadata. */
async function displayNameOf(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name || "Someone";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { opponent_id, challenger_bracket_id } = body;
  const stakes = typeof body.stakes === "string" ? body.stakes.trim() : "";

  if (!opponent_id || !challenger_bracket_id || !stakes) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (stakes.length > STAKES_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Stakes must be ${STAKES_MAX_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  if (opponent_id === user.id) {
    return NextResponse.json(
      { error: "You can't wager against yourself" },
      { status: 400 }
    );
  }

  // Check wager deadline
  const { data: config } = await supabase
    .from("tournament_config")
    .select("wager_creation_deadline")
    .eq("id", 1)
    .single();

  if (isPastWagerDeadline(config)) {
    return NextResponse.json(
      { error: "Wager creation deadline has passed" },
      { status: 403 }
    );
  }

  // Verify bracket ownership
  const { data: bracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("id", challenger_bracket_id)
    .eq("user_id", user.id)
    .single();

  if (!bracket) {
    return NextResponse.json({ error: "Invalid bracket" }, { status: 400 });
  }

  const { data: wager, error } = await supabase
    .from("wagers")
    .insert({
      challenger_id: user.id,
      opponent_id,
      challenger_bracket_id,
      stakes,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
  }

  // Queue the challenge for the opponent. notification_queue is read-only for
  // users under RLS, so this goes through the service role.
  const admin = createAdminClient();
  await admin.from("notification_queue").insert({
    user_id: opponent_id,
    type: "wager_request",
    payload: {
      wager_id: wager.id,
      challenger_name: await displayNameOf(admin, user.id),
      stakes,
    },
  });

  return NextResponse.json({ wagerId: wager.id });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { wager_id, action, bracket_id } = body;

  // Fetch wager (use admin to bypass RLS for challenger revoke)
  const admin = createAdminClient();
  const { data: wager } = await admin
    .from("wagers")
    .select("*")
    .eq("id", wager_id)
    .single();

  if (!wager) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (wager.status !== "pending") {
    return NextResponse.json(
      { error: "Wager already responded to" },
      { status: 400 }
    );
  }

  // Who gets told about this change, and what the message calls the actor.
  let notifyUserId: string;
  let status: "accepted" | "declined" | "revoked";

  // Challenger can revoke, opponent can accept/decline
  if (action === "revoke") {
    if (wager.challenger_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { error } = await admin
      .from("wagers")
      .update({ status: "declined" })
      .eq("id", wager_id);
    if (error) {
      return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
    }
    notifyUserId = wager.opponent_id;
    status = "revoked";
  } else if (action === "accept") {
    if (wager.opponent_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // The accepting user must have a bracket — it's what the wager is scored
    // against. Use the one they sent (must be theirs) or fall back to their own.
    let opponentBracketId: string | null = null;
    if (bracket_id) {
      const { data: ownBracket } = await admin
        .from("brackets")
        .select("id")
        .eq("id", bracket_id)
        .eq("user_id", user.id)
        .single();
      if (!ownBracket) {
        return NextResponse.json({ error: "Invalid bracket" }, { status: 400 });
      }
      opponentBracketId = ownBracket.id;
    } else {
      const { data: ownBracket } = await admin
        .from("brackets")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      opponentBracketId = ownBracket?.id ?? null;
    }
    if (!opponentBracketId) {
      return NextResponse.json(
        { error: "Create a bracket first" },
        { status: 400 }
      );
    }
    const { error } = await admin
      .from("wagers")
      .update({
        status: "accepted",
        opponent_bracket_id: opponentBracketId,
      })
      .eq("id", wager_id);

    if (error) {
      return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
    }
    notifyUserId = wager.challenger_id;
    status = "accepted";
  } else if (action === "decline") {
    if (wager.opponent_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { error } = await admin
      .from("wagers")
      .update({ status: "declined" })
      .eq("id", wager_id);
    if (error) {
      return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
    }
    notifyUserId = wager.challenger_id;
    status = "declined";
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Tell the other party. The enum has no wager_update value, so this rides on
  // wager_result with `status` in the payload (notification-copy reads it).
  await admin.from("notification_queue").insert({
    user_id: notifyUserId,
    type: "wager_result",
    payload: {
      wager_id,
      status,
      opponent_name: await displayNameOf(admin, user.id),
      stakes: wager.stakes,
    },
  });

  return NextResponse.json({ success: true });
}
