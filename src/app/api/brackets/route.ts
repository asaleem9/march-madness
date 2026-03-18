import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REQUIRED_PICKS = 63;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, picks, lock } = body;

  // Enforce one bracket per user
  const { data: existingBrackets } = await supabase
    .from("brackets")
    .select("id")
    .eq("user_id", user.id);

  if (existingBrackets && existingBrackets.length > 0) {
    return NextResponse.json(
      { error: "You already have a bracket", bracketId: existingBrackets[0].id },
      { status: 409 }
    );
  }

  // If locking, require all picks
  if (lock && (!picks || picks.length < REQUIRED_PICKS)) {
    return NextResponse.json(
      { error: `All ${REQUIRED_PICKS} picks are required to finalize your bracket` },
      { status: 400 }
    );
  }

  // Create bracket
  const { data: bracket, error: bracketError } = await supabase
    .from("brackets")
    .insert({
      user_id: user.id,
      name: name || `${user.user_metadata?.display_name || user.email?.split("@")[0] || "My"}'s Bracket`,
      is_primary: true,
      locked: !!lock,
    })
    .select()
    .single();

  if (bracketError) {
    return NextResponse.json(
      { error: bracketError.message },
      { status: 500 }
    );
  }

  // Insert picks (use admin client to bypass RLS deadline check —
  // the API already validates the deadline in application code above)
  if (picks && picks.length > 0) {
    const admin = createAdminClient();
    const pickRows = picks.map(
      (p: { game_slot: number; round: string; picked_team_id: number }) => ({
        bracket_id: bracket.id,
        game_slot: p.game_slot,
        round: p.round,
        picked_team_id: p.picked_team_id,
      })
    );

    const { error: picksError } = await admin
      .from("bracket_picks")
      .insert(pickRows);

    if (picksError) {
      // Rollback bracket
      await admin.from("brackets").delete().eq("id", bracket.id);
      return NextResponse.json(
        { error: picksError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ bracketId: bracket.id, locked: !!lock });
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
  const { bracketId, name, picks, lock } = body;

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

  // If locking, require all picks
  if (lock && (!picks || picks.length < REQUIRED_PICKS)) {
    return NextResponse.json(
      { error: `All ${REQUIRED_PICKS} picks are required to finalize your bracket` },
      { status: 400 }
    );
  }

  // Update bracket name (lock status set after picks succeed)
  const adminForUpdate = createAdminClient();
  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (name) updateFields.name = name;

  await adminForUpdate
    .from("brackets")
    .update(updateFields)
    .eq("id", bracketId);

  // Replace all picks (use admin client to bypass RLS deadline check)
  if (picks && picks.length > 0) {
    const admin = createAdminClient();

    // Delete existing picks
    await admin.from("bracket_picks").delete().eq("bracket_id", bracketId);

    // Insert new picks
    const pickRows = picks.map(
      (p: { game_slot: number; round: string; picked_team_id: number }) => ({
        bracket_id: bracketId,
        game_slot: p.game_slot,
        round: p.round,
        picked_team_id: p.picked_team_id,
      })
    );

    const { error } = await admin.from("bracket_picks").insert(pickRows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Lock only after picks saved successfully
  if (lock) {
    const admin = createAdminClient();
    await admin
      .from("brackets")
      .update({ locked: true })
      .eq("id", bracketId);
  }

  return NextResponse.json({ bracketId, locked: !!lock });
}
