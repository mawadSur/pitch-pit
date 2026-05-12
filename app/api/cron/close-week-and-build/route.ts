import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBuildNotification } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verifyCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 1. Idempotently close the current open week. This Postgres function picks
  //    the highest-final_score idea as winner_idea_id and opens a fresh week.
  //    Safe to call repeatedly — no-op if no open week.
  const { error: rpcErr } = await supabase.rpc("close_current_week");
  if (rpcErr) {
    return NextResponse.json(
      { error: "close_current_week-failed", message: rpcErr.message },
      { status: 500 },
    );
  }

  // 2. Find the most-recent closed week that has a winner picked.
  const { data: closedWeek } = await supabase
    .from("weeks")
    .select("id, week_number, winner_idea_id")
    .eq("status", "closed")
    .not("winner_idea_id", "is", null)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!closedWeek || !closedWeek.winner_idea_id) {
    return NextResponse.json({ skipped: "no-closed-week-with-winner" });
  }

  // 3. Fetch the winner idea in full.
  const { data: idea, error: ideaFetchErr } = await supabase
    .from("ideas")
    .select(
      "id, title, pitch, score, final_score, verdict, strengths, concerns, reasoning, status",
    )
    .eq("id", closedWeek.winner_idea_id)
    .single();

  if (ideaFetchErr || !idea) {
    return NextResponse.json(
      { error: "winner-fetch-failed", message: ideaFetchErr?.message },
      { status: 500 },
    );
  }

  // 4. Idempotency: if the winner is already in build/built state, don't
  //    re-transition and don't re-email.
  if (idea.status === "building" || idea.status === "built") {
    return NextResponse.json({
      closed: closedWeek.week_number,
      winner: { id: idea.id, title: idea.title, status: idea.status },
      email_sent: false,
      note: "already-building-or-built",
    });
  }

  // 5. Advance winner status to 'building'.
  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({ status: "building" })
    .eq("id", idea.id);
  if (ideaErr) {
    return NextResponse.json(
      { error: "update-idea-failed", message: ideaErr.message },
      { status: 500 },
    );
  }

  // 6. Upsert into build_queue with in_progress + timestamps.
  const { error: queueErr } = await supabase.from("build_queue").upsert(
    {
      idea_id: idea.id,
      status: "in_progress",
      approved_at: now,
      started_at: now,
    },
    { onConflict: "idea_id" },
  );
  if (queueErr) {
    return NextResponse.json(
      { error: "queue-failed", message: queueErr.message },
      { status: 500 },
    );
  }

  // 7. Send the build-notification email. Best-effort — log on failure.
  let emailSent = false;
  try {
    await sendBuildNotification(idea);
    emailSent = true;
  } catch (err) {
    console.error("[close-week-and-build] Email send failed:", err);
  }

  return NextResponse.json({
    closed: closedWeek.week_number,
    winner: {
      id: idea.id,
      title: idea.title,
      final_score: idea.final_score,
    },
    email_sent: emailSent,
  });
}
