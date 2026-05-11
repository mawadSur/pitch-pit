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

  // Atomic toggle. The previous SELECT-then-INSERT/DELETE shape raced
  // with itself: two concurrent POSTs from the same user could both
  // read "no existing vote" and both attempt to INSERT, where one would
  // win and the other would surface as a 500 via the
  // (user_id, idea_id) UNIQUE constraint from 002_votes.sql.
  //
  // Resolution: ON CONFLICT DO NOTHING is the toggle. If we successfully
  // insert a row, this is a toggle-ON. If the conflict elided the insert
  // (no row returned), this is a toggle-OFF — DELETE the existing row.
  // Both branches are single statements so concurrent callers serialize
  // on the unique index instead of racing in application code.
  const { data: inserted, error: insErr } = await supabase
    .from("votes")
    .upsert(
      { user_id: user.id, idea_id: ideaId },
      { onConflict: "user_id,idea_id", ignoreDuplicates: true },
    )
    .select("id");

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (inserted && inserted.length > 0) {
    return NextResponse.json({ voted: true });
  }

  // Conflict path: the user already had a vote. Retract it.
  const { error: delErr } = await supabase
    .from("votes")
    .delete()
    .eq("user_id", user.id)
    .eq("idea_id", ideaId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ voted: false });
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
