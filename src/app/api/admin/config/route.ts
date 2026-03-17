import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());

async function isAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && adminEmails.includes(user.email || "");
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("tournament_config")
    .select("*")
    .eq("id", 1)
    .single();

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const body = await request.json();

  const { error } = await adminClient
    .from("tournament_config")
    .update(body)
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
