import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

// Statuses that are "in play" for a week's leaderboard — the same set the
// per-week final-score recompute uses (migration 025). Drafts / rejected /
// failed ideas don't appear on the board, so they don't affect rank.
const IN_PLAY = ["scored", "queued", "building", "built"];

// GET /api/idea/[id]/rally
//
// Owner-only recruiting snapshot for the idea-page "rally your voters" card.
// Returns where the idea sits in its week and how far it is from the podium
// so the owner knows whether sharing one more time crosses a threshold.
//
//   { rank, votesToTop3, recruitedCount }
//
//   rank           — 1-based position by final_score desc among the week's
//                    in-play ideas (score as tiebreaker, mirroring the
//                    leaderboard). null if the idea isn't on the board yet.
//   votesToTop3    — best-effort extra votes needed to reach 3rd place's
//                    final_score. 0 when already top 3 (or when it can't be
//                    estimated). Approximate — final_score is a per-week
//                    blend, so this is a directional nudge, not a guarantee.
//   recruitedCount — votes attributed to this idea's referral link
//                    (votes.referrer_idea_id). 0 when the column is absent
//                    (migration 037 not yet applied) — never 500s on it.
//
// 403 unless the signed-in user owns the idea — the numbers are private
// strategy, not public leaderboard data.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "Invalid idea id." }, { status: 400 });
  }
  const ideaId = idCheck.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // Owner check. We need week_id + final_score to rank, and user_id to gate.
  const { data: idea } = await supabase
    .from("ideas")
    .select("user_id, week_id, final_score, vote_count, status")
    .eq("id", ideaId)
    .maybeSingle<{
      user_id: string | null;
      week_id: string | null;
      final_score: number | null;
      vote_count: number | null;
      status: string;
    }>();

  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  if (idea.user_id !== user.id) {
    return NextResponse.json({ error: "Not your idea." }, { status: 403 });
  }

  // No week association (legacy / partial schema) — nothing to rank against.
  // Degrade gracefully rather than guessing.
  if (!idea.week_id) {
    return NextResponse.json({
      rank: null,
      votesToTop3: 0,
      recruitedCount: await countRecruited(supabase, ideaId),
    });
  }

  // Pull the week's in-play board, ordered like the public leaderboard
  // (final_score desc, score desc tiebreak). Cap at a sane upper bound —
  // we only need the head of the list to compute rank + the top-3 line.
  const { data: board } = await supabase
    .from("ideas")
    .select("id, final_score, score")
    .eq("week_id", idea.week_id)
    .in("status", IN_PLAY)
    .order("final_score", { ascending: false, nullsFirst: false })
    .order("score", { ascending: false, nullsFirst: false })
    .limit(500);

  let rank: number | null = null;
  let votesToTop3 = 0;

  if (board && board.length > 0) {
    const idx = board.findIndex((row) => row.id === ideaId);
    if (idx >= 0) {
      rank = idx + 1;
      // Already on the podium → nothing to chase.
      if (rank > 3) {
        const thirdScore = board[2]?.final_score ?? null;
        const mineScore = idea.final_score ?? 0;
        votesToTop3 = estimateVotesToClose(thirdScore, mineScore);
      }
    }
  }

  return NextResponse.json({
    rank,
    votesToTop3,
    recruitedCount: await countRecruited(supabase, ideaId),
  });
}

// Best-effort referral tally. votes.referrer_idea_id lands in migration 037
// (added by a parallel agent on this branch). If the column doesn't exist
// yet, the query errors with Postgres 42703 — we swallow it and return 0 so
// the route never 500s on a not-yet-migrated database.
async function countRecruited(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ideaId: string,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("referrer_idea_id", ideaId);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Rough "votes to catch 3rd place" estimate. final_score is a per-week blend
// (50% AI + 50% vote share), so we can't invert it exactly without the full
// week vote distribution. We approximate: the community half is 50 points
// spread across the week's votes, so each vote is worth a fraction of a
// point. Rather than model that precisely (it shifts as everyone's share
// re-normalizes), we surface the raw point gap as a small whole number of
// votes — directional, capped so it never reads as an impossible mountain.
function estimateVotesToClose(
  thirdScore: number | null,
  mineScore: number,
): number {
  if (thirdScore === null) return 0;
  const gap = thirdScore - mineScore;
  if (gap <= 0) return 0;
  // ~1 vote ≈ a couple of final-score points in a typical small week; clamp
  // to a friendly 1..25 range so the nudge always feels achievable.
  const votes = Math.ceil(gap / 2);
  return Math.min(Math.max(votes, 1), 25);
}
