import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendBatch, type ResendMessage } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates/render";
import { DigestVoterResult } from "@/lib/email-templates/digest-voter-result";
import { verifyCronAuth } from "@/lib/cron-auth";
import { titleToSlug } from "@/lib/slug";
import { writeHeartbeat } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

// Address an unsubscribe request lands at when a voter is NOT also a
// marketing subscriber (so has no unsub_token). A mailto: keeps the
// one-tap promise honest without minting a token table for voters —
// that would need a migration, which this stream doesn't own.
const SUPPRESS_MAILTO =
  process.env.EMAIL_FROM ?? "hello@pitchpit.app";

type VoteRow = { user_id: string; idea_id: string };
type IdeaRow = { id: string; title: string; final_score: number | null };
type ResultRow = { idea_id: string; rank: number };

interface Pick {
  title: string;
  url: string;
  rank: number;
}

function ideaUrl(id: string, title: string): string {
  const slug = titleToSlug(title);
  return slug ? `${SITE_URL}/idea/${id}/${slug}` : `${SITE_URL}/idea/${id}`;
}

// GET /api/cron/email-voter-results
//
// For the most-recently-closed week, email each DISTINCT signed-in voter
// how the idea(s) they backed placed ("your pick finished #N of M").
//
// CONSENT GUARD (critical): this reaches users who voted but may never
// have opted into marketing email. The entire send is gated behind
// VOTER_RESULTS_EMAIL_ENABLED — DEFAULT DISABLED. The matching GH Actions
// workflow ships with its schedule COMMENTED OUT pending a consent
// review. Framing is strictly transactional: the result of a vote the
// recipient cast, with a one-tap unsubscribe link.
//
// Ranking source of truth: the frozen `week_results` snapshot (migration
// 025). If a snapshot row is missing for the week we fall back to ranking
// the week's ideas by final_score in memory.
//
// Skips cleanly (200, no retry-spam) when: the flag is off; no closed
// week exists; nobody voted; or Resend isn't configured.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Consent gate. Off by default; the whole job is a no-op unless an
  //    operator has explicitly enabled it after a consent review.
  if (process.env.VOTER_RESULTS_EMAIL_ENABLED !== "true") {
    return NextResponse.json({ skipped: "disabled" });
  }

  const supabase = createAdminClient();

  // Most recently closed week with a winner picked.
  const { data: week } = await supabase
    .from("weeks")
    .select("id, week_number, winner_idea_id")
    .eq("status", "closed")
    .not("winner_idea_id", "is", null)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!week || !week.winner_idea_id) {
    await writeHeartbeat(supabase, "email-voter-results");
    return NextResponse.json({ skipped: "no-closed-week-with-winner" });
  }

  // ── Every idea in this week (id → title + final_score). Drives both the
  //    fallback ranking and the per-pick titles/links.
  const { data: ideaRows, error: ideaErr } = await supabase
    .from("ideas")
    .select("id, title, final_score")
    .eq("week_id", week.id);

  if (ideaErr) {
    await writeHeartbeat(supabase, "email-voter-results", "error", ideaErr.message);
    return NextResponse.json(
      { error: "ideas-fetch-failed", message: ideaErr.message },
      { status: 500 },
    );
  }

  const ideas = (ideaRows ?? []) as IdeaRow[];
  const ideaById = new Map<string, IdeaRow>(ideas.map((i) => [i.id, i]));
  const weekIdeaIds = new Set(ideas.map((i) => i.id));

  // ── Rank map (idea_id → rank). Prefer the frozen snapshot; fall back to
  //    computing rank from final_score when the snapshot is absent.
  const { data: snapRows } = await supabase
    .from("week_results")
    .select("idea_id, rank")
    .eq("week_id", week.id)
    .order("rank", { ascending: true });

  const snapshot = (snapRows ?? []) as ResultRow[];
  const rankByIdea = new Map<string, number>();
  let totalRanked: number;

  if (snapshot.length > 0) {
    for (const r of snapshot) rankByIdea.set(r.idea_id, r.rank);
    totalRanked = snapshot.length;
  } else {
    // Fallback: rank scored ideas by final_score desc (nulls last).
    const ranked = ideas
      .filter((i) => i.final_score != null)
      .sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
    ranked.forEach((i, idx) => rankByIdea.set(i.id, idx + 1));
    totalRanked = ranked.length;
  }

  if (totalRanked === 0) {
    await writeHeartbeat(supabase, "email-voter-results");
    return NextResponse.json({ skipped: "no-ranked-ideas" });
  }

  // ── Winner context (rank 1) for recipients whose pick didn't win.
  const winnerIdea = ideaById.get(week.winner_idea_id);
  const winnerTitle = winnerIdea?.title ?? "the winning idea";
  const winnerUrl = winnerIdea
    ? ideaUrl(winnerIdea.id, winnerIdea.title)
    : SITE_URL;

  // ── Votes cast on this week's ideas. votes has no week_id, so we filter
  //    by idea_id membership in the week.
  const { data: voteRows, error: voteErr } = await supabase
    .from("votes")
    .select("user_id, idea_id");

  if (voteErr) {
    await writeHeartbeat(supabase, "email-voter-results", "error", voteErr.message);
    return NextResponse.json(
      { error: "votes-fetch-failed", message: voteErr.message },
      { status: 500 },
    );
  }

  // Group this week's votes by voter → the ideas they backed.
  const picksByUser = new Map<string, string[]>();
  for (const v of (voteRows ?? []) as VoteRow[]) {
    if (!weekIdeaIds.has(v.idea_id)) continue; // not this week
    if (!rankByIdea.has(v.idea_id)) continue; // unranked (unscored) idea
    const arr = picksByUser.get(v.user_id) ?? [];
    arr.push(v.idea_id);
    picksByUser.set(v.user_id, arr);
  }

  if (picksByUser.size === 0) {
    await writeHeartbeat(supabase, "email-voter-results");
    return NextResponse.json({ skipped: "no-voters", attempted: 0 });
  }

  // ── Unsubscribe tokens for any voter who is also a marketing
  //    subscriber, keyed by lowercased email. Voters without a row fall
  //    back to a mailto: unsubscribe (one-tap, honest, no migration).
  const { data: subRows } = await supabase
    .from("subscribers")
    .select("email, unsub_token");
  const unsubByEmail = new Map<string, string>();
  for (const s of (subRows ?? []) as Array<{
    email: string;
    unsub_token: string;
  }>) {
    if (s.email && s.unsub_token) {
      unsubByEmail.set(s.email.toLowerCase(), s.unsub_token);
    }
  }

  // ── Resolve voter emails via the Auth Admin API (votes.user_id mirrors
  //    auth.users.id). public.users has no email column. Build messages.
  const messages: ResendMessage[] = [];
  let unresolved = 0;

  for (const [userId, ideaIds] of picksByUser) {
    const { data: userData, error: userErr } =
      await supabase.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (userErr || !email) {
      unresolved += 1;
      continue;
    }

    // Best-placing pick first, so the preview/headline lead with the
    // recipient's strongest result.
    const picks: Pick[] = ideaIds
      .map((id) => {
        const idea = ideaById.get(id);
        const rank = rankByIdea.get(id);
        if (!idea || rank == null) return null;
        return { title: idea.title, url: ideaUrl(idea.id, idea.title), rank };
      })
      .filter((p): p is Pick => p != null)
      .sort((a, b) => a.rank - b.rank);

    if (picks.length === 0) continue;

    const token = unsubByEmail.get(email.toLowerCase());
    const unsubscribeUrl = token
      ? `${SITE_URL}/api/subscribe/unsubscribe/${token}`
      : `mailto:${SUPPRESS_MAILTO}?subject=${encodeURIComponent(
          "Unsubscribe from pitch-pit result emails",
        )}`;

    const { html, text } = await renderEmail(
      DigestVoterResult({
        picks,
        totalRanked,
        weekNumber: week.week_number,
        winnerTitle,
        winnerUrl,
        siteUrl: SITE_URL,
        unsubscribeUrl,
      }),
    );

    const top = picks[0];
    messages.push({
      to: email,
      subject: `Your pick finished #${top.rank} — pitch-pit week ${week.week_number}`,
      html,
      text,
    });
  }

  if (messages.length === 0) {
    await writeHeartbeat(supabase, "email-voter-results");
    return NextResponse.json({
      skipped: "no-resolvable-recipients",
      attempted: 0,
      unresolved,
    });
  }

  const result = await sendResendBatch(messages);

  await writeHeartbeat(supabase, "email-voter-results");
  return NextResponse.json({
    weekNumber: week.week_number,
    voters: picksByUser.size,
    unresolved,
    attempted: result.attempted,
    succeeded: result.succeeded,
    errors: result.errors,
  });
}
