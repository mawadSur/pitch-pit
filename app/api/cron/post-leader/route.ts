import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postTweet, readXCredsFromEnv } from "@/lib/social/x";
import { titleToSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pitchpit.app";

function verifyCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

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

  // Open week (the one currently accepting votes)
  const { data: week } = await supabase
    .from("weeks")
    .select("id, week_number")
    .eq("status", "open")
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!week) {
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
    return NextResponse.json({ skipped: "no-leader-yet" });
  }

  // Idempotency: one leader post per week. If you want one per leader change,
  // include the idea id in the key — but that risks tweet spam when leaders
  // flip-flop, so we keep it to one per week.
  const eventKey = `current-leader-week-${week.week_number}`;

  const { data: existing } = await supabase
    .from("social_posts")
    .select("id, external_id")
    .eq("channel", "x")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ skipped: "already-posted", eventKey });
  }

  const text = formatTweet(idea);

  const creds = readXCredsFromEnv();
  if (!creds) {
    console.warn("[cron/post-leader] X creds not configured; dry-run only", {
      eventKey,
      text,
    });
    return NextResponse.json({ skipped: "missing-x-creds", eventKey, text });
  }

  let externalId: string | null = null;
  try {
    const result = await postTweet(text, creds);
    externalId = result.id;
  } catch (e) {
    console.error("[cron/post-leader] X post failed", e);
    return NextResponse.json(
      { error: "x-post-failed", message: (e as Error).message },
      { status: 500 },
    );
  }

  await supabase.from("social_posts").insert({
    channel: "x",
    event_key: eventKey,
    external_id: externalId,
    payload: { text, ideaId: idea.id, weekNumber: week.week_number },
  });

  return NextResponse.json({ posted: true, externalId, eventKey });
}
