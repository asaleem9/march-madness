import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeError } from "@/lib/sanitizeError";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { opponent_id, challenger_bracket_id, stakes } = body;

  if (!opponent_id || !challenger_bracket_id || !stakes) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Check wager deadline
  const { data: config } = await supabase
    .from("tournament_config")
    .select("wager_creation_deadline")
    .eq("id", 1)
    .single();

  if (config && new Date() > new Date(config.wager_creation_deadline)) {
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

  // Queue notification for opponent
  await supabase.from("notification_queue").insert({
    user_id: opponent_id,
    type: "wager_request",
    payload: {
      wager_id: wager.id,
      challenger_name: user.user_metadata?.display_name || "Someone",
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

  // Challenger can revoke, opponent can accept/decline
  if (action === "revoke") {
    if (wager.challenger_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await admin
      .from("wagers")
      .update({ status: "declined" })
      .eq("id", wager_id);
  } else if (action === "accept") {
    if (wager.opponent_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { error } = await admin
      .from("wagers")
      .update({
        status: "accepted",
        opponent_bracket_id: bracket_id || null,
      })
      .eq("id", wager_id);

    if (error) {
      return NextResponse.json({ error: sanitizeError(error.message) }, { status: 500 });
    }
  } else if (action === "decline") {
    if (wager.opponent_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await admin
      .from("wagers")
      .update({ status: "declined" })
      .eq("id", wager_id);
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
