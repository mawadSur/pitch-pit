import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendBatch, type ResendMessage } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates/render";
import {
  DigestCountdown,
  type CountdownContender,
} from "@/lib/email-templates/digest-countdown";
import { verifyCronAuth } from "@/lib/cron-auth";
import { titleToSlug } from "@/lib/slug";
import { writeHeartbeat } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

// Deep link to an idea with countdown attribution so /built analytics can
// segment vote traffic that originated in this email.
function contenderUrl(id: string, title: string): string {
  const slug = titleToSlug(title);
  const base = slug ? `${SITE_URL}/idea/${id}/${slug}` : `${SITE_URL}/idea/${id}`;
  return `${base}?utm_source=countdown`;
}

// GET /api/cron/email-countdown
// Sunday-evening fan-out to all active subscribers. Vercel cron header
// (Authorization: Bearer $CRON_SECRET) is required.
//
// Each subscriber gets the same template body but a personalized
// unsubscribe URL (their unique unsub_token). We render the template
// once per recipient so the unsubscribe link is correct — the
// generation cost is tiny compared to the network round-trip.
//
// Hard-failure rows (Resend reports a bounce on send) are logged but
// don't fail the cron — the email is best-effort. The cron returns 200
// with a count of attempted/succeeded so an alert pipeline can spot
// regressions.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ── Open-week leaderboard context. Pull the current race's top-3 by
  //    final_score so the email shows who's leading and how close it is —
  //    a reason to click through and vote, not just a deadline nag.
  //
  // AUDIENCE NOTE: this digest goes ONLY to opted-in marketing
  // subscribers (status = 'active'). It is NOT expanded to past voters.
  // TODO(consent): a separate consent review is required before reaching
  // non-consented past voters with this digest — until then the
  // voter-results path (email-voter-results, default-disabled) is the only
  // route that touches voters, and only transactionally.
  const { data: openWeek } = await supabase
    .from("weeks")
    .select("id, week_number")
    .eq("status", "open")
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let contenders: CountdownContender[] = [];
  let leadGap: number | null = null;

  if (openWeek?.id) {
    const { data: topRows } = await supabase
      .from("ideas")
      .select("id, title, final_score")
      .eq("week_id", openWeek.id)
      .in("status", ["scored", "queued", "building", "built"])
      .not("final_score", "is", null)
      .order("final_score", { ascending: false })
      .limit(3);

    const top = (topRows ?? []) as Array<{
      id: string;
      title: string;
      final_score: number | null;
    }>;

    contenders = top.map((idea, idx) => ({
      rank: idx + 1,
      title: idea.title,
      url: contenderUrl(idea.id, idea.title),
      finalScore: idea.final_score ?? 0,
    }));

    // #1 ↔ #2 point gap — "the lead is N points" is the hook. Null when
    // there aren't two scored contenders yet.
    if (contenders.length >= 2) {
      leadGap = contenders[0].finalScore - contenders[1].finalScore;
    }
  }

  // Pull all active subscribers. The table is admin-only (RLS denies
  // everyone else), so this is a service-role select.
  const { data: rows, error } = await supabase
    .from("subscribers")
    .select("email, unsub_token")
    .eq("status", "active");

  if (error) {
    await writeHeartbeat(supabase, "email-countdown", "error", error.message);
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
    await writeHeartbeat(supabase, "email-countdown");
    return NextResponse.json({ skipped: "no-subscribers", attempted: 0 });
  }

  // Race-aware subject: lead with the gap when there's a live race so the
  // open rate tracks the stakes, fall back to the deadline nag otherwise.
  const subject =
    leadGap != null
      ? leadGap === 0
        ? "Dead heat — 6 hours left to vote · pitch-pit"
        : `The lead is ${leadGap} point${leadGap === 1 ? "" : "s"} — 6 hours left to vote · pitch-pit`
      : "6 hours left to pitch this week — pitch-pit";

  // Render the personalized payloads concurrently — each render is a
  // CPU-only string format, no I/O. Promise.all is fine at hundreds of
  // recipients; we'll revisit if the list crosses 5K.
  const messages: ResendMessage[] = await Promise.all(
    subscribers.map(async (sub) => {
      const unsubscribeUrl = `${SITE_URL}/api/subscribe/unsubscribe/${sub.unsub_token}`;
      const { html, text } = await renderEmail(
        DigestCountdown({
          siteUrl: SITE_URL,
          unsubscribeUrl,
          contenders,
          leadGap,
        }),
      );
      return {
        to: sub.email,
        subject,
        html,
        text,
      };
    }),
  );

  const result = await sendResendBatch(messages);

  await writeHeartbeat(supabase, "email-countdown");
  return NextResponse.json({
    attempted: result.attempted,
    succeeded: result.succeeded,
    errors: result.errors,
  });
}
