import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, picks } = body;

  // Check deadline
  const { data: config } = await supabase
    .from("tournament_config")
    .select("bracket_lock_deadline")
    .eq("id", 1)
    .single();

  if (config && new Date() > new Date(config.bracket_lock_deadline)) {
    return NextResponse.json(
      { error: "Bracket submission deadline has passed" },
      { status: 403 }
    );
  }

  // Check if user already has a primary bracket
  const { data: existingBrackets } = await supabase
    .from("brackets")
    .select("id, is_primary")
    .eq("user_id", user.id);

  const hasPrimary = existingBrackets?.some((b) => b.is_primary);

  // Create bracket
  const { data: bracket, error: bracketError } = await supabase
    .from("brackets")
    .insert({
      user_id: user.id,
      name: name || "My Bracket",
      is_primary: !hasPrimary,
    })
    .select()
    .single();

  if (bracketError) {
    return NextResponse.json(
      { error: bracketError.message },
      { status: 500 }
    );
  }

  // Insert picks
  if (picks && picks.length > 0) {
    const pickRows = picks.map(
      (p: { game_slot: number; round: string; picked_team_id: number }) => ({
        bracket_id: bracket.id,
        game_slot: p.game_slot,
        round: p.round,
        picked_team_id: p.picked_team_id,
      })
    );

    const { error: picksError } = await supabase
      .from("bracket_picks")
      .insert(pickRows);

    if (picksError) {
      // Rollback bracket
      await supabase.from("brackets").delete().eq("id", bracket.id);
      return NextResponse.json(
        { error: picksError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ bracketId: bracket.id });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bracketId, name, picks } = body;

  // Verify ownership and lock status
  const { data: bracket } = await supabase
    .from("brackets")
    .select("*")
    .eq("id", bracketId)
    .single();

  if (!bracket || bracket.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (bracket.locked) {
    return NextResponse.json({ error: "Bracket is locked" }, { status: 403 });
  }

  // Check deadline
  const { data: config } = await supabase
    .from("tournament_config")
    .select("bracket_lock_deadline")
    .eq("id", 1)
    .single();

  if (config && new Date() > new Date(config.bracket_lock_deadline)) {
    return NextResponse.json(
      { error: "Bracket editing deadline has passed" },
      { status: 403 }
    );
  }

  // Update bracket name
  if (name) {
    await supabase
      .from("brackets")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", bracketId);
  }

  // Replace all picks
  if (picks && picks.length > 0) {
    // Delete existing picks
    await supabase.from("bracket_picks").delete().eq("bracket_id", bracketId);

    // Insert new picks
    const pickRows = picks.map(
      (p: { game_slot: number; round: string; picked_team_id: number }) => ({
        bracket_id: bracketId,
        game_slot: p.game_slot,
        round: p.round,
        picked_team_id: p.picked_team_id,
      })
    );

    const { error } = await supabase.from("bracket_picks").insert(pickRows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ bracketId });
}
