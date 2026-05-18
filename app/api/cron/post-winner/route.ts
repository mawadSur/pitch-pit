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
  const voteLine = idea.vote_count != null ? `votes: ${idea.vote_count}` : null;
  const finalLine =
    idea.final_score != null ? `final: ${idea.final_score}/100` : null;
  const stats = [aiLine, voteLine, finalLine].filter(Boolean).join(" · ");

  return [
    `this week's winner: ${idea.title}`,
    "",
    stats,
    "",
    "building it now. drop yours for next week ↓",
    url,
  ].join("\n");
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  if (!week) {
    await writeHeartbeat(supabase, "post-winner");
    return NextResponse.json({ skipped: "no-closed-week-with-winner" });
  }

  const eventKey = `winner-week-${week.week_number}`;

  // Idempotency: one winner tweet per week. We check the structured
  // social_post_log first — keyed by (channel, template, week_id) — so a
  // cron retry can't double-tweet even if the legacy social_posts row got
  // pruned.
  const { data: existingLog } = await supabase
    .from("social_post_log")
    .select("id, external_id")
    .eq("channel", "x")
    .eq("template", "winner")
    .eq("week_id", week.id)
    .eq("status", "posted")
    .maybeSingle();

  if (existingLog) {
    await writeHeartbeat(supabase, "post-winner");
    return NextResponse.json({
      skipped: "already-posted",
      eventKey,
      externalId: existingLog.external_id,
    });
  }

  // Belt-and-suspenders: also honour the legacy social_posts ledger so
  // pre-existing rows (before the log migration shipped) still block a
  // second tweet.
  const { data: existing } = await supabase
    .from("social_posts")
    .select("id, external_id")
    .eq("channel", "x")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existing) {
    await writeHeartbeat(supabase, "post-winner");
    return NextResponse.json({ skipped: "already-posted", eventKey });
  }

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, score, final_score, vote_count")
    .eq("id", week.winner_idea_id)
    .maybeSingle();

  if (!idea) {
    await writeHeartbeat(supabase, "post-winner");
    return NextResponse.json({ skipped: "winner-idea-missing" });
  }

  const text = formatTweet(idea);

  const creds = readXCredsFromEnv();
  if (!creds) {
    // Fail-soft: if creds aren't configured yet, log the would-be tweet and
    // return 200 so Vercel Cron doesn't retry-spam. Set creds in env to enable.
    console.warn("[cron/post-winner] X creds not configured; dry-run only", {
      eventKey,
      text,
    });
    await writeHeartbeat(supabase, "post-winner");
    return NextResponse.json({ skipped: "missing-x-creds", eventKey, text });
  }

  let externalId: string | null = null;
  try {
    const result = await postTweet(text, creds);
    externalId = result.id;
  } catch (e) {
    const message = (e as Error).message;
    console.error("[cron/post-winner] X post failed", e);
    Sentry.captureException(e, {
      tags: { feature: "social-post", channel: "x", template: "winner" },
      extra: { eventKey, ideaId: idea?.id, weekNumber: week.week_number },
    });
    // Record the failed attempt so we have forensics on X outages.
    // No social_posts row — we only "consume" the event_key on success
    // so a future retry can still go out once X recovers.
    await supabase.from("social_post_log").insert({
      channel: "x",
      template: "winner",
      week_id: week.id,
      idea_id: idea.id,
      external_id: null,
      body: text,
      status: "failed",
      error: message,
    });
    await writeHeartbeat(supabase, "post-winner", "error", message);
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
    template: "winner",
    week_id: week.id,
    idea_id: idea.id,
    external_id: externalId,
    body: text,
    status: "posted",
  });

  await writeHeartbeat(supabase, "post-winner");
  return NextResponse.json({ posted: true, externalId, eventKey });
}
