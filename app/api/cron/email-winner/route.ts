import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendBatch, type ResendMessage } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates/render";
import { DigestWinner } from "@/lib/email-templates/digest-winner";
import { verifyCronAuth } from "@/lib/cron-auth";
import { titleToSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

// GET /api/cron/email-winner
// Monday-morning fan-out announcing the most recently closed week's
// winner to every active subscriber. Vercel cron (Authorization:
// Bearer $CRON_SECRET) is required.
//
// Skips cleanly when:
//   - no closed week with a winner exists yet (the close-week cron hasn't
//     run, or there were no scored ideas this week);
//   - the subscribers table is empty.
// Both return 200 so Vercel doesn't retry-spam.
//
// Idempotency: this route deliberately has no `social_post_log`-style
// guard. The Vercel cron schedule is the source of truth — fires once a
// week. If we add a second weekly winner trigger later (e.g. an admin
// "resend digest" button) we'll revisit at that point.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Most recently closed week with a winner picked. Mirrors the same
  // query used by /api/cron/post-winner so the email + tweet announce
  // the same idea.
  const { data: week } = await supabase
    .from("weeks")
    .select("id, week_number, winner_idea_id")
    .eq("status", "closed")
    .not("winner_idea_id", "is", null)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!week || !week.winner_idea_id) {
    return NextResponse.json({ skipped: "no-closed-week-with-winner" });
  }

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, score, final_score")
    .eq("id", week.winner_idea_id)
    .maybeSingle();

  if (!idea) {
    return NextResponse.json({ skipped: "winner-idea-missing" });
  }

  const slug = titleToSlug(idea.title);
  const winnerUrl = slug
    ? `${SITE_URL}/idea/${idea.id}/${slug}`
    : `${SITE_URL}/idea/${idea.id}`;
  // Fall back to ai_score × 10 when the trigger-computed final_score is
  // null (legacy rows pre-005 / zero-vote weeks where the score never
  // materialized). Send-time fallback rather than a render-time decision
  // so the template stays a pure presenter.
  const finalScore =
    idea.final_score ?? (idea.score != null ? idea.score * 10 : 0);

  // Pull all active subscribers. Table is admin-only; service role bypasses RLS.
  const { data: rows, error } = await supabase
    .from("subscribers")
    .select("email, unsub_token")
    .eq("status", "active");

  if (error) {
    return NextResponse.json(
      { error: "subscriber-fetch-failed", message: error.message },
      { status: 500 },
    );
  }

  const subscribers = (rows ?? []) as Array<{
    email: string;
    unsub_token: string;
  }>;

  if (subscribers.length === 0) {
    return NextResponse.json({ skipped: "no-subscribers", attempted: 0 });
  }

  // Render per-recipient (each gets a unique unsubscribe URL). CPU only,
  // no I/O — Promise.all is fine at the few-hundreds scale we expect
  // before revisiting batch streaming.
  const messages: ResendMessage[] = await Promise.all(
    subscribers.map(async (sub) => {
      const unsubscribeUrl = `${SITE_URL}/api/subscribe/unsubscribe/${sub.unsub_token}`;
      const { html, text } = await renderEmail(
        DigestWinner({
          winnerTitle: idea.title,
          winnerUrl,
          winnerScore: finalScore,
          weekNumber: week.week_number,
          siteUrl: SITE_URL,
          unsubscribeUrl,
        }),
      );
      return {
        to: sub.email,
        subject: `Week ${week.week_number} winner: ${idea.title}`,
        html,
        text,
      };
    }),
  );

  const result = await sendResendBatch(messages);

  return NextResponse.json({
    weekNumber: week.week_number,
    winnerId: idea.id,
    attempted: result.attempted,
    succeeded: result.succeeded,
    errors: result.errors,
  });
}
