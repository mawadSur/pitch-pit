import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { postTweet, readXCredsFromEnv } from "@/lib/social/x";
import { titleToSlug } from "@/lib/slug";
import { verifyCronAuth } from "@/lib/cron-auth";
import { writeHeartbeat } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pitchpit.app";

// Days (in UTC) on which the leader tweet should fire.
// Sun=0, Thu=4, Sat=6 — three weekly advertising beats during the open week.
// The Vercel cron fires daily; this filter is what shapes the cadence.
const POST_DAYS_UTC = new Set([0, 4, 6]);

function formatTweet(idea: {
  title: string;
  score: number | null;
  vote_count: number | null;
  final_score: number | null;
  id: string;
}): string {
  const slug = titleToSlug(idea.title);
  const url = slug
    ? `${SITE_URL}/idea/${idea.id}/${slug}`
    : `${SITE_URL}/idea/${idea.id}`;

  const aiLine = idea.score != null ? `ai: ${idea.score}/10` : null;
  const voteLine =
    idea.vote_count != null ? `${idea.vote_count} votes` : null;
  const finalLine =
    idea.final_score != null ? `${idea.final_score}/100` : null;
  const stats = [aiLine, voteLine, finalLine].filter(Boolean).join(" · ");

  return [
    "currently leading the pit ↓",
    "",
    idea.title,
    stats,
    "",
    "knock it off the throne or push it higher.",
    url,
  ].join("\n");
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  if (!POST_DAYS_UTC.has(dayOfWeek)) {
    await writeHeartbeat(supabase, "post-leader");
    return NextResponse.json({ skipped: "not-a-post-day", dayOfWeek });
  }

  // Open week (the one currently accepting votes)
  const { data: week } = await supabase
    .from("weeks")
    .select("id, week_number")
    .eq("status", "open")
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!week) {
    await writeHeartbeat(supabase, "post-leader");
    return NextResponse.json({ skipped: "no-open-week" });
  }

  // Top idea in the open week — match the leaderboard sort exactly:
  // final_score desc nulls last, score desc, vote_count desc, oldest wins ties.
  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, score, final_score, vote_count")
    .eq("week_id", week.id)
    .in("status", ["scored", "queued", "building", "built"])
    .order("final_score", { ascending: false, nullsFirst: false })
    .order("score", { ascending: false, nullsFirst: false })
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!idea) {
    await writeHeartbeat(supabase, "post-leader");
    return NextResponse.json({ skipped: "no-leader-yet" });
  }

  // Idempotency: one leader post per (week × UTC date). Daily cron fires
  // get filtered to Sun/Thu/Sat above, so we expect 3 rows per open week.
  // Date in the key prevents double-posting if a single day fires twice
  // (Vercel cron retries on non-2xx), while still allowing the next post day.
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const eventKey = `current-leader-week-${week.week_number}-${today}`;

  const { data: existing } = await supabase
    .from("social_posts")
    .select("id, external_id")
    .eq("channel", "x")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existing) {
    await writeHeartbeat(supabase, "post-leader");
    return NextResponse.json({ skipped: "already-posted", eventKey });
  }

  const text = formatTweet(idea);

  const creds = readXCredsFromEnv();
  if (!creds) {
    console.warn("[cron/post-leader] X creds not configured; dry-run only", {
      eventKey,
      text,
    });
    await writeHeartbeat(supabase, "post-leader");
    return NextResponse.json({ skipped: "missing-x-creds", eventKey, text });
  }

  let externalId: string | null = null;
  try {
    const result = await postTweet(text, creds);
    externalId = result.id;
  } catch (e) {
    const message = (e as Error).message;
    console.error("[cron/post-leader] X post failed", e);
    Sentry.captureException(e, {
      tags: { feature: "social-post", channel: "x", template: "leader" },
      extra: { eventKey, ideaId: idea?.id, weekNumber: week.week_number },
    });
    // Record the failed attempt in the structured log so an operator can
    // see X outages without grepping Vercel logs. social_posts stays
    // unwritten — its (channel, event_key) row is the idempotency token,
    // and we want a retry to still go out today if X recovers.
    await supabase.from("social_post_log").insert({
      channel: "x",
      template: "leader",
      week_id: week.id,
      idea_id: idea.id,
      external_id: null,
      body: text,
      status: "failed",
      error: message,
    });
    await writeHeartbeat(supabase, "post-leader", "error", message);
    return NextResponse.json(
      { error: "x-post-failed", message },
      { status: 500 },
    );
  }

  await supabase.from("social_posts").insert({
    channel: "x",
    event_key: eventKey,
    external_id: externalId,
    payload: { text, ideaId: idea.id, weekNumber: week.week_number },
  });

  await supabase.from("social_post_log").insert({
    channel: "x",
    template: "leader",
    week_id: week.id,
    idea_id: idea.id,
    external_id: externalId,
    body: text,
    status: "posted",
  });

  await writeHeartbeat(supabase, "post-leader");
  return NextResponse.json({ posted: true, externalId, eventKey });
}
