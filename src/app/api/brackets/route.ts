import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeError } from "@/lib/sanitizeError";
import type { SupabaseClient } from "@supabase/supabase-js";

const REQUIRED_PICKS = 63;

// The bracket lock deadline is the real cutoff for any pick changes. Picks are
// written with the admin client (to bypass the RLS deadline clause during the
// normal save flow), so this is the only place the deadline is enforced for
// those writes — it must run before every insert/upsert.
async function isPastDeadline(supabase: SupabaseClient): Promise<boolean> {
  const { data: config } = await supabase
    .from("tournament_config")
    .select("bracket_lock_deadline")
    .eq("id", 1)
    .single();

  if (!config?.bracket_lock_deadline) return false;
  return new Date() > new Date(config.bracket_lock_deadline);
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
  const { name, picks, lock } = body;

  // Enforce the lock deadline — no new brackets or picks once it passes
  if (await isPastDeadline(supabase)) {
    return NextResponse.json(
      { error: "The bracket deadline has passed. Brackets are locked." },
      { status: 403 }
    );
  }

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
      { error: sanitizeError(bracketError.message) },
      { status: 500 }
    );
  }

  // Insert picks with the admin client to bypass the RLS deadline clause.
  // Safe because isPastDeadline() was already enforced above.
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
        { error: sanitizeError(picksError.message) },
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

  // Once the deadline passes, no more edits — even for an unlocked bracket
  if (await isPastDeadline(supabase)) {
    return NextResponse.json(
      { error: "The bracket deadline has passed. Brackets are locked." },
      { status: 403 }
    );
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

  // Replace picks atomically with the admin client to bypass the RLS deadline
  // clause. Safe because isPastDeadline()/locked were already enforced above.
  if (picks && picks.length > 0) {
    const admin = createAdminClient();

    const pickRows = picks.map(
      (p: { game_slot: number; round: string; picked_team_id: number }) => ({
        bracket_id: bracketId,
        game_slot: p.game_slot,
        round: p.round,
        picked_team_id: p.picked_team_id,
      })
    );
    // Coerce to integers so client-supplied values can't corrupt the
    // "delete stale picks" filter below.
    const newGameSlots = picks
      .map((p: { game_slot: number }) => Number(p.game_slot))
      .filter((n: number) => Number.isInteger(n));

    // Upsert new picks (safe — doesn't delete anything on failure)
    const { error: upsertError } = await admin
      .from("bracket_picks")
      .upsert(pickRows, { onConflict: "bracket_id,game_slot" });

    if (upsertError) {
      return NextResponse.json({ error: sanitizeError(upsertError.message) }, { status: 500 });
    }

    // Remove any stale picks not in the new set
    await admin
      .from("bracket_picks")
      .delete()
      .eq("bracket_id", bracketId)
      .not("game_slot", "in", `(${newGameSlots.join(",")})`);
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
