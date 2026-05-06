import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ideaId: z.string().uuid(),
});

// POST /api/vote — toggles a vote for the current user.
// If the user has already voted, the vote is retracted. Otherwise a new
// vote is inserted. RLS enforces "no self-votes" at the DB layer.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to vote." },
      { status: 401 },
    );
  }

  const { ideaId } = parsed.data;

  // Owner check (defense in depth — RLS also enforces this).
  const { data: idea } = await supabase
    .from("ideas")
    .select("user_id")
    .eq("id", ideaId)
    .maybeSingle();

  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  if (idea.user_id === user.id) {
    return NextResponse.json(
      { error: "You can't vote for your own idea." },
      { status: 403 },
    );
  }

  // Toggle: delete existing vote if present, otherwise insert.
  const { data: existing } = await supabase
    .from("votes")
    .select("id")
    .eq("user_id", user.id)
    .eq("idea_id", ideaId)
    .maybeSingle();

  if (existing) {
    const { error: delErr } = await supabase
      .from("votes")
      .delete()
      .eq("id", existing.id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    return NextResponse.json({ voted: false });
  }

  const { error: insErr } = await supabase
    .from("votes")
    .insert({ user_id: user.id, idea_id: ideaId });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ voted: true });
}

// GET /api/vote?ideaId=... — returns current vote state for the user.
export async function GET(req: NextRequest) {
  const ideaId = req.nextUrl.searchParams.get("ideaId");
  if (!ideaId) {
    return NextResponse.json({ error: "ideaId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const [
    { data: { user } },
    { count: voteCount, error: countErr },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("idea_id", ideaId),
  ]);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  let userHasVoted = false;
  if (user) {
    const { data: existing } = await supabase
      .from("votes")
      .select("id")
      .eq("user_id", user.id)
      .eq("idea_id", ideaId)
      .maybeSingle();
    userHasVoted = !!existing;
  }

  return NextResponse.json({
    voteCount: voteCount ?? 0,
    userHasVoted,
    signedIn: !!user,
  });
}
