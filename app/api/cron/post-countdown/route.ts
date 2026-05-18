import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postTweet, readXCredsFromEnv } from "@/lib/social/x";
import { verifyCronAuth } from "@/lib/cron-auth";
import { writeHeartbeat } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pitchpit.app";

// Statuses we consider "in play" — same set the leaderboard surfaces.
const IN_PLAY_STATUSES = ["scored", "queued", "building", "built"] as const;

function formatTweet(hoursLeft: number, pitchCount: number): string {
  const hourLabel = hoursLeft === 1 ? "hour" : "hours";
  const pitchLabel = pitchCount === 1 ? "pitch" : "pitches";
  return [
    `${hoursLeft} ${hourLabel} until the pit closes.`,
    `${pitchCount} ${pitchLabel} in play this week.`,
    "",
    `last call: ${SITE_URL.replace(/^https?:\/\//, "")}`,
  ].join("\n");
}

// Returns whole hours from `now` to `endAt`, floored at 0. We floor (not
// round) so the tweet never overstates the remaining time.
function hoursUntil(endAt: Date, now: Date): number {
  const ms = endAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60));
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Currently open week (the one accepting votes right now).
  const { data: week } = await supabase
    .from("weeks")
    .select("id, week_number, end_at")
    .eq("status", "open")
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!week) {
    await writeHeartbeat(supabase, "post-countdown");
    return NextResponse.json({ skipped: "no-open-week" });
  }

  // Idempotency: one countdown tweet per open week. We key on the new
  // social_post_log table by (channel, template, week_id) — that's the
  // natural "have we already announced this week's countdown?" question.
  // Vercel cron retries a non-2xx for up to 3 attempts; this stops the
  // retry-storm from posting 3 countdowns.
  const { data: existing } = await supabase
    .from("social_post_log")
    .select("id, external_id")
    .eq("channel", "x")
    .eq("template", "countdown")
    .eq("week_id", week.id)
    .eq("status", "posted")
    .maybeSingle();

  if (existing) {
    await writeHeartbeat(supabase, "post-countdown");
    return NextResponse.json({
      skipped: "already-posted",
      weekId: week.id,
      externalId: existing.external_id,
    });
  }

  // Count scored/queued/building/built ideas in the open week.
  const { count: pitchCount } = await supabase
    .from("ideas")
    .select("id", { count: "exact", head: true })
    .eq("week_id", week.id)
    .in("status", IN_PLAY_STATUSES as unknown as string[]);

  const hoursLeft = hoursUntil(new Date(week.end_at), new Date());
  const text = formatTweet(hoursLeft, pitchCount ?? 0);

  const creds = readXCredsFromEnv();
  if (!creds) {
    // Fail-soft when creds aren't configured yet — log a dry-run and
    // return 200 so Vercel Cron doesn't retry-spam. Don't write a
    // social_post_log row either: this run never attempted a tweet.
    console.warn("[cron/post-countdown] X creds not configured; dry-run only", {
      weekId: week.id,
      text,
    });
    await writeHeartbeat(supabase, "post-countdown");
    return NextResponse.json({
      skipped: "missing-x-creds",
      weekId: week.id,
      text,
    });
  }

  try {
    const result = await postTweet(text, creds);
    await supabase.from("social_post_log").insert({
      channel: "x",
      template: "countdown",
      week_id: week.id,
      idea_id: null,
      external_id: result.id,
      body: text,
      status: "posted",
    });
    await writeHeartbeat(supabase, "post-countdown");
    return NextResponse.json({
      posted: true,
      externalId: result.id,
      weekId: week.id,
    });
  } catch (e) {
    const message = (e as Error).message;
    console.error("[cron/post-countdown] X post failed", e);
    await supabase.from("social_post_log").insert({
      channel: "x",
      template: "countdown",
      week_id: week.id,
      idea_id: null,
      external_id: null,
      body: text,
      status: "failed",
      error: message,
    });
    // Return 200 with posted:false so Vercel doesn't retry-spam (and
    // double-tweet if X recovered between attempts). The cron ran end-to-end
    // even though the tweet failed, so this still counts as a heartbeat —
    // record an 'error' so the alert-silence route can see degraded health.
    await writeHeartbeat(supabase, "post-countdown", "error", message);
    return NextResponse.json({ posted: false, error: message, weekId: week.id });
  }
}
